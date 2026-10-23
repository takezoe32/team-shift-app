/** Receipt pixels stay local. No network calls or persistent image storage. */
export function detectReceiptBounds({data,width,height}) {
  const scores=new Float64Array(width); const step=Math.max(1,Math.floor(height/500));
  let count=0;
  for(let y=0;y<height;y+=step){count++;for(let x=0;x<width;x++){
    const i=(y*width+x)*4, lo=Math.min(data[i],data[i+1],data[i+2]),hi=Math.max(data[i],data[i+1],data[i+2]);
    if(lo>120 && hi-lo<45)scores[x]++;
  }}
  const runs=[];let start=-1;
  for(let x=0;x<=width;x++){const good=x<width && scores[x]/count>.4;
    if(good && start<0)start=x;
    if(!good && start>=0){runs.push({left:start,right:x});start=-1;}
  }
  const run=runs.filter(r=>r.left<width*.65 && r.right>width*.35).sort((a,b)=>(b.right-b.left)-(a.right-a.left))[0];
  if(!run || run.right-run.left<width*.25)return {left:0,top:0,right:width,bottom:height};
  // Ignore individual dark printed rows; look for a sustained band of pale paper.
  const rowScores=[];const margin=Math.round((run.right-run.left)*.05);
  for(let y=0;y<height;y++){let pale=0;for(let x=run.left+margin;x<run.right-margin;x+=3){
    const i=(y*width+x)*4; if(Math.min(data[i],data[i+1],data[i+2])>110 && Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])<50)pale++;
  }rowScores.push(pale/Math.max(1,Math.ceil((run.right-run.left-margin*2)/3)));}
  let top=0,bottom=height;
  for(let y=0;y<height-12;y++)if(rowScores.slice(y,y+12).filter(v=>v>.55).length>=10){top=Math.max(0,y-5);break;}
  for(let y=height-1;y>top+12;y--)if(rowScores.slice(y-11,y+1).filter(v=>v>.55).length>=10){bottom=Math.min(height,y+6);break;}
  const inset=run.right-run.left>width*.92 ? 0 : Math.max(2,Math.round((run.right-run.left)*.012));
  return {left:run.left+inset,right:run.right-inset,top,bottom};
}

export function enhanceReceiptPixels(image,mode='contrast') {
  const {data}=image,luminance=new Uint8Array(data.length/4);let low=255,high=0,total=0;
  for(let i=0,j=0;i<data.length;i+=4,j++){const v=Math.round(data[i]*.299+data[i+1]*.587+data[i+2]*.114);luminance[j]=v;low=Math.min(low,v);high=Math.max(high,v);total+=v;}
  const mean=Math.round(total/luminance.length);
  for(let i=0,j=0;i<data.length;i+=4,j++){const v=Math.max(0,Math.min(255,mode==='normalize' ? high===low ? luminance[j] : (luminance[j]-low)*255/(high-low) : (luminance[j]-mean)*1.4+mean));data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;}
  return image;
}
export function prepareReceiptCanvas(image, bounds, makeCanvas=()=>document.createElement('canvas')) {
  const width=Math.max(1,bounds.right-bounds.left),height=Math.max(1,bounds.bottom-bounds.top);
  const scale=Math.min(3,2000/width,Math.sqrt(14000000/(width*height)),12000/height),border=24;
  const source=makeCanvas();source.width=width;source.height=height;
  const sourceContext=source.getContext('2d',{willReadFrequently:true});if(!sourceContext)throw new Error('画像を準備できません。');
  sourceContext.drawImage(image,bounds.left,bounds.top,width,height,0,0,width,height);
  sourceContext.putImageData(enhanceReceiptPixels(sourceContext.getImageData(0,0,width,height),'normalize'),0,0);
  const scaled=makeCanvas();scaled.width=Math.max(1,Math.round(width*scale));scaled.height=Math.max(1,Math.round(height*scale));
  const scaledContext=scaled.getContext('2d',{willReadFrequently:true});if(!scaledContext)throw new Error('画像を準備できません。');
  scaledContext.imageSmoothingEnabled=true;scaledContext.imageSmoothingQuality='high';
  scaledContext.drawImage(source,0,0,scaled.width,scaled.height);
  scaledContext.putImageData(enhanceReceiptPixels(scaledContext.getImageData(0,0,scaled.width,scaled.height)),0,0);
  const canvas=makeCanvas();canvas.width=scaled.width+border*2;canvas.height=scaled.height+border*2;
  const context=canvas.getContext('2d');if(!context)throw new Error('画像を準備できません。');
  context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(scaled,border,border);
  return canvas;
}
