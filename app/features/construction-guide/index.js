// Runtime-composed source module. Keep declarations in shared application scope.
// ── Bible ──
function renderBible(){
  if(stageDragInProgress){pendingBibleRender=true;return;}
  const el=$('panel-bible');
  const stages=getBibleStages();
  if(stages.length&&(!activeBibleStage||!stages.includes(activeBibleStage)))activeBibleStage=stages[0];
  const progProjs=S.projects.filter(p=>p.status==='prog');
  if(!activeBibleWs&&progProjs.length)activeBibleWs=progProjs[0]?.id||null;
  el.innerHTML=`
  <div class="flex-sb" style="margin-bottom:1rem;position:relative">
    <div>
      <div style="font-size:15px;font-weight:600">施工寶典</div>
      <div style="font-size:12px;color:var(--text2);margin-top:2px">新增階段後可在工程進度選取，自動帶入待辦清單</div>
      ${isAdmin()&&dragModeOn?`<button class="btn btn-p btn-sm" style="margin-top:8px" onclick="showAddStage()">＋ 新增階段</button>`:''}
    </div>
    <div class="flex">
      <div class="seg" style="position:absolute;left:50%;transform:translateX(-50%);top:50%;margin-top:-15px">
        <button class="${bibleView==='edit'?'on':''}" onclick="setBibleView('edit')">標準清單</button>
        <button class="${bibleView==='worksite'?'on':''}" onclick="setBibleView('worksite')">案件勾選</button>
      </div>
      ${isAdmin()?`
        <button class="btn btn-sm ${dragModeOn?'btn-p':''}" onclick="toggleDragMode()">${dragModeOn?'✓ 編輯中':'✎ 編輯'}</button>`:''}
    </div>
  </div>
  <div class="bible-wrap">
    <div class="bible-stages ${dragModeOn?'drag-mode':''}">
      ${stages.length===0?`<div style="padding:14px;font-size:12px;color:var(--text3);text-align:center">尚無階段</div>`:''}
      ${stages.map((s,i)=>`<div class="bst-item ${s===activeBibleStage?'active':''} ${isSystemAdmin()&&dragModeOn?'drag-enabled':''}" data-stage="${s}"
        ${isSystemAdmin()&&dragModeOn?`draggable="true" ondragstart="bsDragStart(event,'${s}')" ondragover="bsDragOver(event,'${s}')" ondrop="bsDrop(event,'${s}')" ondragend="bsDragEnd()"`:''}
        onclick="setActiveStage('${s}')">        ${isSystemAdmin()&&dragModeOn?'<span class="drag-handle">⠿</span>':''}
        <span class="bst-name">${i+1}. ${displayStageName(s)}</span>
        <span class="bst-cnt">${getAllBibleItems(s).length}</span>
      </div>`).join('')}
    </div>
    <div class="bible-detail">
      ${activeBibleStage?renderBibleDetail(activeBibleStage):`<div class="empty">請新增工程階段後選取</div>`}
    </div>
  </div>`;
  restoreBibleScrollPosition();
}
let pendingBibleScrollPosition=null,bibleDeleteModalScrollPosition=null;
function rememberBibleScrollPosition(renderCount=1){
  const wrap=$('panel-bible')?.querySelector('.bible-wrap');
  if(!wrap)return;
  pendingBibleScrollPosition={stages:wrap.querySelector('.bible-stages')?.scrollTop||0,detail:wrap.querySelector('.bible-detail')?.scrollTop||0,remaining:renderCount};
}
function restoreBibleScrollPosition(){
  if(!pendingBibleScrollPosition)return;
  const position=pendingBibleScrollPosition;
  if(--position.remaining<=0)pendingBibleScrollPosition=null;
  const wrap=$('panel-bible')?.querySelector('.bible-wrap');
  if(!wrap)return;
  const stages=wrap.querySelector('.bible-stages'),detail=wrap.querySelector('.bible-detail');
  if(stages)stages.scrollTop=position.stages;
  if(detail)detail.scrollTop=position.detail;
}
function rememberBibleDeleteModalScrollPosition(){
  const wrap=$('panel-bible')?.querySelector('.bible-wrap');if(!wrap)return;
  bibleDeleteModalScrollPosition={stages:wrap.querySelector('.bible-stages')?.scrollTop||0,detail:wrap.querySelector('.bible-detail')?.scrollTop||0,pageX:window.scrollX,pageY:window.scrollY};
}
function restoreBibleDeleteModalScrollPosition(){
  const position=bibleDeleteModalScrollPosition;if(!position)return;
  const apply=()=>{const wrap=$('panel-bible')?.querySelector('.bible-wrap');if(!wrap)return;const stages=wrap.querySelector('.bible-stages'),detail=wrap.querySelector('.bible-detail');if(stages)stages.scrollTop=position.stages;if(detail)detail.scrollTop=position.detail;window.scrollTo(position.pageX,position.pageY);};
  requestAnimationFrame(apply);setTimeout(apply,0);bibleDeleteModalScrollPosition=null;
}
function renderBibleDetail(stage){
  if(bibleView==='worksite')return renderBibleWorksite(stage);
  const phases=[
    {id:'before',label:biblePhaseLabel(stage,'before'),color:'#BA7517',dot:'var(--amber)'},
    {id:'during',label:biblePhaseLabel(stage,'during'),color:'#534AB7',dot:'var(--purple)'},
    {id:'after',label:biblePhaseLabel(stage,'after'),color:'#1D9E75',dot:'var(--teal)'},
  ];
  return`
  <div class="flex-sb" style="margin-bottom:14px">
    <span style="font-size:14px;font-weight:500" ondblclick="startEditBibleStageTitle('${stage}',this)">${displayStageName(stage)}</span>
    <span style="display:flex;gap:6px">
      ${isAdmin()&&dragModeOn?`<button class="btn btn-sm ${S.bible[stage]&&S.bible[stage].isEstimate?'btn-p':''}" onclick="toggleStageEstimate('${stage}')" title="開啟後,這個階段的項目在彈出視窗裡會多一個金額輸入框">${S.bible[stage]&&S.bible[stage].isEstimate?'💰 金額估算階段':'設為金額估算階段'}</button>`:''}
      ${isAdmin()&&dragModeOn?`<button class="btn btn-sm btn-danger" onclick="confirmDeleteStage('${stage}')">刪除此階段</button>`:''}
    </span>
  </div>
  ${phases.map(ph=>`<div class="phase-section">
    <div class="phase-title ${isSystemAdmin()&&dragModeOn?'phase-title-editable':''}" style="color:${ph.color}" ${isSystemAdmin()&&dragModeOn?`ondblclick="startEditBiblePhaseTitle('${stage}','${ph.id}',this)" title="編輯中可雙擊修改此階段名稱"`:''}>
      <span class="phase-dot" style="background:${ph.dot}"></span>
      ${escAttr(ph.label)}（${getBiblePhaseItems(stage,ph.id).length} 項）
    </div>
    ${getBiblePhaseItems(stage,ph.id).map((rawItem,i)=>renderBibleItemNode(stage,ph.id,[i],rawItem)).join('')}
    ${isAdmin()&&dragModeOn?`<div class="bib-add-row">
      <input type="text" id="bib-new-${ph.id}" placeholder="新增${ph.label}項目…" autocomplete="off" onkeydown="if(event.key==='Enter')addBibleItem('${stage}','${ph.id}')">
    </div>`:''}
  </div>`).join('')}`;
}
function renderBibleWorksite(stage){
  const progProjs=S.projects.filter(p=>p.status==='design'||p.status==='prog');
  if(!progProjs.length)return`<div class="empty">尚無設計中或施工中的案件</div>`;
  if(!activeBibleWs||!progProjs.find(p=>p.id===activeBibleWs))activeBibleWs=progProjs[0].id;
  const curProj=progProjs.find(p=>p.id===activeBibleWs);
  const allStages=getBibleStages();
  return`
  <div class="ws-tabs">${progProjs.map(p=>`<button class="ws-tab ${p.id===activeBibleWs?'active':''}" onclick="setActiveWs('${p.id}')">${p.name}</button>`).join('')}</div>
  <div style="font-size:12px;color:var(--text2);margin:8px 0 4px">${curProj?.name||''}</div>
  ${allStages.length===0?`<div class="empty" style="padding:1rem">尚無階段</div>`:''}
  ${allStages.map(s=>{
    const metaItems=getAllBibleItemsMeta(s);
    if(!metaItems.length)return'';
    const key=`${activeBibleWs}_${s}`;const stored=S.checks[key]||[];
    const merged=metaItems.map((m,i)=>({text:m.text,depth:m.depth,isSub:m.isSub,done:stored[i]?.done||false,skip:stored[i]?.skip||false}));
    return`<div class="bible-worksite-stage" data-worksite-stage="${escAttr(s)}" style="margin-top:16px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">${displayStageName(s)}</div>
      ${merged.map((item,i)=>renderCheckItemRow(activeBibleWs,s,i,item)).join('')}
    </div>`;
  }).join('')}`;
}
window.setBibleView=function(v){bibleView=v;renderBible();}
window.setActiveStage=function(s){
  activeBibleStage=s;renderBible();
  if(bibleView==='worksite')requestAnimationFrame(function(){
    const target=Array.from(document.querySelectorAll('[data-worksite-stage]')).find(function(el){return el.dataset.worksiteStage===s;});
    if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
  });
}
window.setActiveWs=function(id){activeBibleWs=id;renderBible();}
window.toggleDragMode=function(){rememberBibleScrollPosition();dragModeOn=!dragModeOn;renderBible();}
window.bsDragStart=function(e,s){if(!isSystemAdmin()||!dragModeOn)return;dragSrc=s;stageDragInProgress=true;setTimeout(()=>document.querySelector(`[data-stage="${s}"]`)?.classList.add('dragging'),0);}
function bibleStageAutoScroll(event){const list=event.currentTarget.closest('.bible-stages');if(!list)return;const rect=list.getBoundingClientRect(),edge=46;if(event.clientY<rect.top+edge)list.scrollTop-=Math.ceil((rect.top+edge-event.clientY)/6);else if(event.clientY>rect.bottom-edge)list.scrollTop+=Math.ceil((event.clientY-(rect.bottom-edge))/6);}
window.bsDragOver=function(e,s){if(!isSystemAdmin()||!dragModeOn)return;e.preventDefault();bibleStageAutoScroll(e);document.querySelectorAll('.bst-item').forEach(el=>el.classList.remove('drag-over'));if(s!==dragSrc)document.querySelector(`[data-stage="${s}"]`)?.classList.add('drag-over');}
window.bsDrop=async function(e,toS){
  if(!isSystemAdmin()||!dragModeOn)return;e.preventDefault();
  stageDragInProgress=false;
  if(!dragSrc||dragSrc===toS)return;
  const order=[...getBibleStages()];const fi=order.indexOf(dragSrc);const ti=order.indexOf(toS);
  if(fi<0||ti<0)return;order.splice(fi,1);order.splice(ti,0,dragSrc);
  S.bibleOrder=order;
  rememberBibleScrollPosition(2);
  renderBible();
  setSyncing();
  try{await setDoc(doc(db,'bible','orderConfig'),{order});setSynced();}
  catch(err){alert('排序存檔失敗：'+err.message);setSynced();}
}
window.bsDragEnd=function(){
  document.querySelectorAll('.bst-item').forEach(el=>{el.classList.remove('dragging');el.classList.remove('drag-over');});
  dragSrc=null;
  stageDragInProgress=false;
  if(pendingBibleRender){pendingBibleRender=false;renderBible();}
}
// Recursively renders one item and all its descendants at any depth.
// path is an array of indices locating this node, e.g. [2,0,1].
function renderBibleItemNode(stage,phase,path,rawItem){
  const item=normalizeBibleItem(rawItem);
  const pathStr=path.join(',');
  const depth=path.length-1;
  const parentPath=path.slice(0,-1).join(',');
  const addOpen=!!expandedBibleItems[stage+'|'+phase+'|'+pathStr];
  const canSort=isSystemAdmin()&&dragModeOn;
  let html=`<div class="bib-drag-group" data-bib-path="${pathStr}" data-bib-parent="${parentPath}" data-bib-depth="${depth}"
    ${canSort?`ondragover="bibleItemDragOver(event,'${stage}','${phase}','${pathStr}','${parentPath}')" ondrop="bibleItemDrop(event,'${stage}','${phase}','${pathStr}','${parentPath}')"`:''}>
  <div class="bib-item-row" style="padding-left:${depth*26}px">
    ${depth===0?`<span class="bib-item-num">${path[0]+1}</span>`:`<span style="color:var(--text3);flex-shrink:0;margin-left:${32+(depth-1)*20}px">└</span>`}
    ${canSort?`<button type="button" class="bib-drag-handle" draggable="true" aria-label="拖曳排序" title="按住拖曳排序" ondragstart="bibleItemDragStart(event,'${stage}','${phase}','${pathStr}','${parentPath}')" ondragend="bibleItemDragEnd()">⠿</button>`:''}
    ${isAdmin()&&dragModeOn?`<button class="bib-item-add ${depth===0?'bib-item-add-root':''}" title="新增子項目" onclick="toggleBibleSubItems('${stage}','${phase}','${pathStr}')">＋</button>`:''}
    <span class="bib-item-text" style="flex:1" ondblclick="startEditBibleNode('${stage}','${phase}','${pathStr}',this)">${item.text}</span>
    ${isAdmin()&&dragModeOn?`<button class="bib-item-del" onclick="confirmDelBibleNode('${stage}','${phase}','${pathStr}','${escAttr(item.text).replace(/'/g,"\\'")}')">×</button>`:''}
  </div>`;
  item.subs.forEach((sub,i)=>{html+=renderBibleItemNode(stage,phase,[...path,i],sub);});
  if(isAdmin()&&dragModeOn){
    html+=addOpen?`<div class="bib-add-row" style="padding-left:${(depth+1)*26}px">
      <input type="text" id="bib-child-new-${phase}-${pathStr}" placeholder="+ 新增子項目…" autocomplete="off" onkeydown="if(event.key==='Enter')addBibleChildAtPath('${stage}','${phase}','${pathStr}')">
    </div>`:'';
  }
  return html;
}
function bibleSiblingArray(arr,parentPath){
  let current=arr;
  parentPath.forEach(index=>{current=normalizeBibleItem(current[index]).subs;});
  return current;
}
function reorderBibleSiblings(arr,parentPath,fromIndex,targetIndex,placeBefore){
  if(!parentPath.length){
    const next=[...arr], [moved]=next.splice(fromIndex,1);
    let insertAt=targetIndex+(placeBefore?0:1);if(fromIndex<insertAt)insertAt--;
    next.splice(insertAt,0,moved);return next;
  }
  const [head,...tail]=parentPath,copy=[...arr],item=normalizeBibleItem(copy[head]);
  copy[head]={text:item.text,subs:reorderBibleSiblings(item.subs,tail,fromIndex,targetIndex,placeBefore)};
  return copy;
}
function clearBibleItemDropClasses(){document.querySelectorAll('.bib-drag-group').forEach(el=>el.classList.remove('drag-over-before','drag-over-after'));}
function clearBibleItemDragClasses(){document.querySelectorAll('.bib-drag-group').forEach(el=>el.classList.remove('dragging','drag-over-before','drag-over-after'));}
function bibleItemAutoScroll(event){const detail=event.currentTarget.closest('.bible-detail');if(!detail)return;const rect=detail.getBoundingClientRect(),edge=54;if(event.clientY<rect.top+edge)detail.scrollTop-=Math.ceil((rect.top+edge-event.clientY)/6);else if(event.clientY>rect.bottom-edge)detail.scrollTop+=Math.ceil((event.clientY-(rect.bottom-edge))/6);}
window.bibleItemDragStart=function(event,stage,phase,pathStr,parentPath){
  if(!isSystemAdmin()||!dragModeOn)return;
  bibleItemDrag={stage,phase,path:pathStr,parent:parentPath,startY:event.clientY};
  event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',pathStr);
  requestAnimationFrame(()=>document.querySelector(`.bib-drag-group[data-bib-path="${CSS.escape(pathStr)}"]`)?.classList.add('dragging'));
}
window.bibleItemDragOver=function(event,stage,phase,pathStr,parentPath){
  const source=bibleItemDrag;
  if(!source||source.stage!==stage||source.phase!==phase||source.parent!==parentPath||source.path===pathStr)return;
  if(Math.abs(event.clientY-source.startY)<28)return;
  event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';bibleItemAutoScroll(event);
  clearBibleItemDropClasses();
  const target=event.currentTarget,rect=target.getBoundingClientRect();target.classList.add(event.clientY<rect.top+rect.height/2?'drag-over-before':'drag-over-after');
}
window.bibleItemDrop=async function(event,stage,phase,pathStr,parentPath){
  if(!isSystemAdmin()||!dragModeOn)return;
  const source=bibleItemDrag;
  clearBibleItemDropClasses();
  if(!source||source.stage!==stage||source.phase!==phase||source.parent!==parentPath||source.path===pathStr)return;
  if(Math.abs(event.clientY-source.startY)<28)return;
  event.preventDefault();event.stopPropagation();
  const target=event.currentTarget,rect=target.getBoundingClientRect(),placeBefore=event.clientY<rect.top+rect.height/2;
  const parent=parentPath?parentPath.split(',').map(Number):[],from=Number(source.path.split(',').pop()),to=Number(pathStr.split(',').pop()),arr=(S.bible[stage]||{before:[],during:[],after:[]})[phase]||[];
  const siblings=bibleSiblingArray(arr,parent);if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=siblings.length||to>=siblings.length)return;
  const updated={...(S.bible[stage]||{before:[],during:[],after:[]}),[phase]:reorderBibleSiblings(arr,parent,from,to,placeBefore)};
  bibleItemDrag=null;rememberBibleScrollPosition(2);S.bible=Object.assign({},S.bible,{[stage]:updated});renderBible();setSyncing();
  try{await setDoc(bibleStageDoc(stage),bibleStageData(stage,updated));setSynced();}catch(err){alert('排序存檔失敗：'+err.message);setSynced();}
}
window.bibleItemDragEnd=function(){clearBibleItemDragClasses();bibleItemDrag=null;}
window.toggleBibleSubItems=function(stage,phase,pathStr){
  const key=stage+'|'+phase+'|'+pathStr;
  expandedBibleItems[key]=!expandedBibleItems[key];
  rememberBibleScrollPosition();
  renderBible();
}
window.startEditBibleNode=function(stage,phase,pathStr,el){
  if(!isAdmin()||!dragModeOn)return;
  const current=el.textContent;
  el.innerHTML=`<input type="text" value="${escAttr(current)}" style="display:block;box-sizing:border-box;font-size:13px;padding:2px 6px;border:1px solid var(--purple);border-radius:3px;font-family:inherit;width:100%" onclick="event.stopPropagation()" onkeydown="event.stopPropagation();if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){this.blur();}if(event.key==='Escape'){this.blur();}" onblur="saveBibleNodeText('${stage}','${phase}','${pathStr}',this.value)">`;
  const inp=el.querySelector('input');inp.focus();inp.select();
}
window.saveBibleNodeText=async function(stage,phase,pathStr,text){
  text=(text||'').trim();
  if(!text){rememberBibleScrollPosition();return renderBible();}
  const path=pathStr.split(',').map(Number);
  const data=S.bible[stage]||{before:[],during:[],after:[]};
  const arr=data[phase]||[];
  const cur=normalizeBibleItem(getNodeAtPath(arr,path));
  const newArr=replaceAtPath(arr,path,cur.subs.length?{text,subs:cur.subs}:text);
  const updated={...data,[phase]:newArr};
  // 保留目前閱讀位置，並涵蓋存檔後同步觸發的第二次重新渲染。
  rememberBibleScrollPosition(2);S.bible=Object.assign({},S.bible,{[stage]:updated});
  renderBible();
  setSyncing();await setDoc(bibleStageDoc(stage),bibleStageData(stage,updated));setSynced();
}
window.addBibleItem=async function(stage,phase){
  if(!isAdmin())return;
  const inp=$(`bib-new-${phase}`);if(!inp)return;
  const text=inp.value.trim();if(!text)return;
  const data=S.bible[stage]||{before:[],during:[],after:[]};
  const updated={...data,[phase]:[...(data[phase]||[]),text]};
  rememberBibleScrollPosition();
  setSyncing();await setDoc(bibleStageDoc(stage),bibleStageData(stage,updated));inp.value='';setSynced();
}
window.addBibleChildAtPath=async function(stage,phase,pathStr){
  if(!isAdmin())return;
  const path=pathStr.split(',').map(Number);
  const inp=$(`bib-child-new-${phase}-${pathStr}`);if(!inp)return;
  const text=inp.value.trim();if(!text)return;
  const data=S.bible[stage]||{before:[],during:[],after:[]};
  const arr=data[phase]||[];
  const newArr=addChildAtPath(arr,path,text);
  const updated={...data,[phase]:newArr};
  S.bible=Object.assign({},S.bible,{[stage]:updated});
  expandedBibleItems[stage+'|'+phase+'|'+pathStr]=false;
  rememberBibleScrollPosition(2);
  renderBible();
  setSyncing();await setDoc(bibleStageDoc(stage),bibleStageData(stage,updated));setSynced();
}
window.confirmDelBibleNode=function(stage,phase,pathStr,text){
  rememberBibleDeleteModalScrollPosition();
  $('mo-content').innerHTML=`
    <div class="mo-title">確定要刪除這一項嗎？</div>
    <div class="mo-sub">「${text}」（連同底下的子項目一併刪除）</div>
    <div class="mo-footer"><button class="btn" onclick="closeBibleDeleteConfirm()">取消</button><button class="btn btn-danger" id="mo-confirm-btn" onclick="closeBibleDeleteConfirm();delBibleNodeAtPath('${stage}','${phase}','${pathStr}')">刪除</button></div>`;
  $('modal').style.display='flex';
  setTimeout(()=>{const b=$('mo-confirm-btn');if(b)b.focus();},0);
}
window.closeBibleDeleteConfirm=function(){closeMo();restoreBibleDeleteModalScrollPosition();}
window.delBibleNodeAtPath=async function(stage,phase,pathStr){
  if(!isAdmin())return;
  const path=pathStr.split(',').map(Number);
  const data=S.bible[stage]||{before:[],during:[],after:[]};
  const arr=data[phase]||[];
  const absIdx=flatIndexAtPath(data,phase,path);
  const removedCount=1+flatPhaseCount(normalizeBibleItem(getNodeAtPath(arr,path)).subs);
  const newArr=removeAtPath(arr,path);
  // 刪除同步會重繪清單，保留當前閱讀位置至同步完成。
  rememberBibleScrollPosition(2);setSyncing();await setDoc(bibleStageDoc(stage),bibleStageData(stage,{...data,[phase]:newArr}));
  const snap=await getDocs(collection(db,'checks'));
  const batch=writeBatch(db);
  snap.docs.filter(d=>d.id.endsWith('_'+stage)).forEach(d=>{
    const arr2=d.data().items||[];arr2.splice(absIdx,removedCount);
    batch.set(doc(db,'checks',d.id),{items:arr2});
  });
  await batch.commit();setSynced();
}
window.showAddStage=function(){
  $('mo-content').innerHTML=`<div class="mo-title">新增工程階段</div>
    <div style="margin-top:12px"><input id="ns-name" type="text" placeholder="工程階段名稱*"></div>
    <div class="mo-footer"><button class="btn" onclick="closeMo()">取消</button><button class="btn btn-p" onclick="addStage()">新增</button></div>`;
  $('modal').style.display='flex';setTimeout(()=>$('ns-name')?.focus(),50);
}
// Parses a leading Chinese numeral (一..四十五 style) off a stage name like
// "十二、繪製施工圖" so stages can be sorted by their intended order even
// if a drag-reorder or import accidentally left them out of sequence.
function chineseNumPrefix(s){
  const digits={'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
  const m=(s||'').match(/^[一二三四五六七八九十百千零]+/);
  if(!m)return null;
  const str=m[0];
  let total=0,section=0,num=0;
  for(const ch of str){
    if(ch==='十'){section+=(num||1)*10;num=0;}
    else if(ch==='百'){section+=(num||1)*100;num=0;}
    else{num=digits[ch];if(num===undefined)return null;section+=0;}
  }
  total=section+num;
  return total;
}
// Stages numbered 一 through 十六 belong to the design workflow (設計進度);
// everything else (十七 onward, or unnumbered custom stages) is a
// construction-phase stage that belongs in 工程進度 instead.
function isDesignStage(s){
  return getDesignBibleStages().includes(s);
}
function getDesignBibleStages(){return getBibleStages().slice(0,16);}
window.confirmSortStagesByNumber=function(){
  $('mo-content').innerHTML=`
    <div class="mo-title">校正階段順序？</div>
    <div class="mo-sub">會把所有階段依照名稱開頭的中文數字(一、二、三…)重新排序</div>
    <div class="mo-footer"><button class="btn" onclick="closeMo()">取消</button><button class="btn btn-p" id="mo-confirm-btn" onclick="closeMo();sortStagesByNumber()">校正</button></div>`;
  $('modal').style.display='flex';
  setTimeout(()=>{const b=$('mo-confirm-btn');if(b)b.focus();},0);
}
window.sortStagesByNumber=async function(){
  if(!isAdmin())return;
  const stages=getBibleStages();
  const withNum=stages.map(s=>({s,n:chineseNumPrefix(s)}));
  const numbered=withNum.filter(x=>x.n!==null).sort((a,b)=>a.n-b.n).map(x=>x.s);
  const unnumbered=withNum.filter(x=>x.n===null).map(x=>x.s);
  const order=[...numbered,...unnumbered];
  S.bibleOrder=order;
  renderBible();
  setSyncing();
  try{await setDoc(doc(db,'bible','orderConfig'),{order});setSynced();}
  catch(err){alert('排序存檔失敗：'+err.message);setSynced();}
}
window.confirmImportWordBible=function(){
  const toImport=Object.keys(WORD_BIBLE_IMPORT).filter(s=>!getBibleStages().includes(s));
  if(!toImport.length){alert('這些階段都已經匯入過了');return;}
  $('mo-content').innerHTML=`
    <div class="mo-title">匯入 Word 施工寶典？</div>
    <div class="mo-sub">會新增以下階段：${toImport.join('、')}</div>
    <div class="mo-footer"><button class="btn" onclick="closeMo()">取消</button><button class="btn btn-p" id="mo-confirm-btn" onclick="closeMo();importWordBible()">匯入</button></div>`;
  $('modal').style.display='flex';
  setTimeout(()=>{const b=$('mo-confirm-btn');if(b)b.focus();},0);
}
window.importWordBible=async function(){
  if(!isAdmin())return;
  const toImport=Object.keys(WORD_BIBLE_IMPORT).filter(s=>!getBibleStages().includes(s));
  if(!toImport.length)return;
  setSyncing();
  try{
    for(const stage of toImport){
      await setDoc(bibleStageDoc(stage),bibleStageData(stage,WORD_BIBLE_IMPORT[stage]));
    }
    const order=[...getBibleStages(),...toImport];
    await setDoc(doc(db,'bible','orderConfig'),{order});
    activeBibleStage=toImport[0];
    setSynced();
  }catch(err){alert('匯入失敗：'+err.message);setSynced();}
}
window.toggleStageEstimate=async function(stage){
  if(!isAdmin())return;
  const data=S.bible[stage]||{before:[],during:[],after:[]};
  const updated={...data,isEstimate:!data.isEstimate};
  S.bible=Object.assign({},S.bible,{[stage]:updated});
  renderBible();
  setSyncing();
  try{await setDoc(bibleStageDoc(stage),bibleStageData(stage,updated));setSynced();}
  catch(err){alert('設定失敗：'+err.message);setSynced();}
}
window.startEditBibleStageTitle=function(stage,el){
  if(!isAdmin()||!dragModeOn)return;
  const current=el.textContent;
  el.innerHTML=`<input type="text" value="${escAttr(current)}" style="font-size:14px;font-weight:500;padding:2px 6px;border:1px solid var(--purple);border-radius:3px;font-family:inherit;width:320px" onclick="event.stopPropagation()" onkeydown="event.stopPropagation();if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){this.blur();}if(event.key==='Escape'){this.blur();}" onblur="saveBibleStageTitle('${stage}',this.value)">`;
  const inp=el.querySelector('input');inp.focus();inp.select();
}
window.startEditBiblePhaseTitle=function(stage,phase,el){
  if(!isSystemAdmin()||!dragModeOn)return;
  const current=biblePhaseLabel(stage,phase);
  el.innerHTML=`<input type="text" value="${escAttr(current)}" aria-label="${escAttr(DEFAULT_BIBLE_PHASE_LABELS[phase])}名稱" style="font-size:11px;font-weight:600;padding:2px 6px;border:1px solid var(--purple);border-radius:3px;font-family:inherit;width:180px" onclick="event.stopPropagation()" onkeydown="event.stopPropagation();if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){this.blur();}if(event.key==='Escape'){this.dataset.cancel='true';this.blur();}" onblur="saveBiblePhaseTitle('${stage}','${phase}',this.value,this.dataset.cancel==='true')">`;
  const inp=el.querySelector('input');inp.focus();inp.select();
}
window.saveBiblePhaseTitle=async function(stage,phase,newName,canceled=false){
  newName=(newName||'').trim();
  if(canceled||!newName||newName===biblePhaseLabel(stage,phase)){renderBible();return;}
  const data=S.bible[stage]||{before:[],during:[],after:[]};
  const updated={...data,phaseLabels:{...(data.phaseLabels||{}),[phase]:newName}};
  S.bible=Object.assign({},S.bible,{[stage]:updated});
  renderBible();
  setSyncing();
  try{await setDoc(bibleStageDoc(stage),bibleStageData(stage,updated));setSynced();}
  catch(err){alert('階段名稱儲存失敗：'+err.message);setSynced();}
}
window.saveBibleStageTitle=async function(oldName,newName){
  newName=(newName||'').trim();
  if(!newName||newName===oldName)return renderBible();
  if(getBibleStages().includes(newName)){alert('此階段名稱已存在');renderBible();return;}
  const data=S.bible[oldName]||{before:[],during:[],after:[]};
  const order=getBibleStages().map(s=>s===oldName?newName:s);
  S.bible=Object.assign({},S.bible);
  delete S.bible[oldName];
  S.bible[newName]=data;
  S.bibleOrder=order;
  activeBibleStage=newName;
  renderBible();
  setSyncing();
  try{
    await setDoc(bibleStageDoc(newName),bibleStageData(newName,data));
    await deleteDoc(bibleStageDoc(oldName));
    await setDoc(doc(db,'bible','orderConfig'),{order});
    // Migrate anything keyed off the old stage name so nothing silently
    // detaches: per-project checklist progress, calendar chips, and the
    // frozen snapshot on completed projects.
    const snap=await getDocs(collection(db,'checks'));
    const batch=writeBatch(db);
    snap.docs.filter(d=>d.id.endsWith('_'+oldName)).forEach(d=>{
      const projId=d.id.slice(0,d.id.length-('_'+oldName).length);
      batch.set(doc(db,'checks',projId+'_'+newName),d.data());
      batch.delete(doc(db,'checks',d.id));
    });
    await batch.commit();
    for(const p of S.projects){
      const sched=p.schedule||[];
      const patch={};
      if(sched.some(e=>e.stage===oldName)){
        patch.schedule=sched.map(e=>e.stage===oldName?{...e,stage:newName,label:e.label===oldName?newName:e.label}:e);
      }
      if(p.bibleSnapshot&&p.bibleSnapshot[oldName]){
        const snap2=Object.assign({},p.bibleSnapshot);
        snap2[newName]=snap2[oldName];
        delete snap2[oldName];
        patch.bibleSnapshot=snap2;
      }
      if(Object.keys(patch).length)await updateDoc(doc(db,'projects',p.id),patch);
    }
    setSynced();
  }catch(err){alert('改名失敗：'+err.message);setSynced();}
}
window.addStage=async function(){
  if(!isAdmin())return;
  const name=$('ns-name').value.trim();if(!name)return alert('請填寫階段名稱');
  if(getBibleStages().includes(name))return alert('此階段已存在');
  const order=[...getBibleStages(),name];
  setSyncing();
  try{
    await setDoc(bibleStageDoc(name),bibleStageData(name,{before:[],during:[],after:[]}));
    await setDoc(doc(db,'bible','orderConfig'),{order});
    activeBibleStage=name;closeMo();setSynced();
  }catch(err){alert('新增階段失敗：'+err.message);setSynced();}
}
window.confirmDeleteStage=function(stage){
  const relinkTarget=findStageRelinkTarget(stage);
  $('mo-content').innerHTML=`
    <div class="mo-title">確定要刪除整個階段嗎？</div>
    <div class="mo-sub">「${stage}」底下所有項目也會一併刪除</div>
    ${relinkTarget?`<div class="mo-sub" style="margin-top:8px;color:var(--purple)">工程進度中原本連結「${displayStageName(stage)}」的項目，會改連結到「${displayStageName(relinkTarget)}」。</div>`:''}
    <div class="mo-footer"><button class="btn" onclick="closeMo()">取消</button><button class="btn btn-danger" id="mo-confirm-btn" onclick="closeMo();deleteStage('${stage}')">刪除</button></div>`;
  $('modal').style.display='flex';
  setTimeout(()=>{const b=$('mo-confirm-btn');if(b)b.focus();},0);
}
window.deleteStage=async function(stage){
  if(!isAdmin())return;
  const order=getBibleStages().filter(s=>s!==stage);
  const relinkTarget=findStageRelinkTarget(stage,order);
  setSyncing();
  try{
    await deleteDoc(bibleStageDoc(stage));
    await setDoc(doc(db,'bible','orderConfig'),{order});
    const snap=await getDocs(collection(db,'checks'));
    const batch=writeBatch(db);
    snap.docs.filter(d=>d.id.endsWith('_'+stage)).forEach(d=>batch.delete(doc(db,'checks',d.id)));
    await batch.commit();
    if(relinkTarget){
      const sourceLabel=displayStageName(stage),targetLabel=displayStageName(relinkTarget);
      for(const p of S.projects){
        const schedule=p.schedule||[];
        if(!schedule.some(e=>e.stage===stage))continue;
        const updatedSchedule=schedule.map(e=>e.stage!==stage?e:{...e,stage:relinkTarget,label:displayStageName(e.label||e.stage)===sourceLabel?targetLabel:e.label});
        await updateDoc(doc(db,'projects',p.id),{schedule:updatedSchedule});
      }
    }
    activeBibleStage=null;setSynced();
  }catch(err){alert('刪除階段失敗：'+err.message);setSynced();}
}
function findStageRelinkTarget(stage,stages=getBibleStages()){
  const matches=stages.filter(candidate=>candidate!==stage&&displayStageName(candidate)===displayStageName(stage));
  return matches.length===1?matches[0]:null;
}
