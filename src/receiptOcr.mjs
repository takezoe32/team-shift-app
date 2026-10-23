import { receiptNameRegions, selectReceiptNameCandidates } from './receiptNameOcr.mjs';
import { parseReceiptText, receiptSummary } from './receiptImport.mjs';
import { prepareReceiptCanvas } from './receiptImage.mjs';
/** Derive a second OCR pass from detected text positions, with no store-specific coordinates. */
export function receiptFocusRectangle(tsv,width,height) {
  const groups=new Map();
  for(const row of String(tsv || '').split(/\r?\n/)){
    const c=row.split('\t');if(c[0]!=='5' || !c[11]?.trim())continue;
    const key=c.slice(1,5).join('-'),top=Number(c[7]),bottom=top+Number(c[9]);
    if(!Number.isFinite(top+bottom))continue;
    if(!groups.has(key))groups.set(key,{top,bottom,text:''});
    const line=groups.get(key);line.text+=c.slice(11).join('');line.top=Math.min(line.top,top);line.bottom=Math.max(line.bottom,bottom);
  }
  const lines=[...groups.values()].sort((a,b)=>a.top-b.top);
  const start=lines.find(l=>/株式会社|ナフコ|コーナン/.test(l.text));
  const end=lines.find(l=>/^(?:税込)?合計|^小計金額/.test(l.text) && !/ポイント/.test(l.text));
  if(!start || !end || end.top<=start.top)return null;
  const top=Math.max(0,start.top-45),bottom=Math.min(height,end.bottom+Math.round(width*.3));
  if(bottom-top<height*.2 || bottom-top>height*.95)return null;
  return {left:0,top,width,height:bottom-top};
}
export function selectReceiptReading(readings) {
  const score=reading=>{
    const p=parseReceiptText(reading.text),s=receiptSummary(p.rows,p.total);
    return p.rows.filter(r=>r.amount!=='').length*10+p.rows.filter(r=>r.code).length*3+(p.date?4:0)+(p.total?4:0)+(s.total!==null && s.difference===0?30:0)-p.rows.filter(r=>r.amount==='').length*12;
  };
  return readings.reduce((best,reading)=>score(reading)>=score(best)?reading:best);
}
export function receiptPriceWords(tsv,width) {
  const groups=new Map();
  for(const row of String(tsv||'').split(/\r?\n/)){
    const c=row.split('\t');if(c[0]!=='5'||!c[11]?.trim())continue;
    const key=c.slice(1,5).join('-');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({text:c[11],left:+c[6],top:+c[7],width:+c[8],height:+c[9]});
  }
  const result=[];
  for(const words of groups.values()){
    const suffix=words.find(w=>w.text==='内' || w.text==='外');
    if(!suffix)continue;
    // Only isolated right-hand item amounts, never product codes or quantities.
    for(const word of words){
      if(!/^\d[\d,.]*$/.test(word.text)||word.left<width*.55||word.left>=suffix.left)continue;
      const right=Math.min(word.left+word.width,suffix.left-4);
      if(right-word.left<3 || word.height<3)continue;
      result.push({...word,right});
    }
  }
  return result;
}
export async function recognizeReceiptImage(worker,image,bounds,{alive=()=>true,onStage=()=>{},makeCanvas=()=>document.createElement('canvas')}={}) {
  const sourceWidth=bounds.right-bounds.left,sourceHeight=bounds.bottom-bounds.top;
  const ratio=Math.min(1,1000/sourceWidth,6000/sourceHeight);
  const coarse=makeCanvas();coarse.width=Math.max(1,Math.round(sourceWidth*ratio));coarse.height=Math.max(1,Math.round(sourceHeight*ratio));
  const cc=coarse.getContext('2d');if(!cc)throw new Error('画像を準備できません。');
  cc.drawImage(image,bounds.left,bounds.top,sourceWidth,sourceHeight,0,0,coarse.width,coarse.height);
  const first=(await worker.recognize(coarse,{}, {text:true,tsv:true})).data;if(!alive())return null;
  const rectangle=receiptFocusRectangle(first.tsv,coarse.width,coarse.height);
  const focused=rectangle ? {...bounds,top:bounds.top+rectangle.top/ratio,bottom:bounds.top+(rectangle.top+rectangle.height)/ratio} : bounds;
  onStage('背景・明るさを補正して、商品明細を再確認しています…');
  const canvas=prepareReceiptCanvas(image,focused,makeCanvas);
  const second=(await worker.recognize(canvas,{}, {text:true,tsv:true})).data;if(!alive())return null;
  const readings=[first,second];
  const priceWords=receiptPriceWords(first.tsv,coarse.width).slice(0,40);
  if(priceWords.length){
    onStage('金額の数字を再確認しています…');
    await worker.reinitialize('eng');if(!alive())return null;
    await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789,.',preserve_interword_spaces:'1'});
    const correctedLines=first.text.split(/\r?\n/);let cursor=0;
    for(const word of priceWords){
      if(!alive())return null;
      const margin=4,x=bounds.left+(word.left-margin)/ratio,y=bounds.top+(word.top-margin)/ratio;
      const width=(word.right-word.left+margin)/ratio,height=(word.height+margin*2)/ratio;
      const scale=Math.min(4,1500/width),numeric=makeCanvas();numeric.width=Math.ceil(width*scale)+40;numeric.height=Math.ceil(height*scale)+40;
      const context=numeric.getContext('2d');if(!context)throw new Error('画像を準備できません。');
      context.fillStyle='#fff';context.fillRect(0,0,numeric.width,numeric.height);context.imageSmoothingQuality='high';context.drawImage(image,x,y,width,height,20,20,width*scale,height*scale);
      const {data}=await worker.recognize(numeric);if(!alive())return null;
      const digits=data.text.trim();
      // Replace only a complete OCR number that was actually read again.
      if(!/^\d+(?:[,.]\d{3})*$/.test(digits))continue;
      const index=correctedLines.findIndex((line,index)=>index>=cursor && line.trim().match(/^([0-9,.]+)\s*(?:内|外)$/)?.[1]===word.text);
      if(index>=0){correctedLines[index]=correctedLines[index].replace(word.text,digits);cursor=index+1;}
    }
    readings.push({...first,text:correctedLines.join('\n')});
  }
  const selected=selectReceiptReading(readings);
  const regions=receiptNameRegions(first.tsv,coarse.width,coarse.height).slice(0,25);
  const nameReadings={};
  if(regions.length){
    onStage('商品名を日本語優先で読み直しています…');
    await worker.reinitialize('jpn');if(!alive())return null;
    await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'',preserve_interword_spaces:'1'});
    const parsed=parseReceiptText(selected.text);
    const latinRetries=[];
    for(const region of regions){
      if(!alive())return null;
      const row=parsed.rows.find(row=>row.code===region.code);if(!row)continue;
      const crop={left:bounds.left+region.left/ratio,right:bounds.left+region.right/ratio,top:bounds.top+region.top/ratio,bottom:bounds.top+region.bottom/ratio};
      const enhanced=prepareReceiptCanvas(image,crop,makeCanvas),attempts=[];
      const read=async(canvas,mode,version)=>{
        await worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:''});
        const {data}=await worker.recognize(canvas);if(!alive())return;
        attempts.push({text:String(data.text||'').trim(),confidence:data.confidence,mode,version,language:'jpn'});
      };
      await read(enhanced,'7','enhanced');if(!alive())return null;
      if(region.stripDepartment){
        await read(enhanced,'13','enhanced');if(!alive())return null;
        const width=crop.right-crop.left,height=crop.bottom-crop.top,raw=makeCanvas();
        raw.width=Math.ceil(width*2)+48;raw.height=Math.ceil(height*2)+48;
        const context=raw.getContext('2d');if(!context)throw new Error('画像を準備できません。');
        context.fillStyle='#fff';context.fillRect(0,0,raw.width,raw.height);context.imageSmoothingQuality='high';context.drawImage(image,crop.left,crop.top,width,height,24,24,width*2,height*2);
        await read(raw,'7','original');if(!alive())return null;
      }
      const result=selectReceiptNameCandidates(row.name,attempts);
      nameReadings[region.code]={...result,image:enhanced.toDataURL('image/jpeg',.85)};
      if(region.stripDepartment && !attempts.some(a=>a.confidence>=45))latinRetries.push({code:region.code,enhanced,attempts,original:row.name});
    }
    if(latinRetries.length){
      await worker.reinitialize('eng');if(!alive())return null;
      await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'',preserve_interword_spaces:'1'});
      for(const item of latinRetries){
        for(const ratio of [.45,.6]){
          if(!alive())return null;
          const canvas=makeCanvas();canvas.width=Math.round(item.enhanced.width*ratio);canvas.height=item.enhanced.height;
          const context=canvas.getContext('2d');if(!context)throw new Error('画像を準備できません。');
          context.imageSmoothingQuality='high';context.drawImage(item.enhanced,0,0,canvas.width,canvas.height);
          const {data}=await worker.recognize(canvas);if(!alive())return null;
          item.attempts.push({text:data.text,confidence:data.confidence,mode:'7',language:'eng'});
        }
        nameReadings[item.code]={...nameReadings[item.code],...selectReceiptNameCandidates(item.original,item.attempts)};
      }
    }
  }
  return {...selected,nameReadings};
}
