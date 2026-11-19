import {scanPhotoThumbnails,backfillPhotoThumbnails} from './thumbnail-backfill.js';

export function openThumbnailMaintenance(root,store,session,onClose=()=>{}){
  if(!session.canManage())return null;
  const dialog=document.createElement('dialog');dialog.className='aidb-dialog';
  dialog.innerHTML=`<h2>照片縮圖管理工具</h2><p>先掃描全部案件的完工照片。掃描只讀取資料，不下載照片或修改資料。</p><p>${store.mode==='production'?'正式 Firebase｜限管理員操作':'本機／隔離測試資料'}</p><button class="btn" data-scan>掃描照片（不修改資料）</button><p data-scan-result role="status">尚未掃描</p><p>補建只新增缺少的 480px JPEG 縮圖與 thumbnailPath，保留原圖、備註及案件內容。每批最多 5 張，逐張處理。</p><div class="aidb-actions"><button class="btn btn-p" data-start disabled>開始補建縮圖</button><button class="btn" data-stop disabled>停止（完成目前照片後）</button><button class="btn" data-close>關閉</button></div><p data-progress role="status" aria-live="polite"></p><pre data-errors style="white-space:pre-wrap;overflow-wrap:anywhere" role="alert"></pre>`;
  root.append(dialog);
  const scanButton=dialog.querySelector('[data-scan]'),startButton=dialog.querySelector('[data-start]'),stopButton=dialog.querySelector('[data-stop]'),closeButton=dialog.querySelector('[data-close]');
  const scanText=dialog.querySelector('[data-scan-result]'),progress=dialog.querySelector('[data-progress]'),errors=dialog.querySelector('[data-errors]');
  let scan=null,working=false,stopped=false,disposed=false;
  const allowed=()=>!disposed&&session.canManage();
  function controls(){
    scanButton.disabled=working||!allowed();startButton.disabled=working||!allowed()||!scan?.missing;
    stopButton.disabled=!working||!scan||stopped;closeButton.disabled=working;
  }
  function showReport(report){
    if(disposed)return;
    const done=report.success+report.skipped+report.failed;
    progress.textContent=`${report.paused?'已停止，可重新掃描後續跑。 ':''}已完成 ${done} / 總共 ${report.found}｜成功 ${report.success}｜跳過 ${report.skipped}｜失敗 ${report.failed}`;
    errors.textContent=report.errors.map(error=>`${error.name||error.fileId}：${error.message}`).join('\n');
  }
  scanButton.onclick=async()=>{
    if(working||!allowed())return;
    working=true;scan=null;controls();scanText.textContent='掃描中…';errors.textContent='';progress.textContent='';
    try{
      const result=await scanPhotoThumbnails(store);
      if(!allowed())throw Error('管理員權限已失效。');
      scan=result;scanText.textContent=`照片總數 ${scan.total}｜已有 thumbnailPath ${scan.existing}｜缺少 thumbnailPath ${scan.missing}`;
    }catch(error){scan=null;errors.textContent=error.message;scanText.textContent='掃描未完成，尚未修改資料。';}
    finally{working=false;controls();}
  };
  startButton.onclick=async()=>{
    if(working||!scan?.missing||!allowed())return;
    working=true;stopped=false;controls();errors.textContent='';
    try{
      const report=await backfillPhotoThumbnails(store,{fileIds:scan.fileIds,batchSize:5,shouldContinue:()=>!stopped&&allowed(),onProgress:showReport});
      showReport(report);
      // A fresh scan is required before every run; never reuse stale selections.
      scan=null;
    }catch(error){errors.textContent=error.message;scan=null;}
    finally{working=false;controls();}
  };
  stopButton.onclick=()=>{stopped=true;controls();};
  closeButton.onclick=()=>{if(!working)dialog.close();};
  dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();});
  const beforeUnload=event=>{if(working){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  function dispose(){disposed=true;stopped=true;window.removeEventListener('beforeunload',beforeUnload);dialog.remove();}
  dialog.addEventListener('close',()=>{dispose();onClose();},{once:true});
  controls();dialog.showModal();
  return {dispose};
}
