// Runtime-composed source module. Keep declarations in shared application scope.
// Keep the several date-column tables (工地/會議記事, 每日施工日誌, 私人記事)
// scrolling left/right together, since they're visually one continuous
// timeline even though they're separate <table> elements.
let hscrollSyncing=false;
let lastHScrollLeft=0;
let hscrollSyncFrame=0;
let hscrollSyncSource=null;
let hscrollSyncTarget=0;
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
  const max=Math.max(0,source.scrollWidth-source.clientWidth);
  const next=Math.max(0,Math.min(max,left));
  if(Math.abs(source.scrollLeft-next)>.5)source.scrollLeft=next;
  lastHScrollLeft=next;
  if(calMode==='month')progressMonthScrollPositions[progressMonthKey()]=next;
  updateMobileProgressDateHeader(next);
  hscrollSyncSource=source;
  hscrollSyncTarget=next;
  if(!hscrollSyncFrame)hscrollSyncFrame=requestAnimationFrame(function(){
    hscrollSyncFrame=0;
    if(!hscrollSyncSource||!hscrollSyncSource.isConnected)return;
    hscrollSyncing=true;
    document.querySelectorAll('.hscroll-sync').forEach(function(other){
      if(other!==hscrollSyncSource&&Math.abs(other.scrollLeft-hscrollSyncTarget)>.5)other.scrollLeft=hscrollSyncTarget;
    });
    hscrollSyncing=false;
  });
  return next;
}
function setHorizontalScrollPosition(scroller,left){
  const max=Math.max(0,scroller.scrollWidth-scroller.clientWidth);
  const next=Math.max(0,Math.min(max,left));
  if(Math.abs(scroller.scrollLeft-next)>.5)scroller.scrollLeft=next;
  if(scroller.classList.contains('hscroll-sync')){
    lastHScrollLeft=next;
    if(calMode==='month')progressMonthScrollPositions[progressMonthKey()]=next;
    updateMobileProgressDateHeader(next);
  }
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
  if(e.target.closest('.pn-chip')||e.target.closest('.meet-chip')||e.target.closest('.formula-bar')||e.target.closest('.log-textarea'))return;
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
  const stages=getBibleStages().filter(s=>!isDesignStage(s));
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
window.addEvFromStage=async function(projId,ds,stage){
  openPicker=null;
  const proj=S.projects.find(p=>p.id===projId);if(!proj)return;
  const schedule=[...(proj.schedule||[]),{date:ds,stage,label:displayStageName(stage),time:'',note:''}];
  if(localTestMode){proj.schedule=schedule;setSynced();renderProgress();return;}
  setSyncing();await updateDoc(doc(db,'projects',projId),{schedule});setSynced();
}
window.handleCellBg=function(e,projId,ds){
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
  if(e.ctrlKey){selectedTag={projId,ds,ei,stage};renderProgress();return;}
  if(selectedTag){selectedTag=null;renderProgress();return;}
  if(stage&&getBibleStages().includes(stage)){
    const proj=S.projects.find(p=>p.id===projId);
    openCheckMo(projId,stage,stage,proj?.name||'');
  }
}
async function copyTagToCell(toProjId,toDs){
  if(!selectedTag)return;
  const srcProj=S.projects.find(p=>p.id===selectedTag.projId);if(!srcProj)return;
  const ev=(srcProj.schedule||[]).filter(e=>e.date===selectedTag.ds)[selectedTag.ei];if(!ev)return;
  const toProj=S.projects.find(p=>p.id===toProjId);if(!toProj)return;
  const schedule=[...(toProj.schedule||[]),{...ev,date:toDs}];
  setSyncing();await updateDoc(doc(db,'projects',toProjId),{schedule});setSynced();selectedTag=null;
}
var evDragSrc=null;
window.evDragStart=function(e,projId,ds,ei){
  evDragSrc={projId,ds,ei};
  e.dataTransfer.effectAllowed='copyMove';
  e.dataTransfer.setData('text/plain','ev|'+projId+'|'+ds+'|'+ei);
}
window.evDrop=async function(e,toProjId,toDs){
  e.preventDefault();e.stopPropagation();
  const raw=e.dataTransfer.getData('text/plain');
  let from=null;
  if(raw){const parts=raw.split('|');if(parts.length===4&&parts[0]==='ev')from={projId:parts[1],ds:parts[2],ei:parseInt(parts[3])};}
  if(!from)from=evDragSrc;
  if(!from)return;
  const srcProj=S.projects.find(p=>p.id===from.projId);if(!srcProj)return;
  const dayEvs=(srcProj.schedule||[]).filter(ev=>ev.date===from.ds);
  const ev=dayEvs[from.ei];if(!ev){evDragSrc=null;return;}
  const toProj=S.projects.find(p=>p.id===toProjId);if(!toProj){evDragSrc=null;return;}
  if(from.projId===toProjId&&from.ds===toDs){evDragSrc=null;return;}
  setSyncing();
  if(!e.ctrlKey&&from.projId===toProjId){
    const idx=(srcProj.schedule||[]).indexOf(ev);
    if(idx>=0){
      const moved=[...(srcProj.schedule||[])];
      moved.splice(idx,1);
      moved.push({...ev,date:toDs});
      await updateDoc(doc(db,'projects',toProjId),{schedule:moved});
    }
    evDragSrc=null;
    setSynced();
    return;
  }
  await updateDoc(doc(db,'projects',toProjId),{schedule:[...(toProj.schedule||[]),{...ev,date:toDs}]});
  if(!e.ctrlKey){
    const idx=(srcProj.schedule||[]).indexOf(ev);
    if(idx>=0){
      const ns=[...(srcProj.schedule||[]).slice(0,idx),...(srcProj.schedule||[]).slice(idx+1)];
      await updateDoc(doc(db,'projects',from.projId),{schedule:ns});
    }
  }
  evDragSrc=null;
  setSynced();
}
window.removeEv=async function(projId,ds,ei){
  const proj=S.projects.find(p=>p.id===projId);if(!proj)return;
  const dayEvs=(proj.schedule||[]).filter(e=>e.date===ds);
  const toRemove=dayEvs[ei];if(!toRemove)return;
  const eventName=toRemove.label||toRemove.stage||'此工程排程';
  if(!window.confirm(`確定要刪除「${eventName}」嗎？\n\n按 Enter 可確認刪除，按 Esc 可取消。`))return;
  const idx=(proj.schedule||[]).indexOf(toRemove);
  const ns=[...(proj.schedule||[]).slice(0,idx),...(proj.schedule||[]).slice(idx+1)];
  setSyncing();await updateDoc(doc(db,'projects',projId),{schedule:ns});setSynced();
}
function scheduleCellKey(projId,ds,ei){return{projId:String(projId),ds:String(ds),ei:Number(ei)};}
function scheduleCellIsSelected(projId,ds,ei){return !!scheduleSelected&&scheduleSelected.projId===String(projId)&&scheduleSelected.ds===String(ds)&&scheduleSelected.ei===Number(ei);}
function scheduleCellIsEditing(projId,ds,ei){return !!scheduleEditing&&scheduleEditing.projId===String(projId)&&scheduleEditing.ds===String(ds)&&scheduleEditing.ei===Number(ei);}
window.selectScheduleCell=function(span){
  const next=scheduleCellKey(span.dataset.proj,span.dataset.ds,span.dataset.ei);
  if(scheduleEditing&&!scheduleCellIsEditing(next.projId,next.ds,next.ei))window.saveScheduleCell(document.querySelector('.ev-field[contenteditable="true"]'));
  clearSpreadsheetSelections('schedule');
  scheduleSelected=next;scheduleEditing=null;
  document.querySelectorAll('.ev-field.excel-selected').forEach(el=>el.classList.remove('excel-selected'));
  span.classList.add('excel-selected');
}
window.startFieldEdit=function(span){
  const next=scheduleCellKey(span.dataset.proj,span.dataset.ds,span.dataset.ei);
  scheduleSelected=next;scheduleEditing=next;scheduleEditOriginal=span.textContent||'';
  span.classList.add('excel-selected','excel-editing');span.contentEditable='true';span.focus();
  const range=document.createRange();range.selectNodeContents(span);range.collapse(false);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
}
window.startScheduleEditWithText=function(text){
  if(!scheduleSelected)return;const span=document.querySelector(`.ev-field[data-proj="${CSS.escape(scheduleSelected.projId)}"][data-ds="${CSS.escape(scheduleSelected.ds)}"][data-ei="${scheduleSelected.ei}"]`);if(!span)return;
  window.startFieldEdit(span);span.textContent=text;
  const range=document.createRange();range.selectNodeContents(span);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
}
window.saveScheduleCell=async function(span){
  if(!span||!scheduleEditing)return;
  const state=scheduleEditing,proj=S.projects.find(p=>p.id===state.projId);if(!proj)return;
  const ev=(proj.schedule||[]).filter(e=>e.date===state.ds)[state.ei];if(!ev)return;
  const nextText=span.textContent.trim();scheduleEditing=null;span.contentEditable='false';span.classList.remove('excel-editing');
  if(nextText===(ev.note||''))return;
  const schedule=[...(proj.schedule||[])],absIdx=schedule.indexOf(ev);if(absIdx<0)return;schedule[absIdx]={...ev,note:nextText};
  if(localTestMode){proj.schedule=schedule;setSynced();return;}
  setSyncing();await updateDoc(doc(db,'projects',state.projId),{schedule});setSynced();
}
window.scheduleCellKeyDown=function(e,span){
  if(e.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'){e.preventDefault();span.textContent=scheduleEditOriginal;span.blur();return;}
  if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const direction=e.key==='Enter'?'down':(e.shiftKey?'left':'right');window.saveScheduleCell(span).then(()=>moveScheduleSelection(direction));}
}
function moveScheduleSelection(direction){
  if(!scheduleSelected)return;const days=getWeekDates().map(fmtDay),projects=sortDesignProjs(S.projects.filter(p=>p.status==='prog'));
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
  const base=today();
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
    const evs=(p.schedule||[]).filter(e=>e.date===ds);
    if(!evs.length)return;hasAny=true;
    html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl2);padding:14px 16px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:500;margin-bottom:8px;color:${tc(pi)}">${p.name}</div>
      ${evs.map(ev=>{const resolvedStage=resolveBibleStage(ev.stage,ev.label),pn=pendingCount(p.id,resolvedStage);
        return`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
          ${ev.time?`<span style="font-size:11px;color:var(--text2)">${ev.time}</span>`:''}
          <span style="background:${sc(pi)};color:${tc(pi)};padding:3px 9px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer"
            onclick="openCheckMo('${p.id}','${resolvedStage}','${ev.label||ev.stage}','${p.name}')">${ev.label||ev.stage}</span>
          ${ev.note?`<span style="font-size:11px;color:var(--text2)">${ev.note}</span>`:''}
          ${pendBadge(pn)}
        </div>`;}).join('')}
    </div>`;
  });
  if(!hasAny)html+=`<div class="empty">今日無工地排程</div>`;
  return html+'</div>';
}

let openCheckMoArgs=null;
window.openCheckMo=function(projId,stage,label,projName){
  if(!stage)return;
  const proj=S.projects.find(p=>p.id===projId);
  const metaItems=projectBibleItemsMeta(proj,stage);
  if(!metaItems.length){alert('此階段尚無項目');return;}
  const isEstimate=!!(S.bible[stage]&&S.bible[stage].isEstimate);
  const key=`${projId}_${stage}`;const stored=S.checks[key]||[];
  const merged=metaItems.map((m,i)=>({text:m.text,depth:m.depth,isSub:m.isSub,done:stored[i]?.done||false,skip:stored[i]?.skip||false,amount:stored[i]?.amount||''}));
  const done=merged.filter(x=>x.done||x.skip).length;const pct=Math.round(done/merged.length*100);
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
      itemsHtml+=renderCheckItemRow(projId,stage,i,merged[i],isEstimate);
    }
  });
  const oldScroll=$('mo-content').querySelector('.estimate-check-list')?.scrollTop||0;
  $('mo-content').classList.toggle('estimate-check-modal',isEstimate);
  const summary=`<div class="mo-title">${label}</div>
    <div class="mo-sub">${projName} — ${done}/${merged.length} 完成${isEstimate?`　｜　粗估總金額：<strong>${totalAmount.toLocaleString()}</strong>`:''}</div>
    <div class="pb-wrap"><div class="pb-fill" style="width:${pct}%;background:${pct===100?'var(--teal)':'var(--purple)'}"></div></div>`;
  $('mo-content').innerHTML=isEstimate
    ?`<div class="estimate-check-head">${summary}</div><div class="estimate-check-list">${itemsHtml}<div class="mo-footer"><button class="btn" onclick="closeMo()">關閉</button></div></div>`
    :`${summary}${itemsHtml}<div class="mo-footer"><button class="btn" onclick="closeMo()">關閉</button></div>`;
  if(isEstimate)$('mo-content').querySelector('.estimate-check-list').scrollTop=oldScroll;
  $('mo-content').style.maxWidth=isEstimate?'520px':'880px';
  $('modal').style.display='flex';
  openCheckMoArgs={projId,stage,label,projName};
}
window.closeMo=function(){$('modal').style.display='none';delete $('mo-content').dataset.lockBackdrop;openCheckMoArgs=null;$('mo-content').style.maxWidth='';$('mo-content').classList.remove('project-detail-modal','module-manager-modal','company-duty-settings','sticky-wall-modal','estimate-check-modal','recurring-manager-modal','announcement-modal');if(bibleDeleteModalScrollPosition)restoreBibleDeleteModalScrollPosition();}
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&$('modal').style.display==='flex'&&!$('mo-content').dataset.lockBackdrop){
    e.preventDefault();
    closeMo();
  }
});
function isBibleInlineEditing(){
  const focused=document.activeElement;
  return activePanel==='bible'&&bibleView==='edit'&&!!focused?.matches('#panel-bible input, #panel-bible textarea');
}
function renderAfterCheckSync(){
  if(!isBibleInlineEditing())renderActive();
}
window.setCheckStatus=async function(projId,stage,idx,status){
  const proj=S.projects.find(p=>p.id===projId);
  const allItems=projectBibleItems(proj,stage);
  const key=`${projId}_${stage}`;
  const stored=[...(S.checks[key]||allItems.map(t=>({text:t,done:false})))];
  while(stored.length<allItems.length)stored.push({done:false});
  const cur=stored[idx]||{};
  const newDone=status==='done'?!cur.done:false;
  const newSkip=status==='skip'?!cur.skip:false;
  stored[idx]={...cur,done:newDone,skip:newSkip};
  S.checks=Object.assign({},S.checks,{[key]:stored});
  // Reflect the change immediately — the open modal is a one-off innerHTML
  // snapshot, so it needs an explicit re-render; it isn't part of the
  // normal panel re-render that Firestore's onSnapshot triggers.
  if(openCheckMoArgs&&openCheckMoArgs.projId===projId&&openCheckMoArgs.stage===stage){
    openCheckMo(openCheckMoArgs.projId,openCheckMoArgs.stage,openCheckMoArgs.label,openCheckMoArgs.projName);
  }
  if(activePanel==='progress')renderProgress();
  else if(activePanel==='bible'&&!isBibleInlineEditing()){rememberBibleScrollPosition(2);renderBible();}
  setSyncing();
  try{await setDoc(doc(db,'checks',key),{items:stored});setSynced();}catch(e){setOffline();}
}
window.setCheckAmount=async function(projId,stage,idx,value){
  const proj=S.projects.find(p=>p.id===projId);
  const allItems=projectBibleItems(proj,stage);
  const key=`${projId}_${stage}`;
  const stored=[...(S.checks[key]||allItems.map(t=>({text:t,done:false})))];
  while(stored.length<allItems.length)stored.push({done:false});
  const cur=stored[idx]||{};
  stored[idx]={...cur,amount:value};
  S.checks=Object.assign({},S.checks,{[key]:stored});
  if(openCheckMoArgs&&openCheckMoArgs.projId===projId&&openCheckMoArgs.stage===stage){
    openCheckMo(openCheckMoArgs.projId,openCheckMoArgs.stage,openCheckMoArgs.label,openCheckMoArgs.projName);
  }
  setSyncing();
  try{await setDoc(doc(db,'checks',key),{items:stored});setSynced();}catch(e){setOffline();}
}
