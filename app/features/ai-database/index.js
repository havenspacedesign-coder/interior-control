import {sorted,newId} from './model.js';
import {createLocalStore} from './store.js';
import {renderNavigation} from './navigation.js';
import {renderCaseContent} from './case-editor.js';
import {esc} from './ui-utils.js';
import {LEARNING_SCHEMA} from './learning-schema.js';
import {uploadCaseFiles,cleanupFiles,openFile} from './files.js';
import {photoThumbnail} from './photo-thumbnail.js';
import {analyzeBasicCase} from './analysis-client.js';
export function mountAiDatabase(root,session){
  const emulatorMode=!session.createStore&&new URL(location.href).searchParams.get('aiStore')==='emulator';
  if(!document.querySelector('[data-ai-database-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./ai-database.css',import.meta.url);link.dataset.aiDatabaseStyle='true';document.head.append(link);}
  let selectedCategory='cases',selectedCase='',collapsed=new Set(),dirty=false,busy=false,initializing=null,notice='',generation=0,denied=false;
  let disposed=false,unsubscribe=null;
  const images=new Map();
  const captionDrafts=new Map();
  const analyses=new Map();
  function updateAnalysis(){
    if(disposed||!session.canManage())return;
    const analysis=analyses.get(selectedCase)||{};
    const result=root.querySelector('[data-analysis-result]'),alert=root.querySelector('[data-analysis-error]'),button=root.querySelector('[data-action="case.analyze"]');
    if(result)result.textContent=analysis.summary||'';
    if(alert){alert.textContent=analysis.error||'';alert.hidden=!analysis.error;}
    if(button){button.disabled=!!analysis.loading;button.textContent=analysis.loading?'AI 分析中…':'開始 AI 分析';}
  }
  async function startAnalysis(){
    const caseId=selectedCase,project=context.state.cases.find(row=>row.id===caseId);
    if(!project||analyses.get(caseId)?.loading)return;
    if(dirty){analyses.set(caseId,{...analyses.get(caseId),error:'請先儲存基本資料，再開始分析。'});updateAnalysis();return;}
    const analysis={summary:analyses.get(caseId)?.summary||'',loading:true,error:''};
    analyses.set(caseId,analysis);updateAnalysis();
    try{analysis.summary=await analyzeBasicCase(project,session.getIdToken);}
    catch(error){analysis.error=error.message||'AI 分析失敗，請重試。';}
    finally{analysis.loading=false;updateAnalysis();}
  }
  let captionSaving=false,captionRenderPending=false;
  const captionFocused=()=>root.contains(document.activeElement)&&document.activeElement.matches('[data-caption]');
  function flushCaptionRender(){
    if(captionRenderPending&&!disposed&&!dirty&&!busy&&!captionSaving&&!captionDrafts.size&&!captionFocused()&&!root.querySelector('dialog[open]'))render();
  }
  const identity=()=>({...session.user(),role:session.canManage()?'manager':'staff',status:'active'});
  const context={state:null,store:null,async commit(command){const next=await context.store.commit(command,context.state.revision);context.state=next;return next;}};
  function error(error){if(disposed)return;if(['aidb/permission-denied','permission-denied','storage/unauthorized'].includes(error?.code)){denied=true;dirty=false;context.state=null;session.onDenied?.();render();return;}notice=error?.message||'操作失敗，請稍後重試。';const el=root.querySelector('.aidb-notice');if(el){el.textContent=notice;el.hidden=false;}}
  async function initialize(){
    if(disposed||!session.canManage())return;
    if(!initializing)initializing=(async()=>{
      if(session.createStore)context.store=session.createStore();
      else if(emulatorMode){const {createEmulatorStore}=await import('./firebase-store.js');context.store=await createEmulatorStore();}
      else context.store=await createLocalStore(identity);
      const state=await context.store.load();
      if(disposed||!session.canManage())return;
      context.state=state;
      session.onReady?.();
      unsubscribe=context.store.subscribe(async()=>{try{if(disposed||!session.canManage())return;const next=await context.store.load();if(disposed||!session.canManage())return;if(dirty||busy||captionSaving||captionDrafts.size||root.querySelector('dialog[open]')){if(!busy&&!captionSaving)error(Error('其他管理員或視窗已更新資料。請先保留編輯內容，再按「重新載入」。'));return;}context.state=next;if(captionFocused())captionRenderPending=true;else render();}catch(e){error(e);}});
      await cleanupFiles(context);render();
    })().catch(e=>{initializing=null;error(e);});
    return initializing;
  }
  async function action(work){if(busy||captionSaving||!session.canManage())return;busy=true;root.setAttribute('aria-busy','true');try{await work();notice='已儲存';dirty=false;render();}catch(e){error(e);}finally{busy=false;root.removeAttribute('aria-busy');}}
  function leaveDraft(){
    if(captionSaving)return false;
    if(!dirty&&!captionDrafts.size)return true;
    if(!confirm('目前有尚未儲存的修改，確定離開嗎？'))return false;
    captionDrafts.clear();
    return true;
  }
  async function saveCaptionDrafts(){
    if(busy||captionSaving||!session.canManage())return;
    captionSaving=true;
    root.setAttribute('aria-busy','true');
    try{
      let entry;
      while((entry=[...captionDrafts].find(([,draft])=>draft.ready))){
        const [fileId,draft]=entry;
        const value=draft.value;
        draft.ready=false;
        const file=context.state.files.find(file=>file.id===fileId);
        if(!file)throw Error('照片已不存在，備註尚未儲存。');
        await context.commit({type:'file.caption',payload:{id:file.caseId,fileId,caption:value}});
        if(captionDrafts.get(fileId)===draft&&draft.value===value){
          captionDrafts.delete(fileId);
        }
      }
      const status=root.querySelector('.aidb-notice');
      if(status?.textContent.startsWith('照片備註尚未儲存。')){
        notice='';status.textContent='';status.hidden=true;
      }
    }catch(e){
      error(e);
      const status=root.querySelector('.aidb-notice');
      if(status&&!denied){
        status.textContent='照片備註尚未儲存。'+(e.message||'請確認連線後再試。');
        status.hidden=false;
      }
    }finally{
      captionSaving=false;
      root.removeAttribute('aria-busy');
      flushCaptionRender();
    }
  }
  async function previews(){
    const token=generation;
    for(const img of root.querySelectorAll('[data-photo-id]')){
      if(token!==generation||denied||!context.state)return;
      const file=context.state.files.find(f=>f.id===img.dataset.photoId);if(!file)continue;
      try{
        if(!images.has(file.id)){
          const blob=await context.store.getBlob(file.storagePath);
          if(token!==generation||denied||!context.state||!session.canManage())return;
          const thumbnail=await photoThumbnail(blob);
          if(token!==generation||denied||!context.state||!session.canManage())return;
          images.set(file.id,URL.createObjectURL(thumbnail));
        }
        if(token===generation&&!denied&&session.canManage())img.src=images.get(file.id);
      }catch(e){if(token===generation){img.alt='照片暫時無法讀取';error(e);}if(denied||!context.state)return;}
    }
    if(token!==generation||denied||!context.state)return;
    const live=new Set(context.state.files.map(f=>f.id));for(const [id,url] of images)if(!live.has(id)){URL.revokeObjectURL(url);images.delete(id);}
  }
  function render(){
    if(disposed)return;
    captionRenderPending=false;
    generation++;
    if(denied||!session.canManage()){for(const url of images.values())URL.revokeObjectURL(url);images.clear();root.innerHTML='<section class="card aidb-empty">沒有 AI 資料庫管理權限。</section>';return;}
    if(!context.state){root.innerHTML='<p class="aidb-loading">正在開啟 AI 資料庫…</p><p class="aidb-notice" role="status" hidden></p>';initialize();return;}
    root.innerHTML=`<div class="aidb-header"><div><h1>AI 資料庫</h1><p class="aidb-muted">公司案件原始資料與設計知識管理</p></div><button class="btn btn-sm" data-action="reload">重新載入</button></div><p class="aidb-environment">${esc(context.store.label)}</p><p class="aidb-notice" role="status" ${notice?'':'hidden'}>${esc(notice)}</p>${context.state.cleanupPaths.length?'<p class="aidb-update-note">部分原始檔案尚待清理，資料已隱藏。<button class="btn btn-sm" data-action="cleanup">重試檔案清理</button></p>':''}<div class="aidb-layout"><aside class="aidb-sidebar card"><div class="aidb-sidebar-heading"><strong>知識分類</strong><button class="btn btn-sm" data-action="category.create">＋新增分類</button></div><nav aria-label="AI 資料庫分類與案件">${renderNavigation(context.state,{selectedCategory,selectedCase,collapsed})}</nav>${context.state.categories.some(c=>c.moduleType==='cases')?'':'<button class="btn btn-sm" data-action="category.restoreCases">建立案件資料庫</button>'}<p class="aidb-sort-hint">拖曳分類或案件可調整順序。<br>鍵盤：選取列後按 Alt＋↑／↓。</p></aside><main class="aidb-content">${renderCaseContent(context.state,{selectedCategory,selectedCase})}</main></div>`;
    updateAnalysis();
    previews();
  }
  function inputDialog(title,label,value,onSave){
    const dialog=document.createElement('dialog');dialog.className='aidb-dialog';dialog.innerHTML=`<form><h2>${esc(title)}</h2><label>${esc(label)}<input name="value" required maxlength="120" value="${esc(value)}"></label><div class="aidb-actions"><button class="btn" type="button" data-cancel>取消</button><button class="btn btn-p" type="submit">儲存</button></div><p class="aidb-dialog-error" role="alert"></p></form>`;root.append(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=dialog.querySelector('[type=submit]');button.disabled=true;try{await onSave(dialog.querySelector('input').value);dialog.close();render();}catch(e){dialog.querySelector('[role=alert]').textContent=e.message;}finally{button.disabled=false;}};dialog.showModal();dialog.querySelector('input').focus();
  }
  function deleteDialog(type,id){
    const row=(type==='case'?context.state.cases:context.state.categories).find(x=>x.id===id),ids=type==='case'?[id]:context.state.cases.filter(c=>c.categoryId===id).map(c=>c.id);
    const count=context.state.files.filter(f=>ids.includes(f.caseId)).length,general=context.state.knowledge.filter(k=>ids.includes(k.caseId)&&k.scope==='company'&&k.confirmation==='confirmed').length;
    const dialog=document.createElement('dialog');dialog.className='aidb-dialog';dialog.innerHTML=`<form><h2>刪除${type==='case'?'案件':'分類'}確認</h2><p>將刪除「${esc(row.name)}」、${ids.length} 筆案件、${count} 份原始檔案及案件專屬學習紀錄。其他分類不受影響。</p>${general?`<label class="aidb-check"><input name="keep" type="checkbox">保留 ${general} 筆已確認的公司通用知識。我已檢查內容不含應刪除的個資，保留後會標示原始案件已刪除。</label>`:'<p class="aidb-muted">目前沒有可保留的已確認通用知識。</p>'}<label>再次確認，請輸入「刪除」<input name="confirm" required pattern="刪除" autocomplete="off"></label><div class="aidb-actions"><button class="btn" type="button" data-cancel>取消</button><button class="btn btn-danger" type="submit">確認刪除</button></div><p role="alert"></p></form>`;root.append(dialog);dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=dialog.querySelector('[type=submit]');button.disabled=true;try{await context.commit({type:type+'.delete',payload:{id,keepGeneral:!!dialog.querySelector('[name=keep]')?.checked}});dirty=false;selectedCase='';await cleanupFiles(context);dialog.close();notice='已刪除';render();}catch(e){dialog.querySelector('[role=alert]').textContent=e.message;}finally{button.disabled=false;}};dialog.showModal();
  }
  root.addEventListener('input',event=>{
    if(event.target.closest('#aidb-case-form')){dirty=true;root.querySelector('.aidb-draft').textContent='尚未儲存';}
    const input=event.target;
    if(!input.matches('[data-caption]'))return;
    captionDrafts.set(input.dataset.caption,{input,value:input.value,ready:false});
  });
  function editCaption(input){
    if(!input||busy||!session.canManage())return false;
    if(dirty){
      notice='請先儲存基本資料，再編輯照片備註。';
      const status=root.querySelector('.aidb-notice');
      status.textContent=notice;status.hidden=false;
      return false;
    }
    input.dataset.captionEditing='true';
    return true;
  }
  root.addEventListener('mousedown',event=>{
    const input=event.target.closest('[data-caption]');
    if(input?.dataset.captionEditing==='false'&&event.detail>1)event.preventDefault();
  });
  root.addEventListener('dblclick',event=>{
    const input=event.target.closest('[data-caption]');
    if(!input)return;
    event.preventDefault();
    if(editCaption(input)){
      window.getSelection()?.removeAllRanges();
      input.focus({preventScroll:true});
      input.setSelectionRange(input.value.length,input.value.length);
    }
  });
  root.addEventListener('beforeinput',event=>{const input=event.target.closest('[data-caption]');if(input&&!editCaption(input))event.preventDefault();});
  root.addEventListener('paste',event=>{const input=event.target.closest('[data-caption]');if(input&&!editCaption(input))event.preventDefault();});
  root.addEventListener('compositionstart',event=>{const input=event.target.closest('[data-caption]');if(input&&!editCaption(input))event.preventDefault();});
  root.addEventListener('focusout',event=>{
    const input=event.target;
    if(!input.matches('[data-caption]'))return;
    const draft=captionDrafts.get(input.dataset.caption);
    input.dataset.captionEditing='false';
    if(draft){draft.ready=true;void saveCaptionDrafts();}
    // Tab focuses the next caption after blur; wait until that focus has settled.
    queueMicrotask(flushCaptionRender);
  });
  root.addEventListener('keydown',event=>{
    const input=event.target;
    if(!input.matches('[data-caption]'))return;
    if(event.key==='Tab'){
      if(event.isComposing||event.keyCode===229){event.preventDefault();return;}
      const inputs=[...root.querySelectorAll('[data-caption]')],next=inputs[inputs.indexOf(input)+(event.shiftKey?-1:1)];
      if(next){event.preventDefault();input.blur();next.focus();}
      return;
    }
    if(input.dataset.captionEditing==='false'&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key.length===1||event.key==='Process'))editCaption(input);
    if(input.dataset.captionEditing!=='true'||event.isComposing)return;
    if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();input.blur();}
    if(event.key==='Escape'&&!captionSaving){
      event.preventDefault();
      input.value=context.state.files.find(file=>file.id===input.dataset.caption)?.caption||'';
      captionDrafts.delete(input.dataset.caption);
      input.dataset.captionEditing='false';
      input.blur();
    }
  });
  root.addEventListener('submit',event=>{
    if(event.target.id!=='aidb-case-form')return;event.preventDefault();
    const data=new FormData(event.target),fields=Object.fromEntries(data);fields.scopes=data.getAll('scopes');
    action(()=>context.commit({type:'case.update',payload:{id:event.target.dataset.caseId,fields}}));
  });
  root.addEventListener('change',event=>{
    const input=event.target;if(!input.matches('[data-upload]')||!input.files.length)return;
    const files=Array.from(input.files),kind=input.dataset.upload,caseId=selectedCase;input.value='';
    if(!leaveDraft())return;dirty=false;
    action(async()=>{await uploadCaseFiles(context,caseId,kind,files);});
  });
  root.addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button||busy||captionSaving||!session.canManage())return;
    const key=button.dataset.action,id=button.dataset.id;
    if(key==='case.analyze'){void startAnalysis();return;}
    if(key==='collapse'){collapsed.has(id)?collapsed.delete(id):collapsed.add(id);if(!dirty&&!captionDrafts.size)render();else{root.querySelector(`[data-category-id="${CSS.escape(id)}"] .aidb-children`)?.toggleAttribute('hidden');button.textContent=collapsed.has(id)?'▸':'▾';button.setAttribute('aria-expanded',String(!collapsed.has(id)));}return;}
    if(key==='case.select'||key==='category.select'){if(!leaveDraft())return;dirty=false;selectedCase=key==='case.select'?id:'';selectedCategory=key==='case.select'?context.state.cases.find(c=>c.id===id).categoryId:id;notice='';render();return;}
    if(key==='category.create')return inputDialog('新增大分類','分類名稱','',async name=>{await context.commit({type:key,payload:{id:newId(),name}});});
    if(key==='category.rename')return inputDialog('重新命名分類','分類名稱',context.state.categories.find(c=>c.id===id).name,async name=>{await context.commit({type:key,payload:{id,name}});});
    if(key==='case.create'){if(!leaveDraft())return;return inputDialog('新增案件','案件名稱','',async name=>{const caseId=newId();await context.commit({type:key,payload:{id:caseId,categoryId:id,fields:{name}}});selectedCategory=id;selectedCase=caseId;dirty=false;});}
    if(key==='case.delete'||key==='category.delete'){if(!leaveDraft())return;return deleteDialog(key.split('.')[0],id);}
    if(key==='reload'){if(!leaveDraft())return;return action(async()=>{context.state=await context.store.load();});}
    if(key==='cleanup')return action(()=>cleanupFiles(context));
    if(key==='category.restoreCases')return action(async()=>{const categoryId=newId();await context.commit({type:key,payload:{id:categoryId}});selectedCategory=categoryId;selectedCase='';});
    const file=context.state.files.find(f=>f.id===id);if(!file)return;
    if(key==='file.open'){openFile(context.store,file,false,()=>!disposed&&session.canManage()).catch(error);return;}
    if(!leaveDraft())return;
    if(key==='file.delete'&&confirm(`確定刪除原始檔案「${file.name}」？此操作會移除儲存的檔案。`))return action(async()=>{await context.commit({type:key,payload:{id:file.caseId,fileId:id}});await cleanupFiles(context);});
  });
  async function reorder(kind,id,target,parent){
    if(!leaveDraft()||id===target)return;const rows=sorted(kind==='category'?context.state.categories:context.state.cases.filter(c=>c.categoryId===parent));
    const ids=rows.map(r=>r.id),from=ids.indexOf(id),to=ids.indexOf(target);if(from<0||to<0)return;ids.splice(to,0,ids.splice(from,1)[0]);
    await action(()=>context.commit({type:kind+'.order',payload:{ids,categoryId:parent}}));
  }
  root.addEventListener('dragstart',event=>{const row=event.target.closest('[data-drag-kind]');if(!row||busy||dirty){event.preventDefault();return;}event.dataTransfer.setData('application/x-haven-ai',JSON.stringify({kind:row.dataset.dragKind,id:row.dataset.id,parent:row.dataset.parent||''}));event.dataTransfer.effectAllowed='move';row.classList.add('aidb-dragging');});
  root.addEventListener('dragend',()=>root.querySelectorAll('.aidb-dragging,.aidb-drop').forEach(el=>el.classList.remove('aidb-dragging','aidb-drop')));
  root.addEventListener('dragover',event=>{if(!event.dataTransfer.types.includes('application/x-haven-ai'))return;const row=event.target.closest('[data-drag-kind]');if(row){event.preventDefault();event.dataTransfer.dropEffect='move';}});
  root.addEventListener('drop',event=>{const row=event.target.closest('[data-drag-kind]');if(!row)return;event.preventDefault();try{const from=JSON.parse(event.dataTransfer.getData('application/x-haven-ai'));if(from.kind!==row.dataset.dragKind||(from.kind==='case'&&from.parent!==row.dataset.parent))return;reorder(from.kind,from.id,row.dataset.id,from.parent);}catch{/* Ignore unrelated drag data. */}});
  root.addEventListener('keydown',event=>{const row=event.target.closest('[data-drag-kind]');if(!row||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const kind=row.dataset.dragKind,parent=row.dataset.parent,rows=sorted(kind==='category'?context.state.categories:context.state.cases.filter(c=>c.categoryId===parent)),i=rows.findIndex(c=>c.id===row.dataset.id),other=rows[i+(event.key==='ArrowUp'?-1:1)];if(other)reorder(kind,row.dataset.id,other.id,parent);});
  const warnBeforeUnload=event=>{if(dirty||captionSaving||captionDrafts.size){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',warnBeforeUnload);
  return {
    render,
    prepare(){if(emulatorMode&&!denied&&session.canManage())initialize();},
    canDisplay(){return !denied&&session.canManage()&&(!emulatorMode||!!context.state);},
    leave(){if(!leaveDraft())return false;dirty=false;return true;},
    dispose(){
      disposed=true;
      generation++;
      unsubscribe?.();
      window.removeEventListener('beforeunload',warnBeforeUnload);
      for(const url of images.values())URL.revokeObjectURL(url);
      images.clear();
      analyses.clear();
      context.state=null;
      root.replaceChildren();
    },
    schemaVersion:LEARNING_SCHEMA.version,
  };
}
