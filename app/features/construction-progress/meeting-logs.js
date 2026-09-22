// Runtime-composed source module. Keep declarations in shared application scope.
// ── Fixed meeting rows (客戶會議/丈量・廠商會議・丈量・其他) under the site
// table — same chip interaction as 工地記事 (select/edit/color/drag), plus a
// background-color option, plus @member mention that auto-copies the entry
// into that member's daily log for the same day ──
window.mSelect=function(rowId,ds,idx){
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
window.mSelectEmpty=function(rowId,ds){clearSpreadsheetSelections('meeting');meetingSelGen++;meetingSelected={};meetingSelected[rowId+'|'+ds]=0;meetingEditing=null;updateFormulaBar('meeting',ds,0,'',rowId,null);if(activePanel==='progress')renderProgress(true);}
window.mStartEdit=function(rowId,ds,idx){
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
  if(!items.length&&text===''){mSelectEmpty(rowId,ds);return;}while(items.length<1)items.push({text:'',color:'',bg:'',mentions:[]});items[0]=Object.assign({},items[0],{text:text,link:null});
  setSyncing();await setDoc(doc(db,'meetingLogs',key),{rowId:rowId,date:ds,items:items,updatedAt:serverTimestamp()});setSynced();meetingEditing=null;meetingSelected={};meetingSelected[rowId+'|'+ds]=0;if(activePanel==='progress')renderProgress();
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
window.closeMeetingColorPalette=function(){
  const old=document.getElementById('meeting-color-palette');
  if(old)old.remove();
};
window.openMeetingColorPalette=function(e,rowId,ds,idx,kind,current){
  e.stopPropagation();
  closeMeetingColorPalette();
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
    +'<label class="meeting-palette-custom"><span>自訂</span><input type="color" value="'+(current||'#000000')+'" aria-label="自訂顏色" onchange="mPickMeetingColor(\''+rowId+'\',\''+ds+'\','+idx+',\''+kind+'\',this.value)"><span class="meeting-custom-preview" style="background:'+(current||'#000000')+'"></span></label>';
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
  if(idx<0||idx>=items.length)return;
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
  items.splice(idx,1);
  meetingSelected={};
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
window.mDragEnd=function(){document.querySelectorAll('.meet-dragging').forEach(el=>el.classList.remove('meet-dragging'));document.querySelectorAll('.meet-drop-active').forEach(el=>el.classList.remove('meet-drop-active'));meetingDragSrc=null;}
window.mDrop=async function(e,toRowId,toDs){
  e.preventDefault();e.stopPropagation();
  e.currentTarget.classList.remove('meet-drop-active');
  const raw=e.dataTransfer.getData('text/plain');
  let from=null;
  if(raw){const p=raw.split('|');if(p.length===4&&p[0]==='meet')from={rowId:p[1],ds:p[2],idx:parseInt(p[3])};}
  if(!from)from=meetingDragSrc;
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
  if(!e.ctrlKey){
    for(const uid of movedItem.mentions)await mRemoveFromDailyLog(from.rowId,from.ds,from.idx,uid);
    fromItems.splice(from.idx,1);
    await setDoc(doc(db,'meetingLogs',fromKey),{rowId:from.rowId,date:from.ds,items:fromItems,updatedAt:serverTimestamp()});
  }
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
function mMentionMenuHTML(rowId,ds,idx){
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)||[];
  const item=items[idx]||{};
  const mentions=item.mentions||[];
  return markableMembersList().map(function(m){
    const checked=mentions.indexOf(m.uid)>=0;
    return'<div onmousedown="event.preventDefault();mToggleMention(\''+rowId+'\',\''+ds+'\','+idx+',\''+m.uid+'\')" style="padding:7px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">'
      +'<span>'+(checked?'☑':'☐')+'</span><span>'+memberDisplayName(m)+'</span></div>';
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
window.mToggleMention=async function(rowId,ds,idx,uid){
  if(!currentUser)return;
  if(!markableMembersList().some(m=>m.uid===uid))return;
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)?[...S.meetingLogs[key].items]:[];
  if(idx<0||idx>=items.length)return;
  const mentions=(items[idx].mentions||[]).slice();
  const pos=mentions.indexOf(uid);
  const adding=pos<0;
  if(adding)mentions.push(uid);else mentions.splice(pos,1);
  items[idx]=Object.assign({},items[idx],{mentions});
  S.meetingLogs=Object.assign({},S.meetingLogs);
  S.meetingLogs[key]=Object.assign({},S.meetingLogs[key],{items});
  if(localTestMode){
    if(adding)await mSyncDailyLog(rowId,ds,idx,uid,items[idx]);
    else await mRemoveFromDailyLog(rowId,ds,idx,uid);
    setSynced();
    const menuEl=document.getElementById('meet-mention-'+rowId+'-'+ds);
    if(menuEl&&menuEl.style.display==='block')menuEl.innerHTML=mMentionMenuHTML(rowId,ds,idx);
    if(activePanel==='progress')renderProgress();
    return;
  }
  setSyncing();
  await setDoc(doc(db,'meetingLogs',key),{rowId,date:ds,items,updatedAt:serverTimestamp()});
  setSynced();
  if(adding)await mSyncDailyLog(rowId,ds,idx,uid,items[idx]);
  else await mRemoveFromDailyLog(rowId,ds,idx,uid);
  // Refresh just the checklist (keep it open) instead of a full re-render,
  // so tagging several people doesn't require re-hovering each time.
  const menuEl=document.getElementById('meet-mention-'+rowId+'-'+ds);
  if(menuEl&&menuEl.style.display==='block')menuEl.innerHTML=mMentionMenuHTML(rowId,ds,idx);
}
// Upsert this meeting entry's own text as one line in the member's daily
// log, remembering exactly which line came from this entry (so editing the
// text later replaces the same line, and untagging removes the same line).
async function mSyncDailyLog(rowId,ds,idx,uid,item){
  const m=S.members.find(x=>x.uid===uid);
  if(!m)return;
  const logKey=`${m.uid}_${ds}`;
  const cur=S.dailyLogs[logKey]||{};
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
  const cur=S.dailyLogs[logKey]||{};
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
  if(meetingEditCanceled){meetingEditCanceled=false;meetingEditing=null;if(activePanel==='progress')renderProgress();return;}
  const text=el.value;const link=linkFromInput(el,text);
  const key=rowId+'_'+ds;
  const items=(S.meetingLogs[key]&&S.meetingLogs[key].items)?[...S.meetingLogs[key].items]:[];
  while(items.length<=idx)items.push({text:'',color:'',bg:'',mentions:[]});
  items[idx]=Object.assign({},items[idx],{text,link});
  setSyncing();
  await setDoc(doc(db,'meetingLogs',key),{rowId,date:ds,items,updatedAt:serverTimestamp()});
  // keep already-tagged members' daily logs in sync with the latest text
  const mentions=items[idx].mentions||[];
  for(const uid of mentions){
    await mSyncDailyLog(rowId,ds,idx,uid,items[idx]);
  }
  setSynced();
  meetingEditing=null;
  if(activePanel==='progress')renderProgress();
}
