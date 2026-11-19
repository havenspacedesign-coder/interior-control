// Starts visible cards first. Off-screen cards do not consume network slots.
export function observePhotoCards({root,files,loader,readSession,isCurrent,onError,onReport=report=>console.info('[AI 照片效能]',JSON.stringify(report)),startedAt=performance.now()}){
  const images=[...root.querySelectorAll('[data-photo-id]')],started=new Set(),settled=new Set();
  const fileMap=new Map(files.map(file=>[file.id,file]));
  let observer=null,closed=false,firstBatch=null,loaded=0,failed=0,firstBatchMs=null,allLoadedMs=null;
  const visible=img=>{const r=img.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<window.innerHeight;};
  const active=()=>!closed&&isCurrent();
  const thumbnailCount=images.filter(img=>fileMap.get(img.dataset.photoId)?.thumbnailPath).length;
  const emit=()=>onReport({permissionQueries:readSession.permissionQueries||0,permissionScope:'僅照片讀取權限查詢，不含案件資料載入及其他操作',photoCount:images.length,thumbnailCount,concurrency:8,loaded,failed,deferred:images.length-started.size,firstBatchSize:firstBatch?.size||0,firstBatchMs,allLoadedMs,timingNote:'自照片載入開始計時；全部完成時間包含捲動等待，null 表示尚未完成；失敗張數請同時參照 failed'});
  async function start(img){
    if(started.has(img)||!active())return;
    if(!firstBatch){const first=images.filter(visible).slice(0,8);firstBatch=new Set(first.length?first:[img]);}
    started.add(img);observer?.unobserve(img);
    try{
      const file=fileMap.get(img.dataset.photoId);if(!file)throw Error('照片資料已變更。');
      const url=await loader.load(file,active,path=>readSession.getBlob(path));
      if(!active())return;
      img.src=url;
      await img.decode();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(!active())return;
      loaded++;
    }catch(error){if(active()&&error.code!=='aidb/cancelled'){failed++;img.alt='照片暫時無法讀取';onError(error);}}
    finally{
      if(active()){
        settled.add(img);
        if(firstBatchMs===null&&[...firstBatch].every(img=>settled.has(img)))firstBatchMs=Math.round(performance.now()-startedAt);
        if(settled.size===images.length)allLoadedMs=Math.round(performance.now()-startedAt);
        emit();
      }
    }
  }
  if(typeof IntersectionObserver==='function')observer=new IntersectionObserver(entries=>{
    entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top).forEach(entry=>void start(entry.target));
  },{rootMargin:'200px 0px'});
  images.filter(visible).forEach(img=>void start(img));
  images.filter(img=>!started.has(img)).forEach(img=>observer?observer.observe(img):void start(img));
  if(!images.length)allLoadedMs=0;
  emit();
  return ()=>{closed=true;observer?.disconnect();};
}
