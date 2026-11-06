import {FILE_TYPES,newId} from './model.js';
export async function validateFile(file,kind){
  if(!FILE_TYPES[kind])throw Error('檔案類型不正確。');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  if(kind!=='photo'){
    if(file.size>50*1024*1024||!file.name.toLowerCase().endsWith('.pdf')||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('請選擇有效的 PDF，單份不可超過 50 MB。');
    return 'application/pdf';
  }
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  if(file.size>20*1024*1024||!((jpeg&&file.type==='image/jpeg')||(png&&file.type==='image/png')||(webp&&file.type==='image/webp')))throw Error('照片限 JPG、PNG、WebP，單張不可超過 20 MB。');
  return file.type;
}
export async function uploadCaseFiles(context,caseId,kind,files,replaceId=''){
  if(kind!=='photo'&&files.length!==1)throw Error('每個 PDF 類型請一次選擇一份。');
  // Validate the entire selection before creating any stored object.
  const types=await Promise.all(files.map(file=>validateFile(file,kind)));
  for(let i=0;i<files.length;i++){
    const file=files[i],id=newId(),storagePath=`aiDatabaseTest/cases/${caseId}/${id}`;
    await context.store.putBlob(storagePath,file,types[i]);
    try{await context.commit({type:'file.add',payload:{id:caseId,replaceId,file:{id,caseId,kind,storagePath,name:file.name,size:file.size,mime:types[i],caption:'',version:1}}});}
    catch(error){try{await context.store.deleteBlob(storagePath);}catch{error.message+=' 上傳檔案清理失敗，請管理員檢查此路徑：'+storagePath;}throw error;}
  }
  await cleanupFiles(context);
}
export async function cleanupFiles(context){
  const paths=[...context.state.cleanupPaths];if(!paths.length)return;
  const done=[];for(const path of paths){try{await context.store.deleteBlob(path);done.push(path);}catch{/* Keep persistent cleanup intent for an administrator to retry. */}}
  if(done.length)await context.commit({type:'cleanup.done',payload:{paths:done}});
}
export async function openFile(store,file,download=false){
  const blob=await store.getBlob(file.storagePath),url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.rel='noopener';if(download)link.download=file.name;else link.target='_blank';document.body.append(link);link.click();link.remove();
  // Allows the new viewer sufficient time to consume a PDF or photo.
  setTimeout(()=>URL.revokeObjectURL(url),120000);
}
