import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=new URL('../',import.meta.url);
const output=new URL('public/receipt-ocr/',root);
await mkdir(output,{recursive:true});
for(const [source,target] of [
 ['node_modules/tesseract.js/dist/worker.min.js','worker.min.js'],
 ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js','tesseract-core-lstm.wasm.js'],
 ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm','tesseract-core-lstm.wasm'],
 ['node_modules/tesseract.js/LICENSE.md','TESSERACT-JS-LICENSE.txt'],
 ['node_modules/tesseract.js-core/LICENSE','TESSERACT-CORE-LICENSE.txt']
])await copyFile(new URL(source,root),new URL(target,output));
const revision='e12c65a915945e4c28e237a9b52bc4a8f39a0cec';
for(const [language,hash] of [
 ['jpn','36bdf9ac823f5911e624c30d0553e890b8abc7c31a65b3ef14da943658c40b79'],
 ['eng','8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba']
]){
 const file=new URL(language+'.traineddata',output);
 let bytes;try{bytes=await readFile(file);}catch{/* Download public models only at build time. */}
 if(!bytes || createHash('sha256').update(bytes).digest('hex')!==hash){
  const response=await fetch('https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/'+revision+'/'+language+'.traineddata',{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error('OCR model download failed: '+response.status);
  bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==hash)throw new Error('OCR model checksum mismatch');
  await writeFile(file,bytes);
 }
 console.log('Receipt OCR model ready: '+language);
}
await writeFile(new URL('MODEL-SOURCE.txt',output),'Models: tesseract-ocr/tessdata_best, revision '+revision+'\nLicense: Apache-2.0\nhttps://github.com/tesseract-ocr/tessdata_best/blob/'+revision+'/LICENSE\n');
console.log('Local receipt OCR assets ready: '+fileURLToPath(output));

