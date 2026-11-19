import {photoThumbnail} from './photo-thumbnail.js';

const running=new WeakSet();
export async function scanPhotoThumbnails(store){
  const state=await store.load(),caseIds=new Set(state.cases.map(row=>row.id));
  const photos=state.files.filter(file=>file.kind==='photo'&&caseIds.has(file.caseId));
  const missing=photos.filter(file=>!file.thumbnailPath);
  return {total:photos.length,existing:photos.length-missing.length,missing:missing.length,fileIds:missing.map(file=>file.id)};
}
// Explicit maintenance operation only; never runs during normal page loading.
// A deterministic sibling path also allows an interrupted upload to be reused.
export async function backfillPhotoThumbnails(store,{onProgress=()=>{},fileIds,batchSize=5,shouldContinue=()=>true}={}){
  if(running.has(store))throw Error('縮圖補建已在執行中。');
  running.add(store);
  const report={found:0,success:0,skipped:0,failed:0,errors:[]};
  try{
    const snapshot=await store.load(),caseIds=new Set(snapshot.cases.map(row=>row.id));
    const selected=fileIds?new Set(fileIds):null;
    const photos=snapshot.files.filter(file=>file.kind==='photo'&&caseIds.has(file.caseId)&&(!selected||selected.has(file.id)));
    report.found=photos.length;
    batchSize=Math.max(1,Math.min(5,Math.floor(Number(batchSize))||5));
    onProgress(structuredClone(report));
    let processed=0;
    for(const original of photos){
      if(!shouldContinue()){report.paused=true;break;}
      if(processed&&processed%batchSize===0){await new Promise(resolve=>setTimeout(resolve,0));if(!shouldContinue()){report.paused=true;break;}}
      processed++;
      try{
        let state=await store.load();
        let file=state.files.find(row=>row.id===original.id&&row.caseId===original.caseId);
        if(!file||file.storagePath!==original.storagePath)throw Error('照片已移除或變更，未進行補建。');
        if(file.thumbnailPath){report.skipped++;onProgress(structuredClone(report));continue;}
        const thumbnailPath=file.storagePath+'_thumb.jpg';
        let thumbnail;
        try{thumbnail=await store.getBlob(thumbnailPath);}
        catch(error){if(error.code!=='storage/object-not-found')throw error;}
        if(!thumbnail){
          const source=await store.getBlob(file.storagePath);
          thumbnail=await photoThumbnail(source);
          // Recheck after decoding, before creating any object.
          state=await store.load();file=state.files.find(row=>row.id===original.id&&row.caseId===original.caseId);
          if(!file||file.storagePath!==original.storagePath)throw Error('照片資料已變更，未上傳縮圖。');
          if(file.thumbnailPath){report.skipped++;onProgress(structuredClone(report));continue;}
          try{await store.putBlob(thumbnailPath,thumbnail,'image/jpeg');}
          catch(error){
            // Another worker may have created this same deterministic object.
            // Do not overwrite/delete it; only reuse an already readable JPEG.
            try{const existing=await store.getBlob(thumbnailPath);if(existing.type!=='image/jpeg')throw error;}
            catch{throw error;}
          }
        }
        if(thumbnail.type!=='image/jpeg')throw Error('既有縮圖格式不正確，未覆蓋任何檔案。');
        let attached=false;
        for(let attempt=0;attempt<3;attempt++){
          state=await store.load();file=state.files.find(row=>row.id===original.id&&row.caseId===original.caseId);
          if(!file||file.storagePath!==original.storagePath)throw Error('照片資料已變更；縮圖保留供管理員檢查。');
          if(file.thumbnailPath){report.skipped++;attached=true;break;}
          try{
            await store.commit({type:'file.thumbnail',payload:{id:file.caseId,fileId:file.id,storagePath:file.storagePath,thumbnailPath}},state.revision);
            report.success++;attached=true;break;
          }catch(error){if(attempt===2)throw error;}
        }
        if(!attached)throw Error('縮圖資料尚未完成寫入。');
      }catch(error){report.failed++;report.errors.push({fileId:original.id,name:original.name,message:error.message});}
      onProgress(structuredClone(report));
    }
    return report;
  }finally{running.delete(store);}
}
