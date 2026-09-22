// Runtime-composed source module. Keep declarations in shared application scope.
// ── Private Todo Section ──
// ── Personal per-project todo panel — private to the current user. Combines
// items @-tagged to a project inside 私人記事 with manually-added items that
// aren't tied to any date. Which projects show is a personal preference. ──
function getNoteTodosForProject(projName){
  const pn=S.privateNotes||{work:{},personal:{}};
  const out=[];
  ['work','personal'].forEach(function(type){
    const byDate=pn[type]||{};
    Object.keys(byDate).forEach(function(ds){
      (byDate[ds]||[]).forEach(function(item,idx){
        const m=(item.text||'').match(/\[proj:([^\]]+)\]/);
        if(m&&m[1]===projName){
          out.push({source:'note',type:type,ds:ds,idx:idx,text:(item.text||'').replace(/\[proj:[^\]]+\]/g,'').trim(),completed:!!item.completed});
        }
      });
    });
  });
  return out;
}
function renderTodoPanel(){
  if(!currentUser)return'';
  const projIds=userPrefs.todoProjects||[];
  const projs=projIds.map(id=>S.projects.find(p=>p.id===id)).filter(p=>p&&p.status!=='done');
  if(!projs.some(p=>p.id===activeTodoProjectId))activeTodoProjectId=projs[0]?.id||'';
  const activeProject=projs.find(p=>p.id===activeTodoProjectId)||null;
  return`<div style="border:1px solid var(--border);border-radius:var(--rl2);padding:10px;margin-bottom:12px;background:var(--surface)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-size:13px;font-weight:600">📋 各工地待辦事項 <span style="font-weight:400;color:var(--text3);font-size:11px">（只有自己看得到・點選新增的待辦後按 Delete 鍵可刪除）</span></span>
      <button class="btn btn-sm" onclick="openTodoProjectPicker()">⚙ 選擇工地</button>
    </div>
    ${projs.length===0?`<div style="font-size:12px;color:var(--text3)">尚未選擇要顯示的工地，點右上角「⚙ 選擇工地」設定</div>`:
    `<div class="todo-desktop-projects horizontal-card-list" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">
      ${projs.map(p=>renderTodoColumn(p)).join('')}
    </div>
    <div class="todo-mobile-projects">
      <div class="todo-project-tabs">${projs.map(p=>`<button type="button" class="todo-project-tab ${p.id===activeTodoProjectId?'on':''}" onclick="selectTodoProject('${p.id}')">${escAttr(p.name)}</button>`).join('')}</div>
      <div class="todo-mobile-current">${activeProject?renderTodoColumn(activeProject):''}</div>
    </div>`}
  </div>`;
}
let selectedTodoId=null;
let activeTodoProjectId='';
let todoTextTapState={key:'',time:0};
window.selectTodoProject=function(projectId){
  activeTodoProjectId=projectId;
  selectedTodoId=null;
  renderProgress();
};
window.handleTodoTextTap=function(key,el,event){
  event.stopPropagation();
  const now=Date.now();
  if(todoTextTapState.key===key&&now-todoTextTapState.time<550){
    todoTextTapState={key:'',time:0};
    startEditTodoItem(key,el);
    return;
  }
  todoTextTapState={key:key,time:now};
  selectTodoItem(key);
};
window.selectTodoItem=function(id){
  selectedTodoId=(selectedTodoId===id)?null:id;
  // Direct style toggle instead of a full renderProgress() — a full
  // re-render on every single click destroys and recreates these row
  // elements, which breaks the browser's double-click detection (the
  // dblclick event ends up targeting an already-detached old node).
  document.querySelectorAll('.todo-item-row').forEach(function(row){
    var match=row.getAttribute('data-todo-key')===selectedTodoId;
    row.style.background=match?'var(--pl)':'';
    row.style.borderRadius=match?'4px':'';
  });
}
function renderTodoItem(t){
  const doneStyle=t.completed?'text-decoration:line-through;color:var(--text3)':'';
  const toggleOnclick=t.source==='note'
    ?`pnToggleComplete('${t.type}','${t.ds}',${t.idx})`
    :`toggleManualTodo('${t.id}',${!t.completed})`;
  const key=t.source==='manual'?('m:'+t.id):('n:'+t.type+':'+t.ds+':'+t.idx);
  const isSel=selectedTodoId===key;
  return`<div class="todo-item-row" data-todo-key="${key}" onclick="event.stopPropagation();selectTodoItem('${key}')" style="display:flex;align-items:flex-start;gap:5px;font-size:11px;padding:4px 4px;border-bottom:1px solid var(--border);${isSel?'background:var(--pl);border-radius:4px':''}">
    <span onclick="event.stopPropagation();${toggleOnclick}" style="cursor:pointer;flex-shrink:0">${t.completed?'✅':'⬜'}</span>
    <span onclick="handleTodoTextTap('${key}',this,event)" style="flex:1;word-break:break-word;${doneStyle};touch-action:manipulation;user-select:none">${escAttr(t.text)}</span>
  </div>`;
}
window.startEditTodoItem=function(key,el){
  const current=el.textContent;
  el.innerHTML=`<input type="text" value="${escAttr(current)}" style="width:100%;box-sizing:border-box;font-size:11px;padding:2px 4px;border:1px solid var(--purple);border-radius:3px;font-family:inherit" onclick="event.stopPropagation()" onkeydown="event.stopPropagation();if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){this.blur();}if(event.key==='Escape'){this.blur();}" onblur="saveTodoItemEdit('${key}',this.value)">`;
  const inp=el.querySelector('input');
  inp.focus();inp.select();
}
window.saveTodoItemEdit=async function(key,text){
  text=(text||'').trim();
  if(!text)return renderProgress();
  if(key.indexOf('m:')===0){
    const id=key.slice(2);
    S.userTodos=(S.userTodos||[]).map(function(t){return t.id===id?Object.assign({},t,{text:text}):t;});
    renderProgress();
    setSyncing();
    await updateDoc(doc(db,'userTodos',id),{text});
    setSynced();
  }else if(key.indexOf('n:')===0&&currentUser){
    const parts=key.slice(2).split(':');
    const type=parts[0],ds=parts[1],idx=parseInt(parts[2]);
    const pn=S.privateNotes||{work:{},personal:{}};
    const items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
    if(idx<0||idx>=items.length)return renderProgress();
    const oldText=items[idx].text||'';
    const m=oldText.match(/\[proj:[^\]]+\]/);
    const tag=m?m[0]:'';
    items[idx]=Object.assign({},items[idx],{text:tag?tag+' '+text:text});
    S.privateNotes=Object.assign({},pn);
    S.privateNotes[type]=Object.assign({},pn[type]||{});
    S.privateNotes[type][ds]=items;
    renderProgress();
    setSyncing();
    await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
    setSynced();
  }
}
window.deleteNoteTodoByKey=async function(key){
  if(key.indexOf('n:')!==0||!currentUser)return;
  const parts=key.slice(2).split(':');
  const type=parts[0],ds=parts[1],idx=parseInt(parts[2]);
  const pn=S.privateNotes||{work:{},personal:{}};
  const items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
  if(idx<0||idx>=items.length)return;
  items.splice(idx,1);
  S.privateNotes=Object.assign({},pn);
  S.privateNotes[type]=Object.assign({},pn[type]||{});
  S.privateNotes[type][ds]=items;
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  setSynced();
}
function renderTodoColumn(p){
  const noteTodos=getNoteTodosForProject(p.name);
  const manualTodos=(S.userTodos||[]).filter(t=>t.uid===currentUser.uid&&t.projId===p.id).map(t=>({source:'manual',id:t.id,text:t.text,completed:!!t.done}));
  const all=[...noteTodos,...manualTodos].sort((a,b)=>(a.completed?1:0)-(b.completed?1:0));
  return`<div class="todo-project-card" style="min-width:210px;flex-shrink:0;border:1px solid var(--border);border-radius:var(--r);padding:8px">
    <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--purple)">${p.name}</div>
    <input type="text" placeholder="+ 新增待辦…" inputmode="text" enterkeyhint="done" onkeydown="if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229){addManualTodo('${p.id}',this.value);this.value='';}" style="width:100%;box-sizing:border-box;font-size:11px;padding:4px 6px;border:1px dashed var(--border);border-radius:4px;margin-bottom:5px;font-family:inherit">
    ${all.length?all.map(t=>renderTodoItem(t)).join(''):'<div style="font-size:11px;color:var(--text3)">尚無待辦事項</div>'}
  </div>`;
}
window.addManualTodo=async function(projId,text){
  text=(text||'').trim();
  if(!text||!currentUser)return;
  setSyncing();
  await addDoc(collection(db,'userTodos'),{uid:currentUser.uid,projId,text,done:false,createdAt:serverTimestamp()});
  setSynced();
}
window.toggleManualTodo=async function(todoId,done){
  if(!currentUser)return;
  setSyncing();
  await updateDoc(doc(db,'userTodos',todoId),{done,doneAt:done?serverTimestamp():null});
  setSynced();
}
window.deleteManualTodo=async function(todoId){
  if(!currentUser)return;
  await deleteDoc(doc(db,'userTodos',todoId));
}
window.openTodoProjectPicker=function(){
  if(!currentUser)return;
  const cur=userPrefs.todoProjects||[];
  $('mo-content').innerHTML=`<div class="mo-title">選擇要顯示的工地</div>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto">
      ${S.projects.filter(p=>p.status!=='done').map(p=>`<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" value="${p.id}" ${cur.includes(p.id)?'checked':''}>
        ${p.name}
      </label>`).join('')}
    </div>
    <div class="mo-footer"><button class="btn" onclick="closeMo()">取消</button><button class="btn btn-p" onclick="saveTodoProjectPicker()">儲存</button></div>`;
  $('modal').style.display='flex';
}
window.saveTodoProjectPicker=async function(){
  if(!currentUser)return;
  const boxes=document.querySelectorAll('#mo-content input[type=checkbox]:checked');
  const ids=Array.from(boxes).map(b=>b.value);
  if(localTestMode){userPrefs.todoProjects=ids;closeMo();setSynced();renderProgress();return;}
  setSyncing();
  await setDoc(doc(db,'userPrefs',currentUser.uid),{todoProjects:ids},{merge:true});
  closeMo();setSynced();
}

let recurringSyncQueue=Promise.resolve();
function recurringSchedules(){return Array.isArray(S.privateNotes?.recurringSchedules)?S.privateNotes.recurringSchedules:[];}
function recurringSyncThroughDate(baseDate=today()){
  const base=new Date(baseDate);
  return fmtDay(new Date(base.getFullYear()+1,11,31));
}
function recurringMatches(rule,ds){
  const d=new Date(ds+'T00:00:00'),start=new Date(rule.startDate+'T00:00:00');
  if(ds<rule.startDate||rule.endDate&&ds>rule.endDate)return false;
  if(rule.frequency==='daily')return true;
  if(rule.frequency==='weekly')return d.getDay()===Number(rule.weekday);
  if(rule.frequency==='monthly')return d.getDate()===Number(rule.monthDay);
  if(rule.frequency==='yearly')return d.getMonth()+1===Number(rule.yearMonth||start.getMonth()+1)&&d.getDate()===Number(rule.yearDay||start.getDate());
  if(rule.frequency==='custom')return Math.floor((d-start)/86400000)%Math.max(1,Number(rule.intervalDays)||1)===0;
  return false;
}
function applyRecurringRule(pn,rule,removeOnly,throughDate){
  const todayDs=fmtDay(today());
  const next=Object.assign({},pn,{work:Object.assign({},pn.work||{}),personal:Object.assign({},pn.personal||{})});
  let changed=false;
  // 啟用中的排程不重建已存在的項目：使用者可自行修改、刪除、拖拉與排序。
  // 只有停用／刪除排程時，才移除未完成的未來自動項目。
  if(removeOnly)['work','personal'].forEach(type=>{
    Object.keys(next[type]).forEach(ds=>{
      const old=next[type][ds]||[];
      const kept=old.filter(item=>!(item.recurringId===rule.id&&ds>=todayDs&&!item.completed));
      if(kept.length!==old.length){next[type][ds]=kept;changed=true;}
    });
  });
  if(!removeOnly&&rule.enabled){
    const startFloor=[todayDs,rule.startDate,rule.enabledFrom||rule.startDate].sort().pop();
    const start=new Date(startFloor+'T00:00:00'),end=new Date(start);end.setDate(end.getDate()+120);
    if(throughDate){const requestedEnd=new Date(throughDate+'T00:00:00');if(requestedEnd>end)end.setTime(requestedEnd.getTime());}
    if(rule.endDate&&new Date(rule.endDate+'T00:00:00')<end)end.setTime(new Date(rule.endDate+'T00:00:00').getTime());
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      const ds=fmtDay(d);if(!recurringMatches(rule,ds))continue;
      const type=rule.target==='personal'?'personal':'work';
      const arr=(next[type][ds]||[]).slice();
      const skipped=(rule.skippedDates||[]).includes(ds);
      const existsAnywhere=['work','personal'].some(t=>Object.values(next[t]||{}).some(items=>(items||[]).some(item=>item.recurringId===rule.id&&item.recurringDate===ds)));
      if(skipped||existsAnywhere)continue;
      arr.push({text:rule.name,note:rule.note||'',color:'',completed:false,recurringId:rule.id,recurringDate:ds,autoGenerated:true});
      next[type][ds]=arr;changed=true;
    }
  }
  return {notes:next,changed};
}
async function syncRecurringRule(rule,removeOnly,throughDate,deferSave){
  if(!currentUser)return;
  const {notes:next,changed}=applyRecurringRule(S.privateNotes||{work:{},personal:{}},rule,removeOnly,throughDate);
  if(changed){S.privateNotes=next;if(!deferSave)await setDoc(doc(db,'privateNotes',currentUser.uid),next);}
  return changed;
}
function syncAllRecurringSchedules(throughDate){
  if(!currentUser)return Promise.resolve();
  const yearlyThrough=recurringSyncThroughDate();
  if(!throughDate||throughDate<yearlyThrough)throughDate=yearlyThrough;
  const run=async function(){
    if(!currentUser)return;
    const ref=doc(db,'privateNotes',currentUser.uid);
    // Compute from the transaction snapshot on every retry, never from a stale tab.
    const applyAll=pn=>{
      let notes=pn,changed=false;
      for(const rule of (Array.isArray(pn.recurringSchedules)?pn.recurringSchedules:[])){
        const result=applyRecurringRule(notes,rule,!rule.enabled,throughDate);
        notes=result.notes;changed=result.changed||changed;
      }
      return {notes,changed};
    };
    if(localTestMode){
      const result=applyAll(S.privateNotes||{work:{},personal:{}});
      if(result.changed){S.privateNotes=result.notes;await setDoc(ref,result.notes);}
      return;
    }
    try{
      await fbRunTransaction(db,async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists())return;
        const result=applyAll(snap.data());
        if(result.changed)tx.set(ref,result.notes);
      });
      // The snapshot listener updates S; a transaction callback must not mutate it.
    }catch(error){
      console.error('私人記事自動排程同步失敗',error);
      setOffline();
    }
  };
  recurringSyncQueue=recurringSyncQueue.then(run,run);
  return recurringSyncQueue;
}
function recurringFreqLabel(r){
  if(r.frequency==='daily')return'每天';
  if(r.frequency==='weekly')return`每週${['日','一','二','三','四','五','六'][Number(r.weekday)||0]}`;
  if(r.frequency==='monthly')return`每月 ${r.monthDay} 日`;
  if(r.frequency==='yearly'){const p=(r.startDate||'').split('-');return`每年 ${Number(r.yearMonth||p[1])}/${Number(r.yearDay||p[2])}`;}
  return`每 ${r.intervalDays||1} 天`;
}
function recurringEndLabel(r){return r.endDate?`至 ${String(r.endDate).replace(/-/g,'/')}`:'無期限';}
function recurringManagerSection(list,target,label){
  const rows=list.filter(r=>r.target===target);
  return`<section class="rr-manager-section"><div class="rr-manager-section-title">${label}</div>${rows.length?rows.map(r=>`<div class="rr-manager-row">
    <div class="rr-manager-name">${escAttr(r.name)}</div>
    <div class="rr-manager-info">重複：${recurringFreqLabel(r)}</div>
    <div class="rr-manager-info">結束：${recurringEndLabel(r)}</div>
    <button class="rr-toggle ${r.enabled?'on':''}" onclick="toggleRecurringRule('${r.id}')"><span class="rr-toggle-label rr-toggle-off">暫停</span><span class="rr-toggle-track"><span class="rr-toggle-knob"></span></span><span class="rr-toggle-label rr-toggle-on">啟動中</span></button>
    <div class="rr-manager-actions">${recurringManageEditMode?`<button class="btn btn-sm" onclick="openRecurringForm('${r.id}')">編輯</button><button class="btn btn-sm btn-danger" onclick="deleteRecurringRule('${r.id}')">刪除</button>`:''}</div>
  </div>`).join(''):'<div class="rr-manager-empty">尚無排程</div>'}</section>`;
}
let recurringManageEditMode=false;
window.openRecurringManager=function(resetMode){
  if(resetMode===true)recurringManageEditMode=false;
  const list=recurringSchedules();
  $('mo-content').classList.add('recurring-manager-modal');
  $('mo-content').innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div class="mo-title">自動排程</div><button class="btn btn-sm" onclick="toggleRecurringManageEdit()">${recurringManageEditMode?'完成':'編輯'}</button></div><div class="mo-sub">自動產生至工地記事或私人記事；歷史與已完成項目不會被回頭修改。</div>
    <div class="rr-manager-list">${recurringManagerSection(list,'work','工地記事')}${recurringManagerSection(list,'personal','私人記事')}</div>
    <div class="mo-footer"><button class="btn" onclick="closeMo()">關閉</button><button class="btn btn-p" onclick="openRecurringForm()">＋自動排程</button></div>`;
  $('modal').style.display='flex';
}
window.toggleRecurringManageEdit=function(){recurringManageEditMode=!recurringManageEditMode;openRecurringManager();}
window.openRecurringForm=function(id){
  $('mo-content').classList.remove('recurring-manager-modal');
  const r=recurringSchedules().find(x=>x.id===id)||{name:'',frequency:'daily',weekday:1,monthDay:1,intervalDays:1,startDate:fmtDay(today()),endDate:'',note:'',enabled:true,target:'work'};
  $('mo-content').innerHTML=`<div class="mo-title">${id?'編輯':'新增'}自動排程</div><div style="margin-top:12px;display:flex;flex-direction:column;gap:9px">
    <input id="rr-name" type="text" placeholder="項目名稱" value="${escAttr(r.name)}">
    <div style="font-size:11px;color:var(--text2)">出現位置<div class="rr-choice-group"><button class="rr-choice ${r.target==='work'?'on':''}" data-rr-group="target" data-value="work" onclick="setRecurringChoice('target','work')">工地記事</button><button class="rr-choice ${r.target==='personal'?'on':''}" data-rr-group="target" data-value="personal" onclick="setRecurringChoice('target','personal')">私人記事</button></div></div>
    <div style="font-size:11px;color:var(--text2)">重複頻率<div class="rr-choice-group">${[['daily','每天'],['weekly','每週'],['monthly','每月'],['yearly','每年'],['custom','自訂天數']].map(x=>`<button class="rr-choice ${r.frequency===x[0]?'on':''}" data-rr-group="frequency" data-value="${x[0]}" onclick="setRecurringChoice('frequency','${x[0]}')">${x[1]}</button>`).join('')}</div></div>
    <div id="rr-options"></div>
    <label style="font-size:11px;color:var(--text2)">開始日期<input id="rr-start" type="date" value="${r.startDate}"></label>
    <div style="font-size:11px;color:var(--text2)">結束日期<div class="rr-choice-group"><button class="rr-choice ${r.endDate?'':'on'}" data-rr-group="end-mode" data-value="unlimited" onclick="setRecurringEndMode('unlimited')">無期限</button><button class="rr-choice ${r.endDate?'on':''}" data-rr-group="end-mode" data-value="limited" onclick="setRecurringEndMode('limited')">設定結束日期</button></div></div>
    <div id="rr-end-wrap" style="${r.endDate?'':'display:none'}"><input id="rr-end" type="date" value="${r.endDate||''}"></div>
    <textarea id="rr-note" placeholder="備註" rows="3">${escAttr(r.note||'')}</textarea>
    <div style="font-size:11px;color:var(--text2)">啟動狀態<div style="margin-top:5px"><button id="rr-enabled-toggle" class="rr-toggle ${r.enabled?'on':''}" onclick="toggleRecurringFormEnabled()"><span class="rr-toggle-label rr-toggle-off">暫停</span><span class="rr-toggle-track"><span class="rr-toggle-knob"></span></span><span class="rr-toggle-label rr-toggle-on">啟動中</span></button></div></div>
    <input id="rr-id" type="hidden" value="${id||''}"><input id="rr-target" type="hidden" value="${r.target}"><input id="rr-frequency" type="hidden" value="${r.frequency}"><input id="rr-weekday-value" type="hidden" value="${r.weekday}"><input id="rr-monthday-value" type="hidden" value="${r.monthDay}"><input id="rr-interval-value" type="hidden" value="${r.intervalDays}"><input id="rr-yearmonth-value" type="hidden" value="${r.yearMonth||Number((r.startDate||'').split('-')[1])||1}"><input id="rr-yearday-value" type="hidden" value="${r.yearDay||Number((r.startDate||'').split('-')[2])||1}"><input id="rr-end-mode" type="hidden" value="${r.endDate?'limited':'unlimited'}"><input id="rr-enabled" type="hidden" value="${r.enabled?'1':'0'}">
  </div><div class="mo-footer"><button class="btn" onclick="openRecurringManager()">返回</button><button class="btn btn-p" onclick="saveRecurringRule()">儲存</button></div>`;
  $('modal').style.display='flex';renderRecurringOptions();
}
window.renderRecurringOptions=function(){
  const f=$('rr-frequency')?.value,box=$('rr-options');if(!box)return;
  if(f==='weekly')box.innerHTML=`<div style="font-size:11px;color:var(--text2)">指定星期<div class="rr-choice-group">${['日','一','二','三','四','五','六'].map((x,i)=>`<button class="rr-choice ${String(i)===$('rr-weekday-value').value?'on':''}" data-rr-group="weekday" data-value="${i}" onclick="setRecurringWeekday('${i}')">星期${x}</button>`).join('')}</div></div>`;
  else if(f==='monthly')box.innerHTML=`<label style="font-size:11px;color:var(--text2)">每月幾號<input id="rr-monthday" type="number" min="1" max="31" value="${$('rr-monthday-value').value||1}"></label>`;
  else if(f==='custom')box.innerHTML=`<label style="font-size:11px;color:var(--text2)">每隔幾天<input id="rr-interval" type="number" min="1" value="${$('rr-interval-value').value||1}"></label>`;
  else if(f==='yearly')box.innerHTML=`<div style="font-size:11px;color:var(--text2)">每年日期<div style="display:flex;align-items:center;gap:6px;margin-top:5px"><input id="rr-yearmonth" type="number" min="1" max="12" value="${$('rr-yearmonth-value').value||1}" style="width:75px">月<input id="rr-yearday" type="number" min="1" max="31" value="${$('rr-yearday-value').value||1}" style="width:75px">日</div></div>`;
  else box.innerHTML='';
}
window.setRecurringChoice=function(group,value){const input=$('rr-'+group);if(input)input.value=value;document.querySelectorAll(`[data-rr-group="${group}"]`).forEach(b=>b.classList.toggle('on',b.dataset.value===String(value)));if(group==='frequency')renderRecurringOptions();}
window.setRecurringWeekday=function(value){$('rr-weekday-value').value=value;document.querySelectorAll('[data-rr-group="weekday"]').forEach(b=>b.classList.toggle('on',b.dataset.value===String(value)));}
window.setRecurringEndMode=function(mode){$('rr-end-mode').value=mode;document.querySelectorAll('[data-rr-group="end-mode"]').forEach(b=>b.classList.toggle('on',b.dataset.value===mode));$('rr-end-wrap').style.display=mode==='limited'?'':'none';}
window.toggleRecurringFormEnabled=function(){const input=$('rr-enabled'),on=input.value!=='1';input.value=on?'1':'0';$('rr-enabled-toggle').classList.toggle('on',on);}
window.saveRecurringRule=async function(){
  if(!currentUser)return;const name=$('rr-name').value.trim(),startDate=$('rr-start').value;if(!name||!startDate)return alert('請填寫項目名稱與開始日期');
  const endDate=$('rr-end-mode').value==='limited'?$('rr-end').value:'';if($('rr-end-mode').value==='limited'&&!endDate)return alert('請選擇結束日期');
  const id=$('rr-id').value||('rr'+Date.now()),old=recurringSchedules().find(x=>x.id===id),enabled=$('rr-enabled').value==='1';
  const rule={id,name,target:$('rr-target').value,frequency:$('rr-frequency').value,weekday:Number($('rr-weekday-value').value||old?.weekday||1),monthDay:Number($('rr-monthday')?.value||old?.monthDay||1),intervalDays:Number($('rr-interval')?.value||old?.intervalDays||1),yearMonth:Number($('rr-yearmonth')?.value||old?.yearMonth||1),yearDay:Number($('rr-yearday')?.value||old?.yearDay||1),startDate,endDate,note:$('rr-note').value.trim(),enabled,enabledFrom:enabled&&(!old||!old.enabled)?fmtDay(today()):(old?.enabledFrom||startDate)};
  const list=recurringSchedules().filter(x=>x.id!==id);list.push(rule);S.privateNotes.recurringSchedules=list;await syncRecurringRule(rule,!enabled,recurringSyncThroughDate());await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);openRecurringManager();
}
window.toggleRecurringRule=async function(id){const list=recurringSchedules(),r=list.find(x=>x.id===id);if(!r)return;r.enabled=!r.enabled;if(r.enabled)r.enabledFrom=fmtDay(today());S.privateNotes.recurringSchedules=list;await syncRecurringRule(r,!r.enabled,recurringSyncThroughDate());await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);openRecurringManager();}
window.deleteRecurringRule=async function(id){
  const r=recurringSchedules().find(x=>x.id===id);
  if(!r||!confirm('刪除排程設定？過去與已完成項目會保留。'))return;
  // 先從規則清單移除，再一次儲存清除後的未來項目，避免監聽更新時把啟用中的規則重建回來。
  S.privateNotes=Object.assign({},S.privateNotes,{recurringSchedules:recurringSchedules().filter(x=>x.id!==id)});
  await syncRecurringRule(r,true,undefined,true);
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  openRecurringManager();
}
