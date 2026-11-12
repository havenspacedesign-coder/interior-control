// Runtime-composed source module. Keep declarations in shared application scope.
// Keep the several date-column tables (工地/會議記事, 每日施工日誌, 私人記事)
// scrolling left/right together, since they're visually one continuous
// timeline even though they're separate <table> elements.
let hscrollSyncing=false;
// Focused progress test pages do not load the construction-guide module.
// Keep this small local predicate so the stage picker works in both contexts.
function isProgressDesignStage(stage){return getBibleStages().slice(0,16).includes(stage);}
let lastHScrollLeft=0;
const MOBILE_SCROLL_DEBUG=new URLSearchParams(location.search).has('scrollDebug');
const mobileScrollDiagnostics=[];
let mobileDateHeaderFrame=0;
let mobileDateHeaderLeft=0;
let mobileScrollDebugStopTimer=0;
function isNativeMobileProgressScroller(target){
  return matchMedia('(max-width: 768px)').matches&&!!target?.closest?.('.progress-horizontal-viewport');
}
window.pnMove=function(type,ds,idx,direction){
  const days=getWeekDates().map(fmtDay);let ti=type==='work'?0:1,di=days.indexOf(ds);if(di<0)return;
  if(direction==='left')di--;else if(direction==='right')di++;else if(direction==='up')ti--;else ti++;
  if(di<0||di>=days.length||ti<0||ti>1)return;const nextType=ti===0?'work':'personal';const items=((S.privateNotes||{})[nextType]||{})[days[di]]||[];
  if(items[idx])pnSelect(nextType,days[di],idx);else{S.privateSelected={};S.privateSelected[nextType+'|'+days[di]]=idx;S.privateEditing=null;updateFormulaBar(nextType,days[di],idx,'');renderProgress();}
}
window.pnSetCellText=async function(type,ds,idx,text){
  if(!currentUser)return;var pn=S.privateNotes||{work:{},personal:{}},items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];while(items.length<=idx)items.push({text:'',color:''});items[idx]=Object.assign({},items[idx],{text:text,link:null});S.privateNotes=Object.assign({},pn);S.privateNotes[type]=Object.assign({},pn[type]||{});S.privateNotes[type][ds]=items;S.privateEditing=null;S.privateSelected={};S.privateSelected[type+'|'+ds]=idx;setSyncing();await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);setSynced();if(activePanel==='progress')renderProgress();
}
function recordMobileScroll(kind,details){
  if(!MOBILE_SCROLL_DEBUG)return;
  const entry={time:Math.round(performance.now()),kind:kind,...details};
  mobileScrollDiagnostics.push(entry);
  if(mobileScrollDiagnostics.length>80)mobileScrollDiagnostics.shift();
  window.__mobileScrollDiagnostics=mobileScrollDiagnostics;
  console.debug('[mobile-scroll]',entry);
}
function alignProgressBottomScrollbar(){
  const bar=document.getElementById('progress-bottom-hscroll');
  const board=document.querySelector('#panel-progress .progress-sticky-board');
  if(!bar||!board)return;
  const rect=board.getBoundingClientRect();
  bar.style.left=Math.max(0,rect.left)+'px';
  bar.style.right=Math.max(0,window.innerWidth-rect.right)+'px';
}
var designHScrollSyncing=false;
function alignDesignBottomScrollbar(){
  const bar=document.getElementById('design-bottom-hscroll');
  const wrap=document.getElementById('design-scroll-wrap');
  if(!bar||!wrap)return;
  const rect=wrap.getBoundingClientRect();
  bar.style.left=Math.max(0,rect.left)+'px';
  bar.style.right=Math.max(0,window.innerWidth-rect.right)+'px';
  bar.style.display=wrap.scrollWidth>wrap.clientWidth+1?'block':'none';
}
function syncDesignHScroll(source){
  if(designHScrollSyncing||!source)return;
  const wrap=document.getElementById('design-scroll-wrap');
  const bar=document.getElementById('design-bottom-hscroll');
  const other=source===wrap?bar:wrap;
  designLastHScrollLeft=source.scrollLeft;
  if(!other)return;
  designHScrollSyncing=true;
  other.scrollLeft=designLastHScrollLeft;
  designHScrollSyncing=false;
}
function restoreDesignHScroll(left){
  alignDesignBottomScrollbar();
  const target=Number.isFinite(left)?Math.max(0,left):0;
  const wrap=document.getElementById('design-scroll-wrap');
  const bar=document.getElementById('design-bottom-hscroll');
  designHScrollSyncing=true;
  if(wrap)wrap.scrollLeft=target;
  if(bar)bar.scrollLeft=target;
  designHScrollSyncing=false;
}
function syncProgressMeetingStickyOffset(){
  const controls=document.querySelector('#panel-progress .progress-sticky-board');
  const meeting=document.querySelector('#panel-progress .progress-week-content');
  if(!controls||!meeting)return;
  meeting.style.setProperty('--progress-controls-height',Math.ceil(controls.getBoundingClientRect().height)+'px');
}
window.confirmClearDesignStage=function(projId,col,label){
  delete $('mo-content').dataset.lockBackdrop;
  $('mo-content').innerHTML=`<div class="mo-title">確認刪除</div><div class="mo-sub">確定要刪除「${escAttr(label)}」標記嗎？</div><div class="mo-footer"><button class="btn" onclick="closeMo()">取消</button><button class="btn btn-danger" id="mo-confirm-btn" onclick="closeMo();saveDesignField('${projId}','${col}','')">刪除</button></div>`;
  $('modal').style.display='flex';setTimeout(()=>$('mo-confirm-btn')?.focus(),50);
}
window.addEventListener('resize',function(){alignProgressBottomScrollbar();alignDesignBottomScrollbar();});
function syncHScrollPosition(source,left){
  const scrollers=Array.from(document.querySelectorAll('.hscroll-sync'));
  const max=Math.min(Math.max(0,source.scrollWidth-source.clientWidth),...scrollers.filter(other=>other.clientWidth>0).map(other=>Math.max(0,other.scrollWidth-other.clientWidth)));
  const next=Math.max(0,Math.min(max,left));
  if(Math.abs(source.scrollLeft-next)>.5)source.scrollLeft=next;
  lastHScrollLeft=next;
  if(calMode==='month')progressMonthScrollPositions[progressMonthKey()]=next;
  updateMobileProgressDateHeader(next);
  // 每次拖曳及慣性移動都在同一次更新內對齊所有日期表，不能等放開才補同步。
  hscrollSyncing=true;
  scrollers.forEach(function(other){
    if(other!==source&&Math.abs(other.scrollLeft-next)>.5)other.scrollLeft=next;
  });
  hscrollSyncing=false;
  return next;
}
function setHorizontalScrollPosition(scroller,left){
  if(scroller.classList.contains('hscroll-sync'))return syncHScrollPosition(scroller,left);
  const max=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
  const next=Math.max(0,Math.min(max,left));
  if(Math.abs(scroller.scrollLeft-next)>.5)scroller.scrollLeft=next;
  return next;
}
document.addEventListener('scroll',function(e){
  const el=e.target;
  if(el.id==='design-scroll-wrap'||el.id==='design-bottom-hscroll'){
    syncDesignHScroll(el);
    return;
  }
  if(el.classList&&el.classList.contains('progress-horizontal-viewport')){
    lastHScrollLeft=el.scrollLeft;
    if(calMode==='month')progressMonthScrollPositions[progressMonthKey()]=el.scrollLeft;
    updateMobileProgressDateHeader(el.scrollLeft);
    if(MOBILE_SCROLL_DEBUG){
      clearTimeout(mobileScrollDebugStopTimer);
      mobileScrollDebugStopTimer=setTimeout(function(){recordMobileScroll('native-scroll-settled',{left:Math.round(el.scrollLeft)});},120);
    }
    return;
  }
  if(hscrollSyncing)return;
  if(!el.classList||!el.classList.contains('hscroll-sync'))return;
  if(Math.abs(el.scrollLeft-lastHScrollLeft)<.5)return;
  syncHScrollPosition(el,el.scrollLeft);
},true);
function captureProgressHScroll(){
  const mobileViewport=document.getElementById('progress-horizontal-viewport');
  if(mobileViewport&&matchMedia('(max-width: 768px)').matches)return mobileViewport.scrollLeft;
  const contentScrollers=Array.from(document.querySelectorAll('#panel-progress .hscroll-sync:not(#progress-bottom-hscroll)'));
  if(contentScrollers.length)return Math.max(lastHScrollLeft,...contentScrollers.map(function(el){return el.scrollLeft;}));
  return lastHScrollLeft;
}
function restoreHScroll(left){
  // Size the fixed scrollbar before restoring scrollLeft. Its newly created
  // auto width can equal the entire timeline, which clamps scrollLeft to zero.
  alignProgressBottomScrollbar();
  const target=Number.isFinite(left)?Math.max(0,left):lastHScrollLeft;
  lastHScrollLeft=target;
  const mobileViewport=document.getElementById('progress-horizontal-viewport');
  if(mobileViewport&&matchMedia('(max-width: 768px)').matches){
    mobileViewport.scrollLeft=target;
    updateMobileProgressDateHeader(target);
    return;
  }
  hscrollSyncing=true;
  document.querySelectorAll('.hscroll-sync').forEach(function(el){el.scrollLeft=target;});
  hscrollSyncing=false;
  updateMobileProgressDateHeader(target);
}
function updateMobileProgressDateHeader(left){
  mobileDateHeaderLeft=left;
  if(mobileDateHeaderFrame)return;
  mobileDateHeaderFrame=requestAnimationFrame(function(){
    mobileDateHeaderFrame=0;
    const track=document.getElementById('mobile-progress-date-track');
    if(track)track.style.transform='translate3d('+-Math.round(mobileDateHeaderLeft)+'px,0,0)';
  });
}
// Touch and trackpad scrolling keep the browser's native momentum and vertical-page
// behaviour.  This adds the same free-running inertia only for mouse dragging.
let horizontalPointerDrag=null;
let horizontalInertiaFrame=0;
let horizontalInertiaScroller=null;
let suppressHorizontalClickUntil=0;
const maxHorizontalInertiaSpeed=8;
function stopHorizontalInertia(){
  if(horizontalInertiaFrame)cancelAnimationFrame(horizontalInertiaFrame);
  horizontalInertiaFrame=0;
  horizontalInertiaScroller=null;
}
function runHorizontalInertia(scroller,velocity){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(velocity)<0.03){
    if(scroller.classList.contains('hscroll-sync'))syncHScrollPosition(scroller,scroller.scrollLeft);
    return;
  }
  stopHorizontalInertia();
  horizontalInertiaScroller=scroller;
  let lastTime=performance.now();
  function step(now){
    const elapsed=Math.min(32,Math.max(1,now-lastTime));
    lastTime=now;
    const max=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
    const before=scroller.scrollLeft;
    const after=setHorizontalScrollPosition(scroller,before+velocity*elapsed);
    velocity*=Math.pow(.93,elapsed/16);
    if(after<=0||after>=max||Math.abs(velocity)<0.03){
      if(scroller.classList.contains('hscroll-sync'))syncHScrollPosition(scroller,after);
      stopHorizontalInertia();return;
    }
    horizontalInertiaFrame=requestAnimationFrame(step);
  }
  horizontalInertiaFrame=requestAnimationFrame(step);
}
function getHorizontalPointerScroller(target){
  if(!target||!target.closest)return null;
  if(isNativeMobileProgressScroller(target))return null;
  // 底部捲軸由瀏覽器原生拖曳，再透過 scroll 事件同步；不可當成內容反向平移。
  if(target.closest('#progress-bottom-hscroll'))return null;
  if(target.closest('.daily-log-table'))return null;
  return target.closest('.hscroll-sync,.horizontal-card-list');
}
document.addEventListener('pointerdown',function(e){
  const viewport=e.target.closest?.('.progress-horizontal-viewport');
  if(viewport&&e.pointerType==='touch')recordMobileScroll('touch-start',{x:Math.round(e.clientX),y:Math.round(e.clientY),left:Math.round(viewport.scrollLeft)});
},{capture:true,passive:true});
document.addEventListener('pointerup',function(e){
  const viewport=e.target.closest?.('.progress-horizontal-viewport');
  if(viewport&&e.pointerType==='touch')recordMobileScroll('touch-end',{x:Math.round(e.clientX),y:Math.round(e.clientY),left:Math.round(viewport.scrollLeft)});
},{capture:true,passive:true});
document.addEventListener('pointerdown',function(e){
  if((e.pointerType!=='mouse'&&e.pointerType!=='touch')||(e.pointerType==='mouse'&&e.button!==0))return;
  const scroller=getHorizontalPointerScroller(e.target);
  if(!scroller||scroller.scrollWidth<=scroller.clientWidth+1)return;
  if(e.target.closest('button,a,[contenteditable="true"]'))return;
  if(e.target.closest('input,textarea,select,[contenteditable="true"],[draggable="true"],.ev-chip,.pn-chip,.meet-chip'))return;
  stopHorizontalInertia();
  horizontalPointerDrag={pointerId:e.pointerId,scroller:scroller,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastTime:e.timeStamp,velocity:0,dragged:false};
},true);
document.addEventListener('pointermove',function(e){
  const drag=horizontalPointerDrag;
  if(!drag||e.pointerId!==drag.pointerId)return;
  const dx=e.clientX-drag.lastX;
  const elapsed=Math.max(1,e.timeStamp-drag.lastTime);
  const movedX=e.clientX-drag.startX;
  const movedY=e.clientY-drag.startY;
  if(!drag.dragged&&Math.abs(movedX)>6&&Math.abs(movedX)>Math.abs(movedY))drag.dragged=true;
  if(drag.dragged){
    if(e.cancelable)e.preventDefault();
    drag.scroller.classList.add('is-pointer-dragging');
    setHorizontalScrollPosition(drag.scroller,drag.scroller.scrollLeft-dx);
    // Keep a very fast pointer event from reaching the edge in the first
    // animation frame, while still allowing a quick flick to travel far.
    drag.velocity=Math.max(-maxHorizontalInertiaSpeed,Math.min(maxHorizontalInertiaSpeed,(-dx)/elapsed));
  }
  drag.lastX=e.clientX;
  drag.lastTime=e.timeStamp;
},true);
function finishHorizontalPointerDrag(e){
  const drag=horizontalPointerDrag;
  if(!drag||e.pointerId!==drag.pointerId)return;
  horizontalPointerDrag=null;
  drag.scroller.classList.remove('is-pointer-dragging');
  if(!drag.dragged)return;
  suppressHorizontalClickUntil=Date.now()+350;
  runHorizontalInertia(drag.scroller,drag.velocity);
}
document.addEventListener('pointerup',finishHorizontalPointerDrag,true);
document.addEventListener('pointercancel',finishHorizontalPointerDrag,true);
document.addEventListener('click',function(e){
  if(Date.now()>suppressHorizontalClickUntil)return;
  if(getHorizontalPointerScroller(e.target)){
    e.preventDefault();
    e.stopImmediatePropagation();
  }
},true);
// Shift + mouse wheel scrolls sideways instead of down, for any of the
// horizontally-scrollable table wrappers in the app.
document.addEventListener('wheel',function(e){
  if(isNativeMobileProgressScroller(e.target))return;
  if(!e.shiftKey)return;
  let el=e.target;
  while(el&&el!==document.body){
    if(el.scrollWidth>el.clientWidth){
      const ov=getComputedStyle(el).overflowX;
      if(ov==='auto'||ov==='scroll'){
        el.scrollLeft+=e.deltaY;
        e.preventDefault();
        return;
      }
    }
    el=el.parentElement;
  }
  const progressPanel=$('panel-progress');
  if(activePanel==='progress'&&progressPanel&&progressPanel.contains(e.target)){
    const scroller=Array.from(document.querySelectorAll('.hscroll-sync')).find(function(node){return node.scrollWidth>node.clientWidth;});
    if(scroller){
      syncHScrollPosition(scroller,scroller.scrollLeft+(e.deltaY||e.deltaX));
      e.preventDefault();
    }
  }
},{passive:false});
document.addEventListener('keydown',function(e){
  if(e.key!=='Delete'||e.defaultPrevented)return;
  if(S.privateEditing)return;
  if(document.activeElement&&document.activeElement.tagName==='INPUT')return;
  var sel=S.privateSelected||{};
  var keys=Object.keys(sel).filter(function(k){return sel[k]>=0;});
  if(keys.length){
    var k=keys[0];var parts=k.split('|');
    pnDelete(parts[0],parts[1],sel[k]);
    return;
  }
  var mkeys=Object.keys(meetingSelected).filter(function(k){return meetingSelected[k]>=0;});
  if(mkeys.length){
    var mk=mkeys[0];var mparts=mk.split('|');
    mDelete(mparts[0],mparts[1],meetingSelected[mk]);
    return;
  }
  if(selectedTodoId){
    if(selectedTodoId.indexOf('m:')===0){deleteManualTodo(selectedTodoId.slice(2));}
    else if(selectedTodoId.indexOf('n:')===0){deleteNoteTodoByKey(selectedTodoId);}
    selectedTodoId=null;
  }
});
// Clicking anywhere that's not a note chip (and not the top bar) always
// clears the purple "selected" highlight, whether or not that chip was
// ever actually focused for typing — keeps the highlight behavior consistent.
document.addEventListener('click',function(e){
  if(!e.target.closest('.meeting-color-palette')&&!e.target.closest('.meeting-color-button'))closeMeetingColorPalette();
  if(!e.target.closest('.help-wrap')&&!e.target.closest('.help-pop'))closeHelpPops();
  if(!e.target.closest('.pn-mention-menu')){
    document.querySelectorAll('.pn-mention-menu').forEach(function(el){el.style.display='none';});
  }
  // 每日施工日誌的文字欄位第一次取得焦點時，不能因清除其他選取狀態
  // 而重畫整個月視圖，否則瀏覽器會立刻失焦、必須再點一次才能輸入。
  if(e.target.closest('.pn-chip')||e.target.closest('.meet-chip')||e.target.closest('.formula-bar')||e.target.closest('.log-textarea')||e.target.closest('.meeting-toolbar')||e.target.closest('.meeting-color-palette')||e.target.closest('.pn-mention-menu'))return;
  var changed=false;
  if(S.privateSelected&&Object.keys(S.privateSelected).some(function(k){return S.privateSelected[k]>=0;})){
    S.privateSelected={};changed=true;
  }
  if(meetingSelected&&Object.keys(meetingSelected).some(function(k){return meetingSelected[k]>=0;})){
    meetingSelected={};changed=true;
  }
  if(selectedTodoId){selectedTodoId=null;changed=true;}
  if(changed&&activePanel==='progress')renderProgress();
});
function closeHelpPops(exceptId){
  document.querySelectorAll('.help-pop.show').forEach(function(el){
    if(el.id===exceptId)return;
    el.classList.remove('show');
    if(el._helpHome&&el._helpHome.isConnected)el._helpHome.appendChild(el);
  });
}
window.toggleHelpPop=function(e,id){
  e.stopPropagation();
  closeHelpPops(id);
  const pop=$(id);if(!pop)return;
  const opening=!pop.classList.contains('show');
  if(!opening){
    pop.classList.remove('show');
    if(pop._helpHome&&pop._helpHome.isConnected)pop._helpHome.appendChild(pop);
    return;
  }
  if(pop.parentNode!==document.body){pop._helpHome=pop.parentNode;document.body.appendChild(pop);}
  pop.classList.add('show');
  if(opening){
    const r=e.currentTarget.getBoundingClientRect();
    const width=Math.min(300,window.innerWidth-24);
    pop.style.width=width+'px';
    pop.style.left=Math.max(12,Math.min(r.left,window.innerWidth-width-12))+'px';
    pop.style.top=Math.max(12,Math.min(r.bottom+6,window.innerHeight-pop.offsetHeight-12))+'px';
  }
};

async function savePrivateNoteData(){
  if(!currentUser)return;
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes||{work:{},personal:{}});
  setSynced();
}
window.addPrivateNote=function(type,ds){
  if(!S.privateNotes)S.privateNotes={work:{},personal:{}};
  if(!S.privateNotes[type])S.privateNotes[type]={};
  if(!S.privateNotes[type][ds])S.privateNotes[type][ds]=[];
  S.privateNotes[type][ds].push({text:'',done:false});
  renderProgress();
  // focus the new input
  setTimeout(()=>{
    const items=S.privateNotes[type][ds];
    const idx=items.length-1;
    const allInputs=document.querySelectorAll('.private-todo-text');
    if(allInputs.length)allInputs[allInputs.length-1].focus();
  },50);
}
window.savePrivateNote=async function(type,ds,idx,text){
  if(!currentUser||!S.privateNotes)return;
  if(!S.privateNotes[type])S.privateNotes[type]={};
  if(!S.privateNotes[type][ds])S.privateNotes[type][ds]=[];
  if(S.privateNotes[type][ds][idx])S.privateNotes[type][ds][idx].text=text;
  await savePrivateNoteData();
}
window.togglePrivateNote=async function(type,ds,idx,checked){
  if(!currentUser||!S.privateNotes)return;
  if(S.privateNotes[type]&&S.privateNotes[type][ds]&&S.privateNotes[type][ds][idx]){
    S.privateNotes[type][ds][idx].done=checked;
    await savePrivateNoteData();
  }
}
window.removePrivateNote=async function(type,ds,idx){
  if(!currentUser||!S.privateNotes)return;
  if(S.privateNotes[type]&&S.privateNotes[type][ds]){
    S.privateNotes[type][ds].splice(idx,1);
    renderProgress();
    await savePrivateNoteData();
  }
}

window.filterStages=function(projId,ds){
  const inp=$(`ssi-${projId}-${ds}`);const list=$(`ssl-${projId}-${ds}`);
  if(!inp||!list)return;
  const val=inp.value.toLowerCase().trim();
  const stages=getBibleStages().filter(s=>!isProgressDesignStage(s));
  const filtered=val?stages.filter(s=>s.toLowerCase().includes(val)):stages;
  list.innerHTML=filtered.map(s=>`<div class="stage-search-item" data-stage="${escAttr(s)}" onclick="addEvFromStage('${projId}','${ds}','${s}')">${displayStageName(s)}</div>`).join('');
  if(filtered.length)list.querySelectorAll('.stage-search-item')[0]?.classList.add('hi');
}
window.handleStageKey=function(e,projId,ds){
  const list=$(`ssl-${projId}-${ds}`);
  if(e.key==='Enter'){
    const hi=list?.querySelector('.stage-search-item.hi')||list?.querySelector('.stage-search-item');
    if(hi)addEvFromStage(projId,ds,hi.dataset.stage||hi.textContent.trim());
  }else if(e.key==='Escape'){openPicker=null;renderProgress();}
}
window.togglePicker=function(e,projId,ds,row){
  if(!progressCanEditDate(ds))return;
  if(row===undefined)row=1;
  if(openPicker&&openPicker.projId===projId&&openPicker.ds===ds&&openPicker.row===row){
    openPicker=null;renderProgress();return;
  }
  const rect=e.currentTarget.getBoundingClientRect();
  openPicker={projId,ds,row,top:rect.bottom+4,left:rect.left};
  renderProgress();
  setTimeout(()=>{
    const inp=document.getElementById('ssi-'+projId+'-'+ds);
    if(inp){inp.focus();inp.select();}
  },80);
}
let workProjectDragSrc=null;
window.workProjectDragStart=function(event,id){
  if(!isAdmin())return event.preventDefault();
  if(event.target!==event.currentTarget){workProjectDragSrc=null;return;}
  workProjectDragSrc=id;
  event.dataTransfer.effectAllowed='move';
};
window.workProjectDragOver=function(event){
  if(isAdmin()&&workProjectDragSrc)event.preventDefault();
};
window.workProjectDragDrop=async function(event,targetId,month){
  const source=workProjectDragSrc;
  workProjectDragSrc=null;
  if(!isAdmin()||!source||source===targetId||event.defaultPrevented)return;
  event.preventDefault();
  const order=progressMonthProjects(month).map(project=>project.id);
  const from=order.indexOf(source),to=order.indexOf(targetId);
  if(from<0||to<0)return;
  order.splice(to,0,...order.splice(from,1));
  try{await writeProgressOrder(order,month);}
  catch(error){alert(error.message);}
};
function progressScheduleChange(projId,ds,edit){
  const project=findProgressProject(projId);
  const month=ds.slice(0,7);
  if(!project||!progressProjectVisible(project,month)||!progressCanEditDate(ds))return null;
  const before=progressMonthSchedule(project,month);
  const after=edit(before);
  return after?{projectId:projId,month,field:'schedule',before,after}:null;
}
async function saveProgressSchedule(changes){
  if(!changes.length)return;
  setSyncing();
  try{await writeProgressMonths(changes);}
  finally{setSynced();}
}
window.addEvFromStage=async function(projId,ds,stage){
  openPicker=null;
  const change=progressScheduleChange(projId,ds,items=>[...items,{date:ds,stage,label:displayStageName(stage),time:'',note:'',_progressItemId:progressItemId()}]);
  if(change)await saveProgressSchedule([change]);
}
window.handleCellBg=function(e,projId,ds){
  if(!progressCanEditDate(ds))return;
  if(e.ctrlKey&&selectedTag){copyTagToCell(projId,ds);return;}
  selectedTag=null;openPicker=null;renderProgress();
}
// Close picker when clicking outside
document.addEventListener('click',function(e){
  if(openPicker&&!e.target.closest('.add-ev-wrap')&&!e.target.closest('.stage-search-box')){
    openPicker=null;renderProgress();
  }
});
window.handleChipClick=function(e,projId,ds,ei,stage){
  if(e.ctrlKey){if(progressCanEditDate(ds)){selectedTag={projId,ds,ei,stage};renderProgress();}return;}
  if(selectedTag){selectedTag=null;renderProgress();return;}
  if(stage&&getBibleStages().includes(stage)){
    const proj=findProgressProject(projId);
    openCheckMo(projId,stage,stage,proj?progressRosterAt(proj,ds.slice(0,7))?.name||proj.name:'',ds);
  }
}
window.copyTagToCell=async function(toProjId,toDs){
  const from=selectedTag;
  if(!from||!progressCanEditDate(from.ds))return;
  const project=findProgressProject(from.projId);
  const event=project&&progressMonthSchedule(project,from.ds.slice(0,7)).filter(item=>item.date===from.ds)[from.ei];
  if(!event)return;
  const change=progressScheduleChange(toProjId,toDs,items=>[...items,{...event,date:toDs,_progressItemId:progressItemId()}]);
  if(change){await saveProgressSchedule([change]);selectedTag=null;}
}
var evDragSrc=null;
window.evDragStart=function(e,projId,ds,ei){
  if(!progressCanEditDate(ds)){e.preventDefault();return;}
  evDragSrc={projId,ds,ei};
  e.dataTransfer.effectAllowed='copyMove';
  e.dataTransfer.setData('text/plain','ev|'+projId+'|'+ds+'|'+ei);
}
function captureScheduleDrop(event){
  if(event.progressScheduleDrop)return event.progressScheduleDrop;
  event.preventDefault();event.stopPropagation();
  const parts=(event.dataTransfer?.getData('text/plain')||'').split('|');
  const from=parts.length===4&&parts[0]==='ev'?{projId:parts[1],ds:parts[2],ei:Number(parts[3])}:evDragSrc;
  return event.progressScheduleDrop={from,copy:event.ctrlKey};
}
window.evDrop=async function(e,toProjId,toDs){
  const {from,copy}=captureScheduleDrop(e);
  evDragSrc=null;
  if(!from||!progressCanEditDate(from.ds)||!progressCanEditDate(toDs))return;
  if(from.projId===toProjId&&from.ds===toDs)return;
  const project=findProgressProject(from.projId);
  if(!project)return;
  const source=progressMonthSchedule(project,from.ds.slice(0,7));
  const entry=source.filter(item=>item.date===from.ds)[from.ei];
  if(!entry)return;
  const moved={...entry,date:toDs,...(copy?{_progressItemId:progressItemId()}:{})};
  const sameBucket=from.projId===toProjId&&from.ds.slice(0,7)===toDs.slice(0,7);
  const target=progressScheduleChange(toProjId,toDs,items=>[
    ...(sameBucket&&!copy?items.filter(item=>item!==entry):items),moved
  ]);
  if(!target)return;
  if(copy||sameBucket){await saveProgressSchedule([target]);return;}
  const remove=progressScheduleChange(from.projId,from.ds,items=>items.filter(item=>item!==entry));
  if(remove)await saveProgressSchedule([target,remove]);
}
window.removeEv=async function(projId,ds,ei){
  const change=progressScheduleChange(projId,ds,items=>{
    const entry=items.filter(item=>item.date===ds)[ei];
    if(!entry)return null;
    const name=entry.label||entry.stage||'此工程排程';
    return window.confirm('確定要刪除「'+name+'」嗎？')?items.filter(item=>item!==entry):null;
  });
  if(change)await saveProgressSchedule([change]);
}
function scheduleCellKey(projId,ds,ei){return{projId:String(projId),ds:String(ds),ei:Number(ei)};}
function scheduleCellIsSelected(projId,ds,ei){return !!scheduleSelected&&scheduleSelected.projId===String(projId)&&scheduleSelected.ds===String(ds)&&scheduleSelected.ei===Number(ei);}
function scheduleCellIsEditing(projId,ds,ei){return !!scheduleEditing&&scheduleEditing.projId===String(projId)&&scheduleEditing.ds===String(ds)&&scheduleEditing.ei===Number(ei);}
window.selectScheduleCell=function(span){
  if(!progressCanEditDate(span?.dataset.ds))return;
  const next=scheduleCellKey(span.dataset.proj,span.dataset.ds,span.dataset.ei);
  if(scheduleEditing&&!scheduleCellIsEditing(next.projId,next.ds,next.ei))window.saveScheduleCell(document.querySelector('.ev-field[contenteditable="true"]'));
  clearSpreadsheetSelections('schedule');
  scheduleSelected=next;scheduleEditing=null;
  document.querySelectorAll('.ev-field.excel-selected').forEach(el=>el.classList.remove('excel-selected'));
  span.classList.add('excel-selected');
  refreshProgressActionToolbar();
}
window.startFieldEdit=function(span){
  if(!progressCanEditDate(span?.dataset.ds))return;
  const next=scheduleCellKey(span.dataset.proj,span.dataset.ds,span.dataset.ei);
  scheduleSelected=next;scheduleEditing=next;scheduleEditOriginal=span.textContent||'';
  span.classList.add('excel-selected','excel-editing');span.contentEditable='true';span.focus();
  const range=document.createRange();range.selectNodeContents(span);range.collapse(false);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
}
window.startScheduleEditWithText=function(text){
  if(!scheduleSelected||!progressCanEditDate(scheduleSelected.ds))return;const span=document.querySelector(`.ev-field[data-proj="${CSS.escape(scheduleSelected.projId)}"][data-ds="${CSS.escape(scheduleSelected.ds)}"][data-ei="${scheduleSelected.ei}"]`);if(!span)return;
  window.startFieldEdit(span);span.textContent=text;
  const range=document.createRange();range.selectNodeContents(span);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
}
function captureScheduleCellEdit(span){
  if(!span||!scheduleCellIsEditing(span.dataset.proj,span.dataset.ds,span.dataset.ei))return null;
  const edit={...scheduleEditing,note:span.textContent.trim()};
  scheduleEditing=null;span.contentEditable='false';span.classList.remove('excel-editing');
  return edit;
}
window.saveScheduleCell=async function(span,edit){
  if(!edit)return;
  const {projId,ds,ei,note}=edit;
  const change=progressScheduleChange(projId,ds,items=>{
    const entry=items.filter(item=>item.date===ds)[ei];
    return entry&&note!==(entry.note||'')?items.map(item=>item===entry?{...item,note}:item):null;
  });
  if(change)await saveProgressSchedule([change]);
}
window.scheduleCellKeyDown=function(e,span){
  if(e.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'){e.preventDefault();span.textContent=scheduleEditOriginal;span.blur();return;}
  if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const direction=e.key==='Enter'?'down':(e.shiftKey?'left':'right');window.saveScheduleCell(span).then(()=>moveScheduleSelection(direction));}
}
function moveScheduleSelection(direction){
  if(!scheduleSelected)return;const days=getWeekDates().map(fmtDay),projects=progressMonthProjects(days[0].slice(0,7));
  let pi=projects.findIndex(p=>p.id===scheduleSelected.projId),di=days.indexOf(scheduleSelected.ds);if(pi<0||di<0)return;
  if(direction==='left')di--;else if(direction==='right')di++;else if(direction==='up')pi--;else pi++;
  if(pi<0||di<0||pi>=projects.length||di>=days.length)return;
  const target=document.querySelector(`.ev-field[data-proj="${CSS.escape(projects[pi].id)}"][data-ds="${days[di]}"]`);if(target)window.selectScheduleCell(target);
}
window.openDatePicker=function(){
  const p=$('week-date-picker');if(!p)return;
  const label=document.querySelector('#panel-progress .nav-row .wk-lbl');
  const rect=label?label.getBoundingClientRect():null;
  p.style.cssText=rect?'position:fixed;top:'+rect.top+'px;left:'+rect.left+'px;opacity:1;pointer-events:auto;z-index:999;width:'+rect.width+'px;height:'+rect.height+'px':'position:fixed;top:60px;right:20px;opacity:1;pointer-events:auto;z-index:999;width:auto;height:auto';
  try{p.showPicker();}catch(e){p.click();}
  p.onblur=()=>{p.style.cssText='position:fixed;opacity:0;pointer-events:none;width:0;height:0';}
}
window.jumpToDate=async function(dateStr){
  if(!dateStr)return;
  rememberProgressMonthScroll();
  const target=new Date(dateStr+'T00:00:00');
  const base=progressCalendarToday();
  monthOffset=(target.getFullYear()-base.getFullYear())*12+(target.getMonth()-base.getMonth());
  const targetKey=progressMonthKey();
  if(!Number.isFinite(progressMonthScrollPositions[targetKey]))progressMonthScrollPositions[targetKey]=Math.max(0,(monthOffset===0?base.getDate()-2:target.getDate()-3)*180);
  lastHScrollLeft=progressMonthScrollPositions[targetKey];
  await syncAllRecurringSchedules(fmtDay(new Date(target.getFullYear(),target.getMonth()+1,0)));
  renderProgress();
}
function renderDayView(){
  const td=today();const ds=fmtDay(td);
  const projs=S.projects.filter(p=>p.status==='prog');
  let html=`<div style="font-size:14px;font-weight:500;margin-bottom:12px">${td.getFullYear()}年${td.getMonth()+1}月${td.getDate()}日 工地動態</div>`;
  let hasAny=false;
  projs.forEach((p,pi)=>{
    const evs=progressMonthSchedule(p,ds.slice(0,7)).filter(e=>e.date===ds);
    if(!evs.length)return;hasAny=true;
    html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl2);padding:14px 16px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:500;margin-bottom:8px;color:${tc(pi)}">${p.name}</div>
      ${evs.map(ev=>{const resolvedStage=resolveBibleStage(ev.stage,ev.label);
        return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
          ${ev.time?`<span style="font-size:11px;color:var(--text2)">${ev.time}</span>`:''}
          <span style="background:${sc(pi)};color:${tc(pi)};padding:3px 9px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer"
            onclick="openCheckMo('${p.id}','${resolvedStage}','${ev.label||ev.stage}','${p.name}')">${ev.label||ev.stage}</span>
          ${ev.note?`<span style="font-size:11px;color:var(--text2)">${ev.note}</span>`:''}
          ${pendBadge(p.id,resolvedStage)}
        </div>`;}).join('')}
    </div>`;
  });
  if(!hasAny)html+=`<div class="empty">今日無工地排程</div>`;
  return html+'</div>';
}

let openCheckMoArgs=null;
window.openCheckMo=function(projId,stage,label,projName,ds){
  const readOnly=ds&&!progressCanEditDate(ds);
  const month=ds?.slice(0,7)||'';
  if(!stage)return;
  const proj=findProgressProject(projId);
  const metaItems=projectBibleItemsMeta(proj,stage);
  if(!metaItems.length){alert('此階段尚無項目');return;}
  const isEstimate=!!(S.bible[stage]&&S.bible[stage].isEstimate);
  const key=`${projId}_${stage}`;const stored=visibleProgressCheckItems(key,month);
  const merged=metaItems.map((m,i)=>({...m,done:stored[i]?.done||false,skip:stored[i]?.skip||false,amount:stored[i]?.amount||''}));
  const required=merged.filter(bibleItemNeedsCheck);
  const done=required.filter(x=>x.done||x.skip).length;const pct=required.length?Math.round(done/required.length*100):100;
  const totalAmount=merged.reduce((s,x)=>s+(parseFloat(x.amount)||0),0);
  const bData=projectBibleData(proj,stage);
  const beforeLen=flattenPhaseItems(bData.before).length,duringLen=flattenPhaseItems(bData.during).length;
  const PHASES=[
    {label:biblePhaseLabel(stage,'before'),color:'var(--pl)',from:0,to:beforeLen},
    {label:biblePhaseLabel(stage,'during'),color:'var(--tl)',from:beforeLen,to:beforeLen+duringLen},
    {label:biblePhaseLabel(stage,'after'),color:'var(--gl)',from:beforeLen+duringLen,to:merged.length}
  ];
  let itemsHtml='';
  PHASES.forEach(ph=>{
    if(ph.to<=ph.from)return;
    itemsHtml+=`<div style="font-size:11px;font-weight:600;color:var(--text2);margin:10px 0 4px"><span style="background:${ph.color};padding:2px 8px;border-radius:8px">${ph.label}</span></div>`;
    for(let i=ph.from;i<ph.to;i++){
      itemsHtml+=renderCheckItemRow(projId,stage,i,merged[i],isEstimate,readOnly,done>0);
    }
  });
  const oldScroll=$('mo-content').querySelector('.estimate-check-list')?.scrollTop||0;
  $('mo-content').classList.toggle('estimate-check-modal',isEstimate);
  const summary=`<div data-check-list="${escAttr(key)}" data-check-month="${month}" data-check-modal>
    <div class="mo-title">${label}</div>
    <div class="mo-sub">${projName} — <span data-check-count>${done}/${required.length} 完成</span>${isEstimate?`　｜　粗估總金額：<strong data-check-total>${totalAmount.toLocaleString()}</strong>`:''}</div>
    <div class="pb-wrap"><div class="pb-fill" style="width:${pct}%;background:${pct===100?'var(--teal)':'var(--purple)'}"></div></div></div>
    <div class="check-save-status" data-check-status role="status" hidden></div>`;
  $('mo-content').innerHTML=isEstimate
    ?`<div class="estimate-check-head">${summary}</div><div class="estimate-check-list">${itemsHtml}<div class="mo-footer"><button class="btn" onclick="closeMo()">關閉</button></div></div>`
    :`${summary}${itemsHtml}<div class="mo-footer"><button class="btn" onclick="closeMo()">關閉</button></div>`;
  if(isEstimate)$('mo-content').querySelector('.estimate-check-list').scrollTop=oldScroll;
  $('mo-content').style.maxWidth='880px';
  $('modal').style.display='flex';
  openCheckMoArgs={projId,stage,label,projName,ds};
  refreshProgressCheckViews(key);
}
window.closeMo=function(){$('modal').style.display='none';delete $('mo-content').dataset.lockBackdrop;openCheckMoArgs=null;$('mo-content').style.maxWidth='';$('mo-content').classList.remove('project-detail-modal','module-manager-modal','company-duty-settings','sticky-wall-modal','estimate-check-modal','recurring-manager-modal','announcement-modal');if(typeof bibleDeleteModalScrollPosition!=='undefined'&&bibleDeleteModalScrollPosition)restoreBibleDeleteModalScrollPosition();}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&$('modal').style.display==='flex'&&!$('mo-content').dataset.lockBackdrop){
    e.preventDefault();
    closeMo();
  }
});
// ── Progress-only operation undo ──────────────────────────────────────────
// The history intentionally lives only in this tab.  Each record restores one
// document/field and first verifies that its current value is still exactly the
// value written by this user; this prevents an undo from overwriting a later
// change received from another collaborator.
var progressUndoStack=[];
var progressUndoRunning=false;
window.progressItemId=function(){return 'pi_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);};
function progressClone(value){return JSON.parse(JSON.stringify(value==null?null:value));}
function progressSame(a,b){return JSON.stringify(a)==JSON.stringify(b);}
function progressUniqueTargets(targets){
  var seen={};return(targets||[]).filter(function(target){var id=target.kind+'|'+target.key+'|'+(target.month||'');if(seen[id])return false;seen[id]=true;return true;});
}
async function progressReadTarget(target){
  if(target.kind==='private'){
    if(localTestMode)return progressClone(S.privateNotes||{work:{},personal:{}});
    var pnSnap=await getDoc(doc(db,'privateNotes',target.key));return pnSnap.exists()?progressClone(pnSnap.data()):{work:{},personal:{}};
  }
  if(target.kind==='meeting'){
    if(localTestMode)return progressClone(((S.meetingLogs[target.key]||{}).items)||[]);
    var meetingSnap=await getDoc(doc(db,'meetingLogs',target.key));return meetingSnap.exists()?progressClone(meetingSnap.data().items||[]):[];
  }
  if(target.kind==='schedule'||target.kind==='siteNote'){
    const snapshot=await getDoc(doc(db,'projects',target.key));
    const project=snapshot.exists()?snapshot.data():{};
    return progressClone(target.kind==='schedule'?progressMonthSchedule(project,target.month):progressMonthNote(project,target.month));
  }
  if(target.kind==='checks'){
    if(localTestMode)return progressClone(progressCheckItems(target.key,target.month));
    const snapshot=await getDoc(doc(db,'checks',target.key));
    return snapshot.exists()?progressClone(progressCheckItems(target.key,target.month,snapshot.data())):[];
  }
  if(target.kind==='userTodo'){
    if(localTestMode){var localTodo=(S.userTodos||[]).find(function(item){return String(item.id)===String(target.key);});return localTodo?progressClone(localTodo):null;}
    var todoSnap=await getDoc(doc(db,'userTodos',target.key));return todoSnap.exists()?progressClone(todoSnap.data()):null;
  }
  if(target.kind==='globalNote'){
    if(localTestMode)return S.globalNotes[target.key]?progressClone(S.globalNotes[target.key]):null;
    var noteSnap=await getDoc(doc(db,'globalNotes',target.key));return noteSnap.exists()?progressClone(noteSnap.data()):null;
  }
  return null;
}
async function progressRestoreMeetingDailyLogs(target,currentItems,restoredItems){
  var max=Math.max(currentItems.length,restoredItems.length);
  for(var idx=0;idx<max;idx++){
    var current=currentItems[idx]||{},restored=restoredItems[idx]||{};
    for(const uid of (current.mentions||[])){if(!(restored.mentions||[]).includes(uid))await mRemoveFromDailyLog(target.rowId,target.ds,idx,uid);}
    for(const uid of (restored.mentions||[]))await mSyncDailyLog(target.rowId,target.ds,idx,uid,restored);
  }
}
async function progressWriteTarget(target,value,current){
  var restored=progressClone(value);
  if(target.kind==='private'){
    S.privateNotes=restored;persistLocalPrivateNotes();
    // 日期與排序還原後，舊的選取位置可能已空白或指到另一筆記事。
    S.privateSelected={};S.privateEditing=null;
    if(formulaBarState&&(formulaBarState.type==='work'||formulaBarState.type==='personal'))updateFormulaBar(null);
    await setDoc(doc(db,'privateNotes',target.key),restored);return;
  }
  if(target.kind==='meeting'){
    S.meetingLogs=Object.assign({},S.meetingLogs,{[target.key]:{rowId:target.rowId,date:target.ds,items:restored}});
    await setDoc(doc(db,'meetingLogs',target.key),{rowId:target.rowId,date:target.ds,items:restored,updatedAt:serverTimestamp()});
    await progressRestoreMeetingDailyLogs(target,current||[],restored);return;
  }
  if(target.kind==='checks'){
    await writeProgressCheckItems(target.key,latest=>{
      if(!progressCheckDataEqual(latest,current)){
        const error=new Error('此項目已被其他操作修改，無法復原。');
        error.undoConflict=true;
        throw error;
      }
      return restored;
    },target.month);
    refreshProgressCheckViews(target.key);
    return;
  }
  if(target.kind==='userTodo'){
    if(restored==null)await deleteDoc(doc(db,'userTodos',target.key));
    else await setDoc(doc(db,'userTodos',target.key),restored);
    return;
  }
  if(target.kind==='globalNote'){
    if(restored==null)await deleteDoc(doc(db,'globalNotes',target.key));
    else await setDoc(doc(db,'globalNotes',target.key),restored);
  }
}
function progressUndoPush(record,refresh=true){
  if(progressUndoRunning||!record||!record.targets||!record.targets.length)return;
  progressUndoStack.push(record);
  if(progressUndoStack.length>10)progressUndoStack.shift();
  if(refresh&&activePanel==='progress')renderProgress();
}
function recordProgressCheckUndo(key,month,batch,previous){
  if(progressUndoRunning||!batch.some(edit=>edit.undo))return;
  const items=[...previous];
  for(const edit of batch){
    const before=edit.undo?[...items]:null;
    applyProgressCheckEdit(items,edit);
    if(edit.undo&&!progressSame(before,items))progressUndoPush({
      action:edit.kind==='amount'?'setCheckAmount':'setCheckStatus',
      label:edit.kind==='amount'?'修改工程估價金額':'修改工程檢核狀態',
      targets:[{kind:'checks',key,month,ds:edit.ds,before,after:[...items]}]
    },false);
  }
  const button=activePanel==='progress'&&document.querySelector('#panel-progress .progress-undo-button');
  if(button)button.outerHTML=progressUndoButton();
}
async function progressRecordCreatedTarget(action,label,target,before){
  if(progressUndoRunning)return;
  var after=await progressReadTarget(target);if(progressSame(before,after))return;
  progressUndoPush({action:action,label:label,targets:[Object.assign({},target,{before:progressClone(before),after:after})]});
}
window.progressUndo=async function(){
  const index=progressUndoStack.findLastIndex(progressCanUndoRecord);
  if(index<0)return;
  if(progressUndoStack[index].targets.some(target=>target.kind==='checks'&&
    progressCheckBusy(progressCheckQueues.get(progressCheckQueueId(target.key,target.month))))){
    alert('施工寶典儲存中，請稍後再復原。');
    return;
  }
  var [record]=progressUndoStack.splice(index,1);
  progressUndoRunning=true;
  try{
    var current=[];
    for(const target of record.targets)current.push(await progressReadTarget(target));
    var conflict=record.targets.some(function(target,index){
      return !(target.kind==='checks'?progressCheckDataEqual(current[index],target.after):progressSame(current[index],target.after));
    });
    if(conflict){var conflictError=new Error('此項目已被其他操作修改，無法復原。');conflictError.undoConflict=true;throw conflictError;}
    const projectChanges=[];
    for(let i=0;i<record.targets.length;i++){
      const target=record.targets[i];
      if(target.kind==='schedule'||target.kind==='siteNote')projectChanges.push({projectId:target.key,month:target.month,field:target.kind,before:current[i],after:target.before});
      else await progressWriteTarget(target,target.before,current[i]);
    }
    if(projectChanges.length)await writeProgressMonths(projectChanges);
    setSynced();
  }catch(error){
    if(!error?.undoConflict)progressUndoStack.splice(index,0,record);
    alert(error&&error.message?error.message:'無法復原這筆操作');
  }finally{
    progressUndoRunning=false;
    if(activePanel==='progress')renderProgress();
  }
};
function progressCanWriteTargets(targets){
  return targets.every(target=>!(target.ds||target.month)||progressCanEditDate(target.ds||target.month));
}
function progressCanUndoRecord(record){
  if(!progressCanWriteTargets(record.targets))return false;
  return calMode!=='month'||progressCanEditDate(progressMonthKey())||!record.targets.some(target=>target.ds||target.month);
}
function progressUndoButton(){var next=progressUndoStack.findLast(progressCanUndoRecord),title=next?('上一步：'+next.label+'（Ctrl+Z）'):'上一步（Ctrl+Z）';return '<button type="button" class="progress-undo-button progress-icon-button" data-undo-count="'+progressUndoStack.length+'" '+(next?'':'disabled ')+'onclick="progressUndo()" title="'+escAttr(title)+'" aria-label="上一步"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 6 3.5 11.7l5.7 5.7 1.4-1.4-3.3-3.3H15a4 4 0 1 1-3.4 6.1l-1.7 1a6 6 0 1 0 5.1-9.1H7.2l3.4-3.3L9.2 6Z"/></svg></button>';}
window.progressSelectedTarget=function(){
  var p=privateSelectedCell&&privateSelectedCell(),m=meetingSelectedCell&&meetingSelectedCell(),s=scheduleSelected;
  if(p){var pItem=((((S.privateNotes||{})[p.type]||{})[p.ds]||[])[p.idx]);if(pItem)return{kind:'private',ref:p,item:pItem};}
  if(m&&progressCanEditDate(m.ds)){var mItem=((((S.meetingLogs||{})[m.rowId+'_'+m.ds]||{}).items||[])[m.idx]);return{kind:'meeting',ref:m,item:mItem||{},empty:!mItem};}
  if(s&&progressCanEditDate(s.ds)){var proj=findProgressProject(s.projId),sItem=(proj?progressMonthSchedule(proj,s.ds.slice(0,7)):[]).filter(function(x){return x.date===s.ds;})[s.ei];if(sItem)return{kind:'schedule',ref:s,item:sItem};}
  return null;
};
window.progressApplySelectedColor=async function(kind,value,target){
  target=target||progressSelectedTarget();if(!target)return;
  if(target.kind==='private')return kind==='text'?pnSetColor(target.ref.type,target.ref.ds,target.ref.idx,value):pnSetBackground(target.ref.type,target.ref.ds,target.ref.idx,value);
  if(target.kind==='meeting')return mSetColor(target.ref.rowId,target.ref.ds,target.ref.idx,kind,value);
  return scheduleSetStyle(target.ref.projId,target.ref.ds,target.ref.ei,kind==='text'?'color':'bg',value);
};
window.progressApplyPaletteColor=function(kind,value){
  const target=meetingColorPreview?.target;
  closeMeetingColorPalette();
  return progressApplySelectedColor(kind,value,target);
};
var PROGRESS_COLOR_ROWS=[
  ['#f4cccc','#fce5cd','#fff2cc','#d9ead3','#d0e0e3','#cfe2f3','#d9d2e9','#ead1dc'],
  ['#ea9999','#f9cb9c','#ffe599','#b6d7a8','#a2c4c9','#9fc5e8','#b4a7d6','#d5a6bd'],
  ['#e06666','#f6b26b','#ffd966','#93c47d','#76a5af','#6fa8dc','#8e7cc3','#c27ba0'],
  ['#cc0000','#e69138','#f1c232','#6aa84f','#45818e','#3d85c6','#674ea7','#a64d79']
];
var PROGRESS_STANDARD_COLORS=['#000000','#ffffff','#4a86e8','#e24b4a','#ef9f27','#f1c232','#1d9e75','#00a2ae'];
window.openProgressColorPalette=function(e,kind,current){
  e.stopPropagation();closeMeetingColorPalette();
  beginMeetingColorPreview(progressSelectedTarget(),kind);
  var palette=document.createElement('div');palette.id='meeting-color-palette';palette.className='meeting-color-palette';
  var swatch=function(color){var selected=(current||'').toLowerCase()===color.toLowerCase();return '<button type="button" class="meeting-palette-swatch'+(selected?' selected':'')+'" style="background:'+color+'" title="'+color+'" aria-label="選擇 '+color+'" onclick="progressApplyPaletteColor(\''+kind+'\',\''+color+'\')">'+(selected?'✓':'')+'</button>';};
  palette.innerHTML='<button type="button" class="meeting-palette-reset" onclick="progressApplyPaletteColor(\''+kind+'\',\'\')">↙&nbsp; 重設</button>'+PROGRESS_COLOR_ROWS.map(function(row){return '<div class="meeting-palette-grid">'+row.map(swatch).join('')+'</div>';}).join('')+'<div class="meeting-palette-standard">標準</div><div class="meeting-palette-grid">'+PROGRESS_STANDARD_COLORS.map(swatch).join('')+'</div>'+meetingCustomColorMarkup(current,"progressApplyPaletteColor('"+kind+"',document.getElementById('meeting-custom-color').value)");
  document.body.appendChild(palette);var rect=e.currentTarget.getBoundingClientRect(),pr=palette.getBoundingClientRect();palette.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-pr.width-8))+'px';palette.style.top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-pr.height-8))+'px';
};
window.renderProgressActionToolbar=function(){
  var p=privateSelectedCell&&privateSelectedCell(),m=meetingSelectedCell&&meetingSelectedCell(),s=scheduleSelected;
  if(m&&!progressCanEditDate(m.ds))m=null;if(s&&!progressCanEditDate(s.ds))s=null;
  var active=!!(p||m||s), strikeCall='', completeCall='';
  if(p){strikeCall="pnToggleStrike('"+p.type+"','"+p.ds+"',"+p.idx+")";completeCall="pnToggleComplete('"+p.type+"','"+p.ds+"',"+p.idx+")";}
  else if(m){strikeCall="mToggleStrike('"+m.rowId+"','"+m.ds+"',"+m.idx+")";completeCall="mToggleComplete('"+m.rowId+"','"+m.ds+"',"+m.idx+")";}
  else if(s){strikeCall="scheduleToggleStrike('"+s.projId+"','"+s.ds+"',"+s.ei+")";completeCall="scheduleToggleComplete('"+s.projId+"','"+s.ds+"',"+s.ei+")";}
  return '<span class="progress-action-toolbar" id="progress-action-toolbar">'+progressUndoButton()+'<button type="button" class="progress-icon-button progress-complete-button" title="完成" aria-label="完成" '+(active?'onclick="'+completeCall+'"':'disabled')+'>✓</button><button type="button" class="progress-icon-button progress-delete-button" title="刪除線" aria-label="刪除線" '+(active?'onclick="'+strikeCall+'"':'disabled')+'><span class="progress-strikethrough-icon" aria-hidden="true">S</span></button></span>';
};
window.refreshProgressActionToolbar=function(){
  var el=document.getElementById('progress-action-toolbar');if(el)el.outerHTML=renderProgressActionToolbar();
  var target=progressSelectedTarget();document.querySelectorAll('.meeting-color-button').forEach(function(button,index){var kind=index===0?'text':'bg',value=target?(target.item[kind==='text'?'color':'bg']||''):'';button.disabled=!target;button.onclick=target?function(event){openProgressColorPalette(event,kind,value);}:null;var bar=button.querySelector('.meeting-color-bar');if(bar)bar.style.background=value||(kind==='text'?'#202124':'#ffffff');});
};
window.pnSetBackground=async function(type,ds,idx,bg){
  var item=(((S.privateNotes||{})[type]||{})[ds]||[])[idx];if(!item)return;
  var pn=progressClone(S.privateNotes);pn[type][ds][idx]=Object.assign({},item,{bg:bg});
  S.privateNotes=pn;await setDoc(doc(db,'privateNotes',currentUser.uid),pn);
};
window.mToggleComplete=async function(rowId,ds,idx){
  var key=rowId+'_'+ds,items=progressClone((S.meetingLogs[key]||{}).items||[]);while(items.length<=idx)items.push({text:'',color:'',bg:'',mentions:[]});
  var nowDone=!items[idx].completed;
  items[idx]=Object.assign({},items[idx],{completed:nowDone,color:nowDone?'#E24B4A':(items[idx].color==='#E24B4A'?'':items[idx].color),completedBy:nowDone?currentUser.uid:null,completedAt:nowDone?new Date().toISOString():null});
  await setDoc(doc(db,'meetingLogs',key),{rowId:rowId,date:ds,items:items,updatedAt:serverTimestamp()});
};
window.mToggleStrike=async function(rowId,ds,idx){
  var key=rowId+'_'+ds,items=progressClone((S.meetingLogs[key]||{}).items||[]);while(items.length<=idx)items.push({text:'',color:'',bg:'',mentions:[]});
  items[idx]=Object.assign({},items[idx],{strike:!items[idx].strike});
  await setDoc(doc(db,'meetingLogs',key),{rowId:rowId,date:ds,items:items,updatedAt:serverTimestamp()});
};
async function editProgressScheduleItem(projId,ds,ei,edit){
  const change=progressScheduleChange(projId,ds,items=>{
    const entry=items.filter(item=>item.date===ds)[ei];
    return entry?items.map(item=>item===entry?edit(item):item):null;
  });
  if(change)await saveProgressSchedule([change]);
}
window.scheduleSetStyle=function(projId,ds,ei,field,value){
  if(!['color','bg'].includes(field))return;
  return editProgressScheduleItem(projId,ds,ei,item=>({...item,[field]:value}));
};
window.scheduleToggleComplete=function(projId,ds,ei){
  return editProgressScheduleItem(projId,ds,ei,item=>{
    const completed=!item.completed;
    return {...item,completed,color:completed?'#E24B4A':(item.color==='#E24B4A'?'':item.color),
      completedBy:completed?currentUser.uid:null,completedAt:completed?new Date().toISOString():null};
  });
};
window.scheduleToggleStrike=function(projId,ds,ei){
  return editProgressScheduleItem(projId,ds,ei,item=>({...item,strike:!item.strike}));
};
window.saveProgressSiteNote=async function(projId,month,value){
  if(!progressCanEditDate(month))return;
  const project=findProgressProject(projId);
  if(!project||!progressProjectVisible(project,month))return;
  const before=progressMonthNote(project,month),after=String(value||'');
  if(before!==after)await saveProgressSchedule([{projectId:projId,month,field:'siteNote',before,after}]);
};
function progressMeetingDragTargets(args){
  var event=args[0],toRowId=args[1],toDs=args[2],from=null,raw='';
  if(event?._meetingDropContext)from=event._meetingDropContext.from;
  try{raw=event?.dataTransfer?.getData('text/plain')||'';}catch(error){}
  if(raw){var parts=raw.split('|');if(parts.length===4&&parts[0]==='meet')from={rowId:parts[1],ds:parts[2]};}
  if(!from&&meetingDragSrc)from={rowId:meetingDragSrc.rowId,ds:meetingDragSrc.ds};
  var targets=[{kind:'meeting',key:toRowId+'_'+toDs,rowId:toRowId,ds:toDs}];
  if(from)targets.push({kind:'meeting',key:from.rowId+'_'+from.ds,rowId:from.rowId,ds:from.ds});
  return progressUniqueTargets(targets);
}
function progressScheduleDragTargets(args){
  const from=captureScheduleDrop(args[0]).from;
  return [{kind:'schedule',key:args[1],month:args[2].slice(0,7)}]
    .concat(from?[{kind:'schedule',key:from.projId,month:from.ds.slice(0,7)}]:[]);
}
function progressWrapOperation(name,targetFactory,label){
  var original=window[name];if(!original)return;
  window[name]=async function(){
    var args=[].slice.call(arguments);
    // 必須在第一個 await 前接住原生 drop，避免來源被 dragend 清掉或事件冒泡執行兩次。
    if(name==='pnDrop')pnCaptureDropContext(args[0]);
    if(name==='mDrop')mCaptureDropContext(args[0]);
    if(name==='saveScheduleCell'){
      const edit=captureScheduleCellEdit(args[0]);
      if(!edit)return;
      args[1]=edit;
    }
    if(progressUndoRunning)return original.apply(this,args);
    var targets=progressUniqueTargets(targetFactory(args)||[]),before=[];
    if(!progressCanWriteTargets(targets))return;
    for(const target of targets)before.push(await progressReadTarget(target));
    var result,after=[];
    try{result=await original.apply(this,args);}
    catch(error){
      if(!targets.some(target=>target.ds||target.month))throw error;
      setSynced();alert(error.message);
      if(activePanel==='progress')renderProgress(true);
      return;
    }
    for(const target of targets)after.push(await progressReadTarget(target));
    var changed=[];
    targets.forEach(function(target,index){if(!progressSame(before[index],after[index]))changed.push(Object.assign({},target,{before:before[index],after:after[index]}));});
    if(changed.length)progressUndoPush({action:name,label:typeof label==='function'?label(args):label,targets:changed});
    return result;
  };
}
function progressPrivateTarget(){return[{kind:'private',key:currentUser.uid}];}
function progressMeetingTarget(args,name){
  var rowId=name==='mSaveBox'?args[1]:args[0],ds=name==='mSaveBox'?args[2]:args[1];
  return rowId&&ds?[{kind:'meeting',key:rowId+'_'+ds,rowId:rowId,ds:ds}]:[];
}
function progressScheduleTarget(args,name){
  const {proj,ds}=name==='saveScheduleCell'?(args[0]?.dataset||{}):{proj:args[0],ds:args[1]};
  return proj&&ds?[{kind:'schedule',key:String(proj),month:ds.slice(0,7)}]:[];
}
[
  ['pnSetCellText','修改個人記事文字'],['pnSaveBlur','修改個人記事文字'],['pnSaveBox','修改個人記事文字'],
  ['pnSetColor','修改個人記事文字顏色'],['pnSetBackground','修改個人記事底色'],['pnToggleComplete','切換個人記事完成狀態'],
  ['pnToggleStrike','切換個人記事刪除線'],['pnAdd','新增個人記事'],['pnDelete','刪除個人記事'],['pnDrop','移動個人記事']
].forEach(function(entry){progressWrapOperation(entry[0],progressPrivateTarget,entry[1]);});
[
  ['mSetCellText','修改會議事項文字'],['mAdd','新增會議事項'],['mSetColor','修改會議事項顏色'],
  ['mToggleComplete','切換會議事項完成狀態'],['mToggleStrike','切換會議事項刪除線'],['mDelete','刪除會議事項'],
  ['mToggleMention','修改會議事項標記'],['mSaveBox','修改會議事項文字']
].forEach(function(entry){progressWrapOperation(entry[0],function(args){return progressMeetingTarget(args,entry[0]);},entry[1]);});
progressWrapOperation('mDrop',progressMeetingDragTargets,'移動會議事項');
[
  ['addEvFromStage','新增工程項目'],['copyTagToCell','複製工程項目'],['removeEv','刪除工程項目'],
  ['saveScheduleCell','修改工程項目備註'],['scheduleSetStyle','修改工程項目顏色'],
  ['scheduleToggleComplete','切換工程項目完成狀態'],['scheduleToggleStrike','切換工程項目刪除線']
].forEach(function(entry){progressWrapOperation(entry[0],function(args){return progressScheduleTarget(args,entry[0]);},entry[1]);});
progressWrapOperation('evDrop',progressScheduleDragTargets,'移動工程項目');
progressWrapOperation('saveProgressSiteNote',function(args){return args[0]?[{kind:'siteNote',key:String(args[0]),month:args[1]}]:[];},'修改工地共用備註');
progressWrapOperation('saveGlobalNote',function(args){return currentUser&&args[0]?[{kind:'globalNote',key:currentUser.uid+'_'+args[0]}]:[];},'修改我的記事本');
progressWrapOperation('saveTodoItemEdit',function(args){return String(args[0]||'').startsWith('m:')?[{kind:'userTodo',key:String(args[0]).slice(2)}]:progressPrivateTarget();},'修改工地待辦文字');
progressWrapOperation('toggleManualTodo',function(args){return args[0]?[{kind:'userTodo',key:String(args[0])}]:[];},'切換工地待辦完成狀態');
progressWrapOperation('deleteManualTodo',function(args){return args[0]?[{kind:'userTodo',key:String(args[0])}]:[];},'刪除工地待辦');
progressWrapOperation('deleteNoteTodoByKey',progressPrivateTarget,'刪除個人記事');
[
  ['saveRecurringRule','儲存自動排程'],['toggleRecurringRule','切換自動排程'],['deleteRecurringRule','刪除自動排程'],
  ['savePrivateNote','修改個人記事文字'],['togglePrivateNote','切換個人記事完成狀態'],['removePrivateNote','刪除個人記事']
].forEach(function(entry){progressWrapOperation(entry[0],progressPrivateTarget,entry[1]);});
// pnSaveBox is declared by the final shared module, after this feature file.
// Install its wrapper once the combined module bundle has finished evaluating.
setTimeout(function(){progressWrapOperation('pnSaveBox',progressPrivateTarget,'修改個人記事文字');},0);
document.addEventListener('keydown',function(e){
  if(activePanel!=='progress'||!(e.ctrlKey||e.metaKey)||e.key.toLowerCase()!=='z'||e.shiftKey)return;
  var el=document.activeElement;if(el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable))return;
  if(!progressUndoStack.length)return;e.preventDefault();progressUndo();
});
