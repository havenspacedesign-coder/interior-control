// Runtime-composed source module. Keep declarations in shared application scope.
// ── Daily Log Section ──
let dailyAssignMemberUids=[];
function renderDailyAssignBar(days){
  if(!currentUser||!days.length)return'';
  const base=days[Math.floor(days.length/2)];
  const yyyy=base.getFullYear(),mm=String(base.getMonth()+1).padStart(2,'0');
  const monthStart=`${yyyy}-${mm}-01`;
  const monthEnd=`${yyyy}-${mm}-${String(new Date(yyyy,base.getMonth()+1,0).getDate()).padStart(2,'0')}`;
  const td=today();
  const defaultDate=(td.getFullYear()===yyyy&&td.getMonth()===base.getMonth())?fmtDay(td):monthStart;
  const members=dailyLogMembersList();
  return`<div style="display:flex;align-items:center;gap:6px;position:relative;font-weight:400">
    <input type="date" id="daily-assign-date" min="${monthStart}" max="${monthEnd}" value="${defaultDate}" style="width:128px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px">
    <input type="text" id="daily-assign-text" placeholder="輸入指派任務" style="width:180px;padding:4px 7px;border:1px solid var(--border);border-radius:5px;font-size:11px">
    <button class="btn btn-sm" type="button" onclick="toggleDailyAssignPicker(event)">標記（可複選）</button>
    <span id="daily-assign-summary" style="font-size:10px;color:var(--purple);max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></span>
    <button class="btn btn-sm btn-p" type="button" onclick="submitDailyAssignment()">新增</button>
    <div id="daily-assign-picker" style="display:none;position:absolute;right:42px;top:32px;width:190px;max-height:230px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:7px;box-shadow:0 5px 18px rgba(0,0,0,.15);padding:7px;z-index:80">
      ${members.map(m=>`<label style="display:flex;align-items:center;gap:7px;padding:5px 4px;font-size:11px;cursor:pointer"><input type="checkbox" value="${m.uid}" ${dailyAssignMemberUids.includes(m.uid)?'checked':''} onchange="toggleDailyAssignMember('${m.uid}',this.checked)">${memberDisplayName(m)}</label>`).join('')}
    </div>
  </div>`;
}
window.toggleDailyAssignPicker=function(event){
  event.stopPropagation();
  const el=$('daily-assign-picker');if(el)el.style.display=el.style.display==='block'?'none':'block';
}
window.toggleDailyAssignMember=function(uid,checked){
  if(checked&&!dailyAssignMemberUids.includes(uid))dailyAssignMemberUids.push(uid);
  if(!checked)dailyAssignMemberUids=dailyAssignMemberUids.filter(x=>x!==uid);
  const names=dailyAssignMemberUids.map(uid=>memberDisplayName(S.members.find(m=>m.uid===uid))).filter(Boolean);
  const el=$('daily-assign-summary');if(el)el.textContent=names.join('、');
}
window.submitDailyAssignment=async function(){
  if(!currentUser)return;
  const dateEl=$('daily-assign-date'),textEl=$('daily-assign-text');
  const ds=dateEl?dateEl.value:'';const task=textEl?textEl.value.trim():'';
  if(!ds||!task){alert('請先選擇日期並輸入指派任務');return;}
  if(!dailyAssignMemberUids.length){alert('請至少標記一位成員');return;}
  setSyncing();
  for(const uid of dailyAssignMemberUids){
    const key=uid+'_'+ds;const cur=S.dailyLogs[key]||{};
    const list=(cur.assigned||[]).slice();
    list.push({id:'a'+Date.now()+'_'+uid,text:task,authorUid:currentUser.uid});
    await setDoc(doc(db,'dailyLogs',key),Object.assign({},cur,{uid,date:ds,assigned:list}));
  }
  dailyAssignMemberUids=[];
  setSynced();
  if(activePanel==='progress')renderProgress();
}
function renderDailyLogSection(days){
  const td=today();
  const activeMembers=orderedDailyLogMembers();
  if(!activeMembers.length)return'';
  const WD=['日','一','二','三','四','五','六'];
  return`<div style="border-top:3px solid #1a1a1a;margin-top:0"></div>
    <div class="daily-section-hdr mobile-progress-fixed-header">
      <span class="daily-section-title">每日施工日誌</span>
      ${renderDailyAssignBar(days)}
    </div>
  <div class="daily-section" style="margin-top:0;border-top:none;border-radius:0 0 var(--rl2) var(--rl2)">
    <div class="hscroll-sync hide-hscrollbar" style="overflow-x:auto">
    <table class="daily-log-table" style="width:${200+days.length*180}px">
      <colgroup><col style="width:200px">${days.map(()=>'<col style="width:180px">').join('')}</colgroup>
      <tbody>
      ${activeMembers.map(m=>`<tr>
        <td class="log-name-cell ${isAdmin()?'daily-member-draggable':''}" ${isAdmin()?`draggable="true" ondragstart="dailyMemberDragStart(event,'${m.uid}')" ondragover="dailyMemberDragOver(event)" ondrop="dailyMemberDrop(event,'${m.uid}')"`:''} title="${isAdmin()?'管理員可拖曳調整順序':''}"><div class="daily-member-name"><span>${memberDisplayName(m)}</span></div></td>
        ${days.map(d=>renderDailyLogCell(m,d,td)).join('')}
      </tr>`).join('')}
      </tbody>
    </table>
    </div>
  </div>`;
}
// One cell = the owner's own free-text log (only they can edit it), plus
// any number of "assigned" notes from other people — each assigned note
// can only be edited/removed by whoever wrote it, or by the cell's owner.
function renderDailyLogCell(m,d,td){
  const ds=fmtDay(d);
  const isT=isSameDay(d,td);
  const logKey=`${m.uid}_${ds}`;
  const cur=S.dailyLogs[logKey]||{};
  const logVal=cur.text||'';
  const canEditOwn=currentUser&&m.uid===currentUser.uid;
  const assigned=cur.assigned||[];
  const meetingAssigned=assigned.filter(function(e){return e.sourceType==='meeting';});
  const regularAssigned=assigned.filter(function(e){return e.sourceType!=='meeting';});
  let h=`<td style="${isT?'background:#faf9ff':''};vertical-align:top">`;
  meetingAssigned.forEach(function(e){
    const entryColor=/^#[0-9a-f]{6}$/i.test(e.color||'')?e.color:'var(--text)';
    const entryBg=/^#[0-9a-f]{6}$/i.test(e.bg||'')?e.bg:'var(--surface)';
    h+=`<div title="由上方會議／其他事項同步" style="margin:0 0 3px;padding:3px 6px;border:1px solid var(--border);border-radius:4px;font-size:11px;background:${entryBg};color:${entryColor}">${escAttr(e.text||'')}</div>`;
  });
  h+=`<textarea class="log-textarea${isT?' today':''}"
      ${canEditOwn?`onblur="saveDailyLog('${m.uid}','${ds}',this.value)"
      onkeydown="if(event.key==='Tab'){event.preventDefault();this.blur()}"
      placeholder=""`:' readonly'}
    >${logVal}</textarea>`;
  regularAssigned.forEach(function(e){
    const canManage=currentUser&&(currentUser.uid===e.authorUid||currentUser.uid===m.uid);
    const author=S.members.find(function(x){return x.uid===e.authorUid;});
    const authorName=memberDisplayName(author);
    const entryColor='var(--pd)';
    const entryBg='var(--pl)';
    const entryBorder='var(--purple)';
    if(canManage){
      h+=`<div style="margin-top:3px;position:relative">
        <input type="text" id="assign-${m.uid}-${ds}-${e.id}" value="${escAttr(e.text||'')}" title="${authorName} 指派"
          onblur="saveAssignedEntry('${m.uid}','${ds}','${e.id}',this.value)"
          onkeydown="if(event.key==='Enter')this.blur()"
          style="width:100%;box-sizing:border-box;padding:3px 20px 3px 6px;border:1px solid ${entryBorder};border-radius:4px;font-size:11px;font-family:inherit;background:${entryBg};color:${entryColor}">
        <span onclick="deleteAssignedEntry('${m.uid}','${ds}','${e.id}')" title="刪除" style="position:absolute;top:2px;right:3px;cursor:pointer;color:${entryColor};font-weight:700;font-size:11px">×</span>
      </div>`;
    }else{
      h+=`<div style="margin-top:3px;padding:3px 6px;border:1px solid ${entryBorder};border-radius:4px;font-size:11px;background:${entryBg};color:${entryColor}">${escAttr(authorName)}：${escAttr(e.text||'')}</div>`;
    }
  });
  h+='</td>';
  return h;
}
window.addAssignedEntry=async function(uid,ds){
  if(!currentUser)return;
  const key=uid+'_'+ds;
  const cur=S.dailyLogs[key]||{};
  const list=(cur.assigned||[]).slice();
  const eid='a'+Date.now();
  list.push({id:eid,text:'',authorUid:currentUser.uid});
  setSyncing();
  await setDoc(doc(db,'dailyLogs',key),Object.assign({},cur,{uid,date:ds,assigned:list}));
  setSynced();
  if(activePanel==='progress')renderProgress();
  setTimeout(function(){
    const el=document.getElementById('assign-'+uid+'-'+ds+'-'+eid);
    if(el)el.focus();
  },50);
}
window.saveAssignedEntry=async function(uid,ds,eid,text){
  if(!currentUser)return;
  const key=uid+'_'+ds;
  const cur=S.dailyLogs[key]||{};
  const list=(cur.assigned||[]).map(function(e){return e.id===eid?Object.assign({},e,{text}):e;});
  setSyncing();
  await setDoc(doc(db,'dailyLogs',key),Object.assign({},cur,{assigned:list}));
  setSynced();
}
window.deleteAssignedEntry=async function(uid,ds,eid){
  if(!currentUser)return;
  const key=uid+'_'+ds;
  const cur=S.dailyLogs[key]||{};
  const list=(cur.assigned||[]).filter(function(e){return e.id!==eid;});
  setSyncing();
  await setDoc(doc(db,'dailyLogs',key),Object.assign({},cur,{assigned:list}));
  setSynced();
}

window.saveDailyLog=async function(uid,ds,text){
  if(!currentUser||currentUser.uid!==uid)return;
  const key=`${uid}_${ds}`;
  const cur=S.dailyLogs[key]||{};
  setSyncing();
  await setDoc(doc(db,'dailyLogs',key),Object.assign({},cur,{uid,date:ds,text,updatedAt:serverTimestamp()}));
  setSynced();
}
