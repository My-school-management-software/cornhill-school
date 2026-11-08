/* CORNHILL Records Centre PDF OCR enhancement.
   This extension is injected only into the authenticated main-school shell.
   PDF bytes are fetched from a short-lived private Storage URL and processed
   in the browser. No document is sent to an external OCR service. */
(function(){
 'use strict';
 if(window.cornhillPdfOcrEnhancementLoaded)return;
 window.cornhillPdfOcrEnhancementLoaded=true;

 function setButton(button,text){if(button)button.textContent=text}
 function loadScript(src,test){
  if(test())return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=src;script.async=true;
   script.onload=()=>test()?resolve():reject(new Error('Library loaded but did not initialise.'));
   script.onerror=()=>reject(new Error('Could not load document-reading library. Connect to the internet and retry.'));
   document.head.appendChild(script);
  });
 }
 async function getPdfJs(){
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',()=>!!window.pdfjsLib);
  if(window.pdfjsLib.GlobalWorkerOptions){
   window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  return window.pdfjsLib;
 }
 async function getTesseract(){
  await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',()=>!!window.Tesseract);
  return window.Tesseract;
 }
 const original=window.runRecordIndexOcr;
 if(typeof original!=='function')return;

 window.runRecordIndexOcr=async function(id,button){
  const row=(window.cornhillDocumentIndex||[]).find(item=>item.id===id);
  if(!row||row.content_type!=='application/pdf')return original.call(this,id,button);
  if(window.cornhillPdfOcrBusy)return;
  window.cornhillPdfOcrBusy=true;
  if(button){button.disabled=true;setButton(button,'Preparing PDF…')}
  try{
   const {data:signed,error:signedError}=await db.storage.from('cornhill-private-evidence').createSignedUrl(row.storage_path,300);
   if(signedError||!signed?.signedUrl)throw signedError||new Error('The private PDF link could not be created.');
   const response=await fetch(signed.signedUrl);
   if(!response.ok)throw new Error('The private PDF could not be downloaded.');
   const bytes=await response.arrayBuffer();
   const pdfjs=await getPdfJs();
   const pdf=await pdfjs.getDocument({data:bytes}).promise;
   if(pdf.numPages>20)throw new Error('This OCR pass is limited to 20 pages. Split a larger document into sections.');
   const Tesseract=await getTesseract();
   let extracted='';
   for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
    if(button)setButton(button,'Reading '+pageNumber+'/'+pdf.numPages+'…');
    const page=await pdf.getPage(pageNumber);
    const viewport=page.getViewport({scale:1.55});
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const context=canvas.getContext('2d',{willReadFrequently:true});
    await page.render({canvasContext:context,viewport}).promise;
    const result=await Tesseract.recognize(canvas,'eng');
    const text=String(result?.data?.text||'').trim();
    if(text)extracted+='\n\n[Page '+pageNumber+']\n'+text;
    page.cleanup?.();
    canvas.width=1;canvas.height=1;
   }
   extracted=extracted.trim();
   if(!extracted)throw new Error('No readable text was found. Try a clearer scan or use manual entry.');
   const dates=[...new Set(extracted.match(/\b(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/g)||[])].slice(0,30);
   const identifiers=[...new Set(extracted.match(/\b[A-Z0-9][A-Z0-9\/-]{5,24}\b/gi)||[])].slice(0,40);
   const amounts=[...new Set(extracted.match(/(?:UGX|UShs?|Shs?)\s*[\d,]+/gi)||[])].slice(0,30);
   const {error:saveError}=await db.rpc('save_school_record_ocr_text',{
    p_evidence_file_id:row.evidence_file_id,
    p_extracted_text:extracted,
    p_extracted_fields:{candidate_dates:dates,candidate_identifiers:identifiers,candidate_amounts:amounts,review_required:true,source:'pdfjs+tesseract'}
   });
   if(saveError)throw saveError;
   message('reportsMsg','PDF text extracted from '+pdf.numPages+' page(s) and saved in the document index. Check suggested numbers and dates against the original before verification.');
   await loadSchoolDocumentRegister();
  }catch(error){
   message('reportsMsg','PDF OCR did not finish: '+(error?.message||'Please try again.'),true);
  }finally{
   window.cornhillPdfOcrBusy=false;
   if(button){button.disabled=false;setButton(button,'Extract text')}
  }
 };
})();
