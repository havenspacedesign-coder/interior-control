// Runtime-composed source module. Keep declarations in shared application scope.
// ── Fixed meeting rows (客戶會議/丈量・廠商會議・丈量・其他) under the site
// table — same chip interaction as 工地記事 (select/edit/color/drag), plus a
// background-color option, plus @member mention that auto-copies the entry
// into that member's daily log for the same day ──
window.mSelect=function(rowId,ds,idx){
  const activeEdit=meetingEditing;
  if(activeEdit&&!(activeEdit.rowId===rowId&&activeEdit.ds===ds&&activeEdit.idx===idx)){
    const pending=meetingPendingSelection,samePending=pending&&pending.rowId===rowId&&pending.ds===ds&&pending.idx===idx;
    meetingPendingSelection={rowId:rowId,ds:ds,idx:idx,edit:!!(samePending&&pending.edit)};
    return;
  }
  const current=meetingSelectedCell();
  if(!activeEdit&&current&&current.rowId===rowId&&current.ds===ds&&current.idx===idx)return;
  clearSpreadsheetSelections('meeting');
  meetingSelGen++;
  meetingSelected={};
  meetingSelected[rowId+'|'+ds]=idx;
  meetingEditing=null;
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)||[];
  const linked=normalizeLinkedItem(items[idx]||{});
  updateFormulaBar('meeting',ds,idx,linked.text,rowId,linked.link);
  if(activePanel==='progress')renderProgress(true);
}
window.mSelectEmpty=function(rowId,ds){mSelect(rowId,ds,0);}
function mRefreshSelectionOutline(selectedEl){
  document.querySelectorAll('.meet-chip.meet-chip-sel,.meet-chip.excel-selected').forEach(function(el){
    el.classList.remove('meet-chip-sel','excel-selected');
    const cell=el.closest('[data-meeting-cell]'),parts=(cell?.dataset.meetingCell||'').split('|');
    const item=((S.meetingLogs[parts[0]+'_'+parts[1]]||{}).items||[])[0];
    const filled=!!item&&(String(item.text||'').trim()!==''||(item.mentions||[]).length>0);
    el.style.border='1.5px '+(filled?'solid':'dashed')+' var(--border)';
  });
  if(selectedEl){selectedEl.classList.add('meet-chip-sel');selectedEl.style.border='2px solid var(--purple)';}
}
var meetingPointerHeld=false;
function mResumeProgressRender(){if(!meetingPointerHeld&&!meetingDragSrc&&pendingProgressRender&&activePanel==='progress')renderProgress();}
document.addEventListener('mouseup',function(){if(!meetingPointerHeld)return;meetingPointerHeld=false;setTimeout(mResumeProgressRender,0);},true);
window.addEventListener('blur',function(){meetingPointerHeld=false;setTimeout(mResumeProgressRender,0);});
window.mPointerSelect=function(e,rowId,ds,idx){
  if(e.button===0)meetingPointerHeld=true;
  const pointerKey=rowId+'|'+ds+'|'+idx,now=Date.now();
  const isRapidSecond=meetingRapidPointer.key===pointerKey&&now-meetingRapidPointer.time<=500;
  meetingRapidPointer=isRapidSecond?{key:'',time:0}:{key:pointerKey,time:now};
  const activeEdit=meetingEditing;
  if(activeEdit){
    if(activeEdit.rowId===rowId&&activeEdit.ds===ds&&activeEdit.idx===idx)return;
    meetingPendingSelection={rowId:rowId,ds:ds,idx:idx,edit:isRapidSecond};
    return;
  }
  // 已輸入的模塊由 dblclick 進入編輯，第二次按住時不可先重畫並移除拖曳來源。
  if(isRapidSecond&&!e.currentTarget.draggable){mStartEdit(rowId,ds,idx);return;}
  const current=meetingSelectedCell();
  mRefreshSelectionOutline(e.currentTarget);
  if(current&&current.rowId===rowId&&current.ds===ds&&current.idx===idx)return;
  clearSpreadsheetSelections('meeting');
  meetingSelGen++;meetingSelected={};meetingSelected[rowId+'|'+ds]=idx;
  const item=(((S.meetingLogs||{})[rowId+'_'+ds]||{}).items||[])[idx]||{};
  const linked=normalizeLinkedItem(item);
  updateFormulaBar('meeting',ds,idx,linked.text,rowId,linked.link);
  refreshProgressActionToolbar();
}
window.mStartEdit=function(rowId,ds,idx){
  meetingPendingSelection=null;meetingRapidPointer={key:'',time:0};
  clearSpreadsheetSelections('meeting');
  meetingSelGen++;meetingSelected={};meetingSelected[rowId+'|'+ds]=idx;meetingEditing={rowId:rowId,ds:ds,idx:idx};meetingEditCanceled=false;
  const item=((S.meetingLogs[rowId+'_'+ds]||{}).items||[])[idx]||{};updateFormulaBar('meeting',ds,idx,item.text||'',rowId,item.link||null);renderProgress(true);
  setTimeout(function(){const input=document.getElementById('meetbox-'+rowId+'-'+ds+'-'+idx);if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}},0);
}
window.mStartEditWithChar=function(rowId,ds,idx,text){
  clearSpreadsheetSelections('meeting');
  meetingSelGen++;meetingSelected={};meetingSelected[rowId+'|'+ds]=idx;meetingEditing={rowId:rowId,ds:ds,idx:idx};meetingEditCanceled=false;updateFormulaBar('meeting',ds,idx,text,rowId,null);renderProgress(true);
  setTimeout(function(){const input=document.getElementById('meetbox-'+rowId+'-'+ds+'-'+idx);if(input){input.value=text;input.focus();input.setSelectionRange(text.length,text.length);}},0);
}
window.mEditKeyDown=function(e,input,rowId,ds,idx){
  if(e.isComposing||e.keyCode===229)return;
  if(e.key==='Escape'){e.preventDefault();meetingEditCanceled=true;input.blur();return;}
  if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();mSaveBox(input,rowId,ds,idx).then(function(){mMove(rowId,ds,e.key==='Enter'?'down':(e.shiftKey?'left':'right'));});}
}
window.mMove=function(rowId,ds,direction){
  const days=getWeekDates().map(fmtDay),rows=MEETING_ROWS.map(r=>r.id);let ri=rows.indexOf(rowId),di=days.indexOf(ds);if(ri<0||di<0)return;
  if(direction==='left')di--;else if(direction==='right')di++;else if(direction==='up')ri--;else ri++;
  if(ri<0||di<0||ri>=rows.length||di>=days.length)return;mSelectEmpty(rows[ri],days[di]);
}
window.mSetCellText=async function(rowId,ds,text){
  const key=rowId+'_'+ds,items=(S.meetingLogs[key]&&S.meetingLogs[key].items)?[...S.meetingLogs[key].items]:[];
  if(!String(text||'').trim()&&items.length){
    setSyncing();await setDoc(doc(db,'meetingLogs',key),{rowId,date:ds,items:items.slice(1),updatedAt:serverTimestamp()});
    for(const uid of (items[0].mentions||[]))await mRemoveFromDailyLog(rowId,ds,0,uid);
    meetingEditing=null;meetingSelected={};updateFormulaBar(null);setSynced();if(activePanel==='progress')renderProgress();return;
  }
  if(!items.length&&text===''){mSelectEmpty(rowId,ds);return;}while(items.length<1)items.push({text:'',color:'',bg:'',mentions:[]});items[0]=Object.assign({},items[0],{text:text,link:null});
  setSyncing();await setDoc(doc(db,'meetingLogs',key),{rowId:rowId,date:ds,items:items,updatedAt:serverTimestamp()});for(const uid of (items[0].mentions||[]))await mSyncDailyLog(rowId,ds,0,uid,items[0]);setSynced();meetingEditing=null;meetingSelected={};meetingSelected[rowId+'|'+ds]=0;if(activePanel==='progress')renderProgress();
}
window.mAdd=async function(rowId,ds){
  if(!currentUser)return;
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)?[...S.meetingLogs[key].items]:[];
  if(items.length>=1)return; // one entry per cell
  items.push({text:'',color:'',bg:'',mentions:[]});
  setSyncing();
  await setDoc(doc(db,'meetingLogs',key),{rowId,date:ds,items,updatedAt:serverTimestamp()});
  setSynced();
  meetingSelGen++;
  mSelect(rowId,ds,0);
}
var meetingColorPreview=null;
function beginMeetingColorPreview(target,kind){
  if(!target)return;
  const ref=target.ref,property=kind==='text'?'color':'background',nodes=[];
  let chip=null;
  if(target.kind==='meeting')chip=document.querySelector('[data-meeting-cell="'+CSS.escape(ref.rowId+'|'+ref.ds)+'"] .meet-chip');
  else if(target.kind==='private')chip=document.querySelector('[data-pn-cell="'+CSS.escape(ref.type+'|'+ref.ds)+'"] .pn-chip[data-pn-index="'+ref.idx+'"]')||document.getElementById('pnbox-'+ref.type+'-'+ref.ds+'-'+ref.idx);
  else{
    chip=document.querySelector('.ev-field[data-proj="'+CSS.escape(ref.projId)+'"][data-ds="'+CSS.escape(ref.ds)+'"][data-ei="'+ref.ei+'"]');
    const tag=chip?.parentElement.querySelector('.ev-chip');if(tag)nodes.push(tag);
  }
  if(chip){nodes.push(chip);if(chip.tagName==='INPUT'&&kind==='bg')nodes.push(chip.parentElement);}
  meetingColorPreview={target:{kind:target.kind,ref:{...ref}},kind,styles:[...new Set(nodes)].map(el=>({el,property,value:el.style.getPropertyValue(property),priority:el.style.getPropertyPriority(property)}))};
}
window.closeMeetingColorPalette=function(){
  if(meetingColorPreview){
    meetingColorPreview.styles.forEach(({el,property,value,priority})=>{if(value)el.style.setProperty(property,value,priority);else el.style.removeProperty(property);});
    meetingColorPreview=null;
  }
  const old=document.getElementById('meeting-color-palette');
  if(old){old.remove();setTimeout(function(){if(pendingProgressRender&&activePanel==='progress')renderProgress();},0);}
};
function meetingCustomColorMarkup(current,applyCall){
  const color=/^#[0-9a-f]{6}$/i.test(current||'')?current:'#000000';
  return '<div class="meeting-palette-custom"><label><span>自訂</span><input id="meeting-custom-color" type="color" value="'+color+'" aria-label="自訂顏色" oninput="mPreviewCustomColor(this.value)" onchange="mPreviewCustomColor(this.value)"></label><input id="meeting-custom-hex" type="text" value="'+color+'" aria-label="自訂色碼" maxlength="7" pattern="#[0-9a-fA-F]{6}" required oninput="mPreviewCustomColor(this.value)"><button type="button" class="btn btn-sm" onclick="event.stopPropagation();if(!document.getElementById(\'meeting-custom-hex\').reportValidity())return;'+applyCall+'">確定</button></div>';
}
window.mPreviewCustomColor=function(value){
  if(!/^#[0-9a-f]{6}$/i.test(value||''))return;
  const palette=document.getElementById('meeting-color-palette');if(!palette)return;
  palette.querySelector('#meeting-custom-color').value=value;
  palette.querySelector('#meeting-custom-hex').value=value;
  if(meetingColorPreview)meetingColorPreview.styles.forEach(({el,property})=>el.style.setProperty(property,value));
};
window.openMeetingColorPalette=function(e,rowId,ds,idx,kind,current){
  e.stopPropagation();
  closeMeetingColorPalette();
  beginMeetingColorPreview({kind:'meeting',ref:{rowId,ds,idx}},kind);
  const palette=document.createElement('div');
  palette.id='meeting-color-palette';
  palette.className='meeting-color-palette';
  const swatch=function(color){
    const selected=(current||'').toLowerCase()===color.toLowerCase();
    return '<button type="button" class="meeting-palette-swatch'+(selected?' selected':'')+'" style="background:'+color+'" title="'+color+'" aria-label="選擇 '+color+'" onclick="mPickMeetingColor(\''+rowId+'\',\''+ds+'\','+idx+',\''+kind+'\',\''+color+'\')">'+(selected?'✓':'')+'</button>';
  };
  palette.innerHTML='<button type="button" class="meeting-palette-reset" onclick="mPickMeetingColor(\''+rowId+'\',\''+ds+'\','+idx+',\''+kind+'\',\'\')">↙&nbsp; 重設</button>'
    +MEETING_COLOR_ROWS.map(function(row){return '<div class="meeting-palette-grid">'+row.map(swatch).join('')+'</div>';}).join('')
    +'<div class="meeting-palette-standard">標準</div><div class="meeting-palette-grid">'+MEETING_STANDARD_COLORS.map(swatch).join('')+'</div>'
    +meetingCustomColorMarkup(current,"mPickMeetingColor('"+rowId+"','"+ds+"',"+idx+",'"+kind+"',document.getElementById('meeting-custom-color').value)");
  document.body.appendChild(palette);
  const rect=e.currentTarget.getBoundingClientRect();
  const pr=palette.getBoundingClientRect();
  palette.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-pr.width-8))+'px';
  palette.style.top=Math.max(8,Math.min(rect.bottom+6,window.innerHeight-pr.height-8))+'px';
};
window.mPickMeetingColor=async function(rowId,ds,idx,kind,val){
  closeMeetingColorPalette();
  await mSetColor(rowId,ds,idx,kind,val);
};
window.mSetColor=async function(rowId,ds,idx,kind,val){
  if(!currentUser)return;
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)?[...S.meetingLogs[key].items]:[];
  if(idx<0)return;
  while(items.length<=idx)items.push({text:'',color:'',bg:'',mentions:[]});
  items[idx]=Object.assign({},items[idx],kind==='text'?{color:val}:{bg:val});
  setSyncing();
  await setDoc(doc(db,'meetingLogs',key),{rowId,date:ds,items,updatedAt:serverTimestamp()});
  for(const uid of (items[idx].mentions||[]))await mSyncDailyLog(rowId,ds,idx,uid,items[idx]);
  setSynced();
}
window.mDelete=async function(rowId,ds,idx){
  if(!currentUser)return;
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)?[...S.meetingLogs[key].items]:[];
  const removed=items[idx];
  if(!removed)return;
  items.splice(idx,1);
  meetingSelected={};meetingEditing=null;updateFormulaBar(null);
  setSyncing();
  await setDoc(doc(db,'meetingLogs',key),{rowId,date:ds,items,updatedAt:serverTimestamp()});
  if(removed&&removed.mentions&&removed.mentions.length){
    for(const uid of removed.mentions){
      await mRemoveFromDailyLog(rowId,ds,idx,uid);
    }
  }
  setSynced();
}
window.mDragStart=function(e,rowId,ds,idx){
  meetingDragSrc={rowId,ds,idx};
  e.currentTarget.classList.add('meet-dragging');
  e.dataTransfer.effectAllowed='copyMove';
  e.dataTransfer.setData('text/plain','meet|'+rowId+'|'+ds+'|'+idx);
}
window.mDragOver=function(e){if(!meetingDragSrc)return;e.preventDefault();e.dataTransfer.dropEffect=e.ctrlKey?'copy':'move';e.currentTarget.classList.add('meet-drop-active');}
window.mDragLeave=function(e){if(!e.currentTarget.contains(e.relatedTarget))e.currentTarget.classList.remove('meet-drop-active');}
window.mDragEnd=function(){document.querySelectorAll('.meet-dragging').forEach(el=>el.classList.remove('meet-dragging'));document.querySelectorAll('.meet-drop-active').forEach(el=>el.classList.remove('meet-drop-active'));meetingDragSrc=null;meetingPointerHeld=false;setTimeout(mResumeProgressRender,0);}
function mCaptureDropContext(e){
  if(e._meetingDropContext)return e._meetingDropContext;
  e.preventDefault();e.stopPropagation();e.currentTarget?.classList.remove('meet-drop-active');
  let from=null,raw='';try{raw=e.dataTransfer?.getData('text/plain')||'';}catch(error){}
  if(raw){const parts=raw.split('|');if(parts.length===4&&parts[0]==='meet')from={rowId:parts[1],ds:parts[2],idx:parseInt(parts[3],10)};}
  if(!from&&meetingDragSrc)from={...meetingDragSrc};
  return e._meetingDropContext={from,copy:!!e.ctrlKey};
}
window.mDrop=async function(e,toRowId,toDs){
  const context=mCaptureDropContext(e),from=context.from;
  if(!from||!currentUser)return;
  if(from.rowId===toRowId&&from.ds===toDs){meetingDragSrc=null;return;}
  const toKey=toRowId+'_'+toDs;
  const toItems=(S.meetingLogs[toKey]&&S.meetingLogs[toKey].items)?[...S.meetingLogs[toKey].items]:[];
  if(toItems.length>=1){meetingDragSrc=null;return;} // target cell already has an entry
  const fromKey=from.rowId+'_'+from.ds;
  const fromItems=(S.meetingLogs[fromKey]&&S.meetingLogs[fromKey].items)?[...S.meetingLogs[fromKey].items]:[];
  const item=fromItems[from.idx];
  if(!item){meetingDragSrc=null;return;}
  const movedItem=Object.assign({},item,{mentions:[...(item.mentions||[])]});
  toItems.push(movedItem);
  const toIdx=toItems.length-1;
  setSyncing();
  await setDoc(doc(db,'meetingLogs',toKey),{rowId:toRowId,date:toDs,items:toItems,updatedAt:serverTimestamp()});
  for(const uid of movedItem.mentions)await mSyncDailyLog(toRowId,toDs,toIdx,uid,movedItem);
  if(!context.copy){
    for(const uid of movedItem.mentions)await mRemoveFromDailyLog(from.rowId,from.ds,from.idx,uid);
    fromItems.splice(from.idx,1);
    await setDoc(doc(db,'meetingLogs',fromKey),{rowId:from.rowId,date:from.ds,items:fromItems,updatedAt:serverTimestamp()});
  }
  meetingSelected={};meetingSelected[toRowId+'|'+toDs]=toIdx;
  updateFormulaBar('meeting',toDs,toIdx,movedItem.text||'',toRowId,movedItem.link||null);
  meetingDragSrc=null;
  setSynced();
}
// Tag-people picker (replaces the old inline @typing mention) — hover "+ 標記"
// to open a checklist of members; tagging pushes the entry's own text into
// that member's daily log, and untagging removes exactly that line again.
var mCloseTimer=null;
window.mScheduleCloseMention=function(rowId,ds){
  clearTimeout(mCloseTimer);
  mCloseTimer=setTimeout(function(){
    const menuEl=document.getElementById('meet-mention-'+rowId+'-'+ds);
    if(menuEl)menuEl.style.display='none';
    if(pendingProgressRender&&activePanel==='progress')renderProgress();
  },250);
}
window.mCancelCloseMention=function(){
  clearTimeout(mCloseTimer);
}
var mMentionToggleQueues={};
function mEffectiveMentions(rowId,ds,idx){
  const mentions=[...((((S.meetingLogs[rowId+'_'+ds]||{}).items||[])[idx]||{}).mentions||[])];
  const queue=mMentionToggleQueues[rowId+'|'+ds+'|'+idx];
  for(const intent of (queue?.pending||[])){
    const at=mentions.indexOf(intent.uid);
    if(intent.checked&&at<0)mentions.push(intent.uid);else if(!intent.checked&&at>=0)mentions.splice(at,1);
  }
  return mentions;
}
function mRefreshMentionMenu(rowId,ds,idx){
  const menu=document.getElementById('meet-mention-'+rowId+'-'+ds);if(!menu)return;
  const mentions=mEffectiveMentions(rowId,ds,idx);
  menu.querySelectorAll('.meeting-mention-option').forEach(function(option){
    const checked=mentions.includes(option.dataset.memberUid);
    option.setAttribute('aria-checked',String(checked));
    const box=option.querySelector('.meeting-mention-check');box.classList.toggle('checked',checked);box.textContent=checked?'✓':'';
  });
}
window.mRequestMentionToggle=function(rowId,ds,idx,uid,option){
  if(!currentUser||!markableMembersList().some(m=>m.uid===uid))return;
  const key=rowId+'|'+ds+'|'+idx,queue=mMentionToggleQueues[key]||(mMentionToggleQueues[key]={pending:[],tail:Promise.resolve()});
  const input=document.getElementById('meetbox-'+rowId+'-'+ds+'-'+idx);
  const intent={uid,checked:option.getAttribute('aria-checked')!=='true',draft:input?{text:input.value,link:linkFromInput(input,input.value)}:null};
  queue.pending.push(intent);
  // 先更新勾選框；儲存與日誌同步依序在背景完成，不等待網路才顯示。
  mRefreshMentionMenu(rowId,ds,idx);
  queue.tail=queue.tail.then(function(){return mToggleMention(rowId,ds,idx,uid,intent.checked,intent.draft);}).catch(function(error){
    console.error('標記或日誌同步未完成',error);setOffline();alert('標記或日誌同步未完成，請稍後再試。');
  }).finally(function(){
    queue.pending.splice(queue.pending.indexOf(intent),1);
    mRefreshMentionMenu(rowId,ds,idx);
    if(!queue.pending.length)delete mMentionToggleQueues[key];
  });
  return queue.tail;
};
function mMentionMenuHTML(rowId,ds,idx){
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)||[];
  const item=items[idx]||{};
  const mentions=mEffectiveMentions(rowId,ds,idx);
  return markableMembersList().map(function(m){
    const checked=mentions.indexOf(m.uid)>=0;
    return'<button type="button" role="checkbox" aria-checked="'+checked+'" aria-label="'+escAttr(memberDisplayName(m))+'" data-member-uid="'+escAttr(m.uid)+'" class="meeting-mention-option" onmousedown="event.preventDefault()" onclick="event.stopPropagation();mRequestMentionToggle(\''+rowId+'\',\''+ds+'\','+idx+',\''+m.uid+'\',this)">'
      +'<span class="meeting-mention-check '+(checked?'checked':'')+'" aria-hidden="true">'+(checked?'✓':'')+'</span><span>'+escAttr(memberDisplayName(m))+'</span></button>';
  }).join('');
}
window.mOpenMentionPicker=function(e,rowId,ds,idx){
  clearTimeout(mCloseTimer);
  const menuEl=document.getElementById('meet-mention-'+rowId+'-'+ds);
  if(!menuEl)return;
  const rect=e.currentTarget.getBoundingClientRect();
  menuEl.style.cssText='display:block;position:fixed;top:'+(rect.bottom+4)+'px;left:'+rect.left+'px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:500;min-width:150px;max-height:200px;overflow-y:auto';
  menuEl.innerHTML=mMentionMenuHTML(rowId,ds,idx);
}
window.mToggleMention=async function(rowId,ds,idx,uid,checked,draft){
  if(!currentUser)return;
  if(!markableMembersList().some(m=>m.uid===uid))return;
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)?[...S.meetingLogs[key].items]:[];
  if(idx<0)return;
  const input=document.getElementById('meetbox-'+rowId+'-'+ds+'-'+idx);
  if(idx>=items.length&&!input&&!draft)return;
  while(items.length<=idx)items.push({text:'',color:'',bg:'',mentions:[],...(draft||{})});
  const previousText=items[idx].text||'',previousRecord=S.meetingLogs[key];
  if(input)items[idx]={...items[idx],text:input.value,link:linkFromInput(input,input.value)};
  const mentions=(items[idx].mentions||[]).slice();
  const pos=mentions.indexOf(uid);
  const adding=checked===undefined?pos<0:!!checked;
  if(adding&&pos<0)mentions.push(uid);else if(!adding&&pos>=0)mentions.splice(pos,1);
  items[idx]=Object.assign({},items[idx],{mentions});
  S.meetingLogs=Object.assign({},S.meetingLogs);
  S.meetingLogs[key]=Object.assign({},S.meetingLogs[key],{items});
  setSyncing();
  try{await setDoc(doc(db,'meetingLogs',key),{rowId,date:ds,items,updatedAt:serverTimestamp()});}
  catch(error){if(S.meetingLogs[key]?.items===items)S.meetingLogs[key]=previousRecord||{rowId,date:ds,items:[]};throw error;}
  for(const memberUid of mentions){
    if(previousText!==items[idx].text||(adding&&memberUid===uid))await mSyncDailyLog(rowId,ds,idx,memberUid,items[idx]);
  }
  if(!adding)await mRemoveFromDailyLog(rowId,ds,idx,uid);
  setSynced();
  // Refresh just the checklist (keep it open) instead of a full re-render,
  // so tagging several people doesn't require re-hovering each time.
  mRefreshMentionMenu(rowId,ds,idx);
}
// Upsert this meeting entry's own text as one line in the member's daily
// log, remembering exactly which line came from this entry (so editing the
// text later replaces the same line, and untagging removes the same line).
async function mSyncDailyLog(rowId,ds,idx,uid,item){
  if(!String(item?.text||'').trim())return mRemoveFromDailyLog(rowId,ds,idx,uid);
  const m=S.members.find(x=>x.uid===uid);
  if(!m)return;
  const logKey=`${m.uid}_${ds}`;
  const logSnap=await getDoc(doc(db,'dailyLogs',logKey));
  const cur=logSnap.exists()?logSnap.data():{};
  const autoLines=Object.assign({},cur.autoLines||{});
  const trackKey=rowId+'_'+idx;
  const oldLine=autoLines[trackKey];
  let lines=(cur.text||'').split('\n').filter(l=>l!=='');
  if(oldLine!=null){
    const pos=lines.indexOf(oldLine);
    if(pos>=0)lines.splice(pos,1);
    delete autoLines[trackKey];
  }
  const sourceId='meeting:'+rowId+':'+idx;
  const assigned=(cur.assigned||[]).slice();
  const existingIndex=assigned.findIndex(function(entry){return entry.id===sourceId||(entry.sourceType==='meeting'&&entry.sourceRowId===rowId&&entry.sourceIndex===idx);});
  const existing=existingIndex>=0?assigned[existingIndex]:{};
  const synced=Object.assign({},existing,{id:sourceId,text:(item&&item.text)||'',authorUid:existing.authorUid||(currentUser&&currentUser.uid)||'',sourceType:'meeting',sourceRowId:rowId,sourceIndex:idx,color:(item&&item.color)||'',bg:(item&&item.bg)||''});
  if(existingIndex>=0)assigned[existingIndex]=synced;else assigned.push(synced);
  try{
    await setDoc(doc(db,'dailyLogs',logKey),Object.assign({},cur,{uid:m.uid,date:ds,text:lines.join('\n'),autoLines,assigned,updatedAt:serverTimestamp()}));
  }catch(err){
    console.error('無法自動寫入 '+memberDisplayName(m)+' 的每日日誌（可能需要調整 Firebase 權限規則）',err);
  }
}
async function mRemoveFromDailyLog(rowId,ds,idx,uid){
  const m=S.members.find(x=>x.uid===uid);
  if(!m)return;
  const logKey=`${m.uid}_${ds}`;
  const logSnap=await getDoc(doc(db,'dailyLogs',logKey));
  const cur=logSnap.exists()?logSnap.data():{};
  const autoLines=Object.assign({},cur.autoLines||{});
  const trackKey=rowId+'_'+idx;
  const oldLine=autoLines[trackKey];
  let lines=(cur.text||'').split('\n').filter(l=>l!=='');
  if(oldLine!=null){const pos=lines.indexOf(oldLine);if(pos>=0)lines.splice(pos,1);delete autoLines[trackKey];}
  const sourceId='meeting:'+rowId+':'+idx;
  const assigned=(cur.assigned||[]).filter(function(entry){return entry.id!==sourceId&&!(entry.sourceType==='meeting'&&entry.sourceRowId===rowId&&entry.sourceIndex===idx);});
  try{
    await setDoc(doc(db,'dailyLogs',logKey),Object.assign({},cur,{uid:m.uid,date:ds,text:lines.join('\n'),autoLines,assigned,updatedAt:serverTimestamp()}));
  }catch(err){
    console.error('無法自動移除 '+memberDisplayName(m)+' 的每日日誌（可能需要調整 Firebase 權限規則）',err);
  }
}
window.mBoxBlur=function(el,rowId,ds,idx){mSaveBox(el,rowId,ds,idx);}
window.mSaveBox=async function(el,rowId,ds,idx){
  if(!currentUser||!el)return;
  if(meetingEditCanceled){meetingEditCanceled=false;meetingEditing=null;const pending=meetingPendingSelection;meetingPendingSelection=null;if(pending){meetingSelected={};meetingSelected[pending.rowId+'|'+pending.ds]=pending.idx;const nextItem=(((S.meetingLogs||{})[pending.rowId+'_'+pending.ds]||{}).items||[])[pending.idx]||{};const nextLinked=normalizeLinkedItem(nextItem);updateFormulaBar('meeting',pending.ds,pending.idx,nextLinked.text,pending.rowId,nextLinked.link);}if(activePanel==='progress')renderProgress();if(pending?.edit)setTimeout(function(){mStartEdit(pending.rowId,pending.ds,pending.idx);},0);return;}
  const text=el.value;const link=linkFromInput(el,text);
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)?[...S.meetingLogs[key].items]:[];
  const previousItem=items[idx]||{},previousMentions=previousItem.mentions||[];
  const isBlank=!text.trim()&&!link;
  const keepTaggedDraft=isBlank&&previousMentions.length>0&&!String(previousItem.text||'').trim()&&!previousItem.link;
  if(isBlank&&!keepTaggedDraft){items.splice(idx,1);}else{
    while(items.length<=idx)items.push({text:'',color:'',bg:'',mentions:[]});
    items[idx]=Object.assign({},items[idx],{text,link});
  }
  setSyncing();
  await setDoc(doc(db,'meetingLogs',key),{rowId,date:ds,items,updatedAt:serverTimestamp()});
  // keep already-tagged members' daily logs in sync with the latest text
  if(isBlank){
    for(const uid of previousMentions)await mRemoveFromDailyLog(rowId,ds,idx,uid);
  }else{
    const mentions=items[idx].mentions||[];
    for(const uid of mentions)await mSyncDailyLog(rowId,ds,idx,uid,items[idx]);
  }
  setSynced();
  meetingEditing=null;
  const pending=meetingPendingSelection;
  meetingPendingSelection=null;
  if(pending){
    meetingSelected={};meetingSelected[pending.rowId+'|'+pending.ds]=pending.idx;
    const nextItem=(((S.meetingLogs||{})[pending.rowId+'_'+pending.ds]||{}).items||[])[pending.idx]||{};
    const nextLinked=normalizeLinkedItem(nextItem);
    updateFormulaBar('meeting',pending.ds,pending.idx,nextLinked.text,pending.rowId,nextLinked.link);
  }
  if(activePanel==='progress')renderProgress();
  if(pending?.edit)setTimeout(function(){mStartEdit(pending.rowId,pending.ds,pending.idx);},0);
}
