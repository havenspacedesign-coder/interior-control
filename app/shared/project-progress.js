// Runtime-composed source module. Keep declarations in shared application scope.
function progressValidDate(day){
  try{projectStageDayNumber(day);return true;}catch(error){return false;}
}

function progressLegacyClosedOn(project){
  if(project.status!=='done')return '';
  const history=project.stageHistory,segments=history?.segments;
  // A rollback can reopen an older done segment without recording the new closure date.
  if(history?.version!==1||!Array.isArray(segments)||history.revision!==segments.length||(history.partial&&segments.length===1))return '';
  const recorded=segments.at(-1);
  return recorded?.status==='done'&&recorded.end===null&&progressValidDate(recorded.start)
    &&(segments.length===1||segments.at(-2)?.end===recorded.start)?recorded.start:'';
}

function progressClosureDay(timestamp){
  const date=typeof timestamp?.toDate==='function'?timestamp.toDate():typeof timestamp==='string'?new Date(timestamp):null;
  return date&&Number.isFinite(date.getTime())?projectStageToday(date):'';
}

function progressRosterVersion(project){
  return {name:project.name??'',status:project.status??'',archived:project.progressArchived===true,
    closedAt:project.progressClosedAt??null,recordedDay:progressLegacyClosedOn(project)};
}

function progressClosureLabel(project,version=progressRosterVersion(project)){
  return version.status==='done'
    ? progressClosureDay(version.closedAt)||version.recordedDay||project.progressLegacyClosedMonth||''
    : '';
}

function progressCanBackfillClosure(project){
  return !!project&&isAdmin()&&project.status==='done'&&!project.progressArchived
    &&project.progressClosedAt==null&&!progressLegacyClosedOn(project);
}

async function writeProgressLegacyClosedMonth(project,month){
  const ref=doc(db,'projects',project.id);
  function patch(snapshot){
    const fresh=snapshot.exists()?snapshot.data():null;
    if(!progressCanBackfillClosure(fresh)||fresh.progressLegacyClosedMonth!==project.progressLegacyClosedMonth){
      throw new Error('案件結案紀錄已變更，請重新開啟後再試。');
    }
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month>projectStageToday().slice(0,7)){
      throw new Error('請選擇當月或更早的結案月份。');
    }
    return {progressLegacyClosedMonth:month};
  }
  if(localTestMode)await updateDoc(ref,patch(await getDoc(ref)));
  else await fbRunTransaction(db,async tx=>tx.update(ref,patch(await tx.get(ref))));
}

function progressVersionAt(months,baseline,month){
  const latest=Object.keys(months||{}).filter(key=>key<=month).sort().at(-1);
  return latest?months[latest]:baseline;
}

function progressRosterAt(project,month){
  const roster=project.progressRoster;
  return roster?progressVersionAt(roster.months,roster.baseline,month):progressRosterVersion(project);
}

function progressWasInConstruction(project,month,version){
  const roster=project.progressRoster;
  if(roster?.baseline?.status==='prog'||Object.entries(roster?.months||{}).some(([key,row])=>key<=month&&row?.status==='prog'))return true;
  const history=project.stageHistory,segments=history?.segments;
  const reachedByMonth=day=>typeof day==='string'&&progressValidDate(day)&&day.slice(0,7)<=month;
  if(reachedByMonth(history?.firstConstructionDay)||
    (Array.isArray(segments)&&segments.some(segment=>segment.status==='prog'&&reachedByMonth(segment.start))))return true;
  if(progressMonthSchedule(project,month).length||project.progressMonths?.[month]?.siteNote||project.siteNote)return true;
  // Old completed sites may predate status tracking. Keep them unless their only recorded outcomes were design closures.
  const types=Array.isArray(project.completionTypes)?project.completionTypes:[];
  const hasTrackedStage=Array.isArray(segments)&&segments.some(segment=>reachedByMonth(segment.start));
  return !version.closedAt&&!version.recordedDay&&!hasTrackedStage&&(!types.length||types.includes('工程完成'));
}

function progressProjectVisible(project,month){
  const version=progressRosterAt(project,month);
  if(!version||version.archived)return false;
  if(version.status==='prog')return true;
  if(version.status==='done'){
    const closedOn=progressClosureLabel(project,version);
    return (!closedOn||month<=closedOn.slice(0,7))&&progressWasInConstruction(project,month,version);
  }
  // Before roster recording, a dated schedule is evidence the site belonged
  // to that month even if its current status is unrelated to construction.
  return month<projectStageToday().slice(0,7)
    && !Object.keys(project.progressRoster?.months||{}).some(key=>key<=month)
    && progressMonthSchedule(project,month).length>0;
}

function progressProjectWrite(before,patch,month=projectStageToday().slice(0,7)){
  const after={...before,...patch};
  if(after.status!==before?.status&&[after.status,before?.status].includes('done')){
    patch={...patch,progressClosedAt:after.status==='done'?serverTimestamp():null};
    after.progressClosedAt=patch.progressClosedAt;
  }
  const roster=before?.progressRoster;
  const version=progressRosterVersion(after);
  const prior=before&&progressRosterVersion(before);
  if(!before||JSON.stringify(version)!==JSON.stringify(prior)){
    patch={...patch,progressRoster:{
      baseline:roster?roster.baseline:prior??null,
      months:{...roster?.months,[month]:version},
      writeMonth:month
    }};
  }
  return patch;
}

function findProgressProject(id){
  return S.projects.find(project=>project.id===id)||S.progressArchivedProjects.find(project=>project.id===id);
}

function progressMonthProjects(month){
  const order=S.progressWorkOrders[month]??progressVersionAt(S.progressDesignOrders.months,S.progressDesignOrders.baseline??designProjectOrder,month);
  const rank=new Map(order.map((id,index)=>[id,index]));
  return [...S.projects,...S.progressArchivedProjects]
    .filter(project=>progressProjectVisible(project,month))
    .map(project=>{
      const version=progressRosterAt(project,month);
      return {...project,name:version.name,status:version.status,progressArchived:version.archived||project.progressArchived};
    })
    .sort((a,b)=>((rank.get(a.id)??Infinity)-(rank.get(b.id)??Infinity))||(a.id<b.id?-1:a.id>b.id?1:0));
}

async function writeProgressOrder(order,month){
  const ref=doc(db,'settings','designProjectOrder');
  function prepare(before){
    if(month)return {workOrderMonths:{...before.workOrderMonths,[month]:order},workOrderWriteMonth:month};
    const key=projectStageToday().slice(0,7),history=before.progressDesignOrders;
    return {order,progressDesignOrders:{baseline:history?.baseline??before.order??[],
      months:{...history?.months,[key]:order},writeMonth:key}};
  }
  if(localTestMode){
    const snapshot=await getDoc(ref);
    await setDoc(ref,prepare(snapshot.data()||{}),{merge:true});
  }else{
    await fbRunTransaction(db,async transaction=>{
      const snapshot=await transaction.get(ref);
      transaction.set(ref,prepare(snapshot.data()||{}),{merge:true});
    });
  }
}

function progressCheckItems(key,month,record=S.progressCheckRecords[key]??{items:S.checks[key]??[]}){
  if(!month)return record.items??[];
  return record?.progressCheckEdits?.[month]??progressVersionAt(record?.progressCheckHistory?.months,
    record?.progressCheckHistory?.baseline??record.items??[],month);
}

function progressCheckScope(month){
  return month&&month<projectStageToday().slice(0,7)?month:'';
}

function applyProgressCheckEdit(items,edit){
  while(items.length<=edit.index)items.push({done:false});
  items[edit.index]={...items[edit.index],...edit.patch};
}

function progressCheckDataEqual(left,right){
  if(left===right)return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object'||Array.isArray(left)!==Array.isArray(right))return false;
  const keys=Object.keys(left);
  return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&progressCheckDataEqual(left[key],right[key]));
}

function progressSharedCheckPatch(before,items){
  const month=projectStageToday().slice(0,7),history=before.progressCheckHistory;
  return {items,progressCheckHistory:{baseline:history?.baseline??before.items??[],
    months:{...history?.months,[month]:items},writeMonth:month}};
}

async function writeProgressCheckItems(key,update,month){
  const ref=doc(db,'checks',key);
  const observed=S.progressCheckRecords[key];
  function prepare(before){
    if(month&&(!isAdmin()||!progressCanEditDate(month)))throw new Error('這個月份的工程進度為唯讀。');
    const previous=progressCheckItems(key,month,before);
    const items=typeof update==='function'?update(previous):update;
    const patch=month?{progressCheckEdits:{...before.progressCheckEdits,[month]:items},progressCheckWriteMonth:month}
      :progressSharedCheckPatch(before,items);
    return {before,previous,items,patch};
  }
  if(localTestMode){
    const outcome=prepare(localRead('checks',key));
    const previousChecks=S.checks[key];
    localWrite('checks',key,outcome.patch,true);
    try{saveLocalPreviewState(true);}
    catch(error){
      if(observed)S.progressCheckRecords[key]=observed;else delete S.progressCheckRecords[key];
      if(previousChecks)S.checks[key]=previousChecks;else delete S.checks[key];
      throw error;
    }
    return outcome;
  }
  const outcome=await fbRunTransaction(db,async transaction=>{
    const snapshot=await transaction.get(ref);
    const result=prepare(snapshot.data()||{});
    transaction.set(ref,result.patch,{merge:true});
    return result;
  });
  // The listener may already have a newer document. Only bridge the wait for
  // its notification when the observed state still precedes this commit.
  const current=S.progressCheckRecords[key];
  if(current===observed||progressCheckDataEqual(current,outcome.before)){
    S.progressCheckRecords[key]={...outcome.before,...outcome.patch};
    S.checks[key]=S.progressCheckRecords[key].items??[];
  }
  return outcome;
}

const progressCheckQueues=new Map();
const PROGRESS_CHECK_WARNING_DELAY_MS=5000;
function progressCheckQueueId(key,month){return JSON.stringify([key,month]);}
function progressCheckBusy(queue){return !!(queue?.pending.length||queue?.saving.length);}

function visibleProgressCheckItems(key,month){
  const stored=progressCheckItems(key,month);
  const queue=progressCheckQueues.get(progressCheckQueueId(key,progressCheckScope(month)));
  if(!progressCheckBusy(queue))return stored;
  const items=[...stored];
  for(const edit of [...queue.saving,...queue.pending])applyProgressCheckEdit(items,edit);
  return items;
}

function progressCheckStatus(queue){
  if(queue?.failed.size)return'儲存失敗，已還原未儲存的項目，請重新操作。';
  return queue?.slow?'儲存等待過久，請確認網路連線，並先留在此頁。':'';
}

function renderProgressCheckSync(){
  const queues=[...progressCheckQueues.values()];
  const failed=queues.some(queue=>queue.failed.size);
  const text=failed?'寶典儲存失敗':queues.some(queue=>queue.slow)?'寶典儲存等待過久':'';
  let warning=$('checklist-sync-warning');
  if(!warning&&!text)return;
  const label=$('slbl'),dot=$('sdot');
  if(!label||!dot)return;
  if(!warning){
    warning=document.createElement('span');
    warning.id='checklist-sync-warning';
    warning.className='check-save-header';
    warning.setAttribute('role','status');
    label.after(warning);
  }
  if(warning.textContent!==text)warning.textContent=text;
  warning.hidden=!text;
  warning.classList.toggle('failed',failed);
  label.hidden=dot.hidden=!!text;
}

function applyProgressCheckSnapshot(snapshot){
  const changed=new Set();
  for(const change of snapshot.docChanges()){
    const key=change.doc.id;
    if(change.type==='removed'){delete S.progressCheckRecords[key];delete S.checks[key];}
    else{const record=change.doc.data();S.progressCheckRecords[key]=record;S.checks[key]=record.items??[];}
    changed.add(key);
  }
  const visibleKeys=new Set([...document.querySelectorAll('[data-check-list], [data-check-badge]')]
    .map(node=>node.dataset.checkList??node.dataset.checkBadge));
  for(const key of visibleKeys)if(changed.has(key))refreshProgressCheckViews(key);
  if(typeof refreshSiteReportChecklist==='function')refreshSiteReportChecklist(changed);
}

function refreshProgressCheckViews(key){
  const escaped=CSS.escape(key);
  for(const marker of document.querySelectorAll(`[data-check-list="${escaped}"]`)){
    const list=marker.hasAttribute('data-check-modal')?marker.closest('#mo-content'):marker;
    const month=marker.dataset.checkMonth;
    const items=visibleProgressCheckItems(key,month);
    const started=items.some(item=>item?.done||item?.skip);
    const rows=list.querySelectorAll('[data-check-index]');
    const queue=progressCheckQueues.get(progressCheckQueueId(key,progressCheckScope(month)));
    let required=0,resolved=0,totalAmount=0;
    for(const row of rows){
      const index=Number(row.dataset.checkIndex),item=items[index]||{};
      row.classList.toggle('check-save-failed',!!(queue?.failed.has(index+':status')||queue?.failed.has(index+':amount')));
      const [doneButton,skipButton]=row.querySelectorAll('.ck-btn');
      if(doneButton){
        const done=!!item.done,skip=!!item.skip;
        required++;
        if(done||skip)resolved++;
        row.classList.toggle('done',done);
        row.classList.toggle('skip',!done&&skip);
        row.querySelector('.ck-pending-marker').classList.toggle('show',started&&!done&&!skip);
        doneButton.classList.toggle('on-done',done);
        skipButton.classList.toggle('on-skip',skip);
        if(doneButton.getAttribute('aria-pressed')!==String(done))doneButton.setAttribute('aria-pressed',String(done));
        if(skipButton.getAttribute('aria-pressed')!==String(skip))skipButton.setAttribute('aria-pressed',String(skip));
      }
      const amount=row.querySelector('.ck-amount');
      if(amount){
        totalAmount+=parseFloat(item.amount)||0;
        if(document.activeElement!==amount&&amount.value!==String(item.amount??''))amount.value=item.amount??'';
      }
    }
    const count=list.querySelector('[data-check-count]');
    const countText=`${resolved}/${required} 完成`;
    if(count&&count.textContent!==countText)count.textContent=countText;
    const fill=list.querySelector('.pb-fill');
    if(fill){
      const pct=required?Math.round(100*resolved/required):100;
      if(fill.style.width!==pct+'%'){
        fill.style.width=pct+'%';
        fill.style.background=pct===100?'var(--teal)':'var(--purple)';
      }
    }
    const total=list.querySelector('[data-check-total]');
    if(total&&total.textContent!==totalAmount.toLocaleString())total.textContent=totalAmount.toLocaleString();
    const message=list.querySelector('[data-check-status]');
    if(message){
      const text=progressCheckStatus(queue);
      if(message.textContent!==text)message.textContent=text;
      message.hidden=!text;
      message.classList.toggle('failed',!!queue?.failed.size);
    }
  }
  const counts=new Map();
  for(const badge of document.querySelectorAll(`[data-check-badge="${escaped}"]`)){
    const {checkProject,checkStage,checkMonth}=badge.dataset;
    if(!counts.has(checkMonth))counts.set(checkMonth,pendingCount(checkProject,checkStage,checkMonth));
    const count=counts.get(checkMonth);
    const text=count===0?'✓':String(count??'');
    if(badge.textContent!==text)badge.textContent=text;
    badge.classList.toggle('pend-g',count===0);
    badge.classList.toggle('pend-r',count>0);
  }
}

function queueProgressCheckEdit(projectId,stage,index,kind,value){
  const modal=typeof openCheckMoArgs==='undefined'?null:openCheckMoArgs;
  const ds=modal?.projId===projectId&&modal.stage===stage?modal.ds:undefined;
  if(ds&&!progressCanEditDate(ds))return;
  const meta=projectBibleItemsMeta(findProgressProject(projectId),stage);
  if(!meta[index]||(kind==='status'&&!bibleItemNeedsCheck(meta[index])))return;
  const key=projectId+'_'+stage,month=progressCheckScope(ds?.slice(0,7));
  const id=progressCheckQueueId(key,month);
  let queue=progressCheckQueues.get(id);
  if(!queue){
    queue={pending:[],saving:[],failed:new Set()};
    progressCheckQueues.set(id,queue);
  }
  const item=visibleProgressCheckItems(key,month)[index]||{};
  const patch=kind==='amount'?{amount:value}:{done:value==='done'&&!item.done,skip:value==='skip'&&!item.skip};
  if(!queue.pending.length)queue.pendingSince=performance.now();
  queue.pending.push({index,kind,patch,ds,undo:activePanel==='progress'});
  if(queue.pending.length===1&&!queue.saving.length)setTimeout(()=>flushProgressCheckEdits(key,month,queue),40);
  refreshProgressCheckViews(key);
}

async function flushProgressCheckEdits(key,month,queue){
  const batch=queue.pending;
  const warningDelay=Math.max(0,PROGRESS_CHECK_WARNING_DELAY_MS-(performance.now()-queue.pendingSince));
  queue.saving=batch;
  queue.pending=[];
  const warningTimer=setTimeout(()=>{
    queue.slow=true;
    renderProgressCheckSync();
    refreshProgressCheckViews(key);
  },warningDelay);
  let result;
  try{
    if(batch.some(edit=>edit.ds&&(!progressCanEditDate(edit.ds)||progressCheckScope(edit.ds.slice(0,7))!==month))){
      throw new Error('檢核月份已變更，請重新開啟後操作。');
    }
    result=await writeProgressCheckItems(key,previous=>{
      const items=[...previous];
      for(const edit of batch)applyProgressCheckEdit(items,edit);
      return items;
    },month);
  }catch(error){
    console.warn('施工寶典儲存失敗',error);
  }finally{
    clearTimeout(warningTimer);
    queue.slow=false;
  }
  for(const edit of batch){
    const field=edit.index+':'+edit.kind;
    if(result)queue.failed.delete(field);else queue.failed.add(field);
  }
  queue.saving=[];
  if(!queue.pending.length&&!queue.failed.size)progressCheckQueues.delete(progressCheckQueueId(key,month));
  if(queue.pending.length)void flushProgressCheckEdits(key,month,queue);
  if(result&&typeof recordProgressCheckUndo==='function')recordProgressCheckUndo(key,month,batch,result.previous);
  if(result&&typeof refreshSiteReportChecklist==='function')refreshSiteReportChecklist(new Set([key]));
  renderProgressCheckSync();
  refreshProgressCheckViews(key);
}

function progressCanEditDate(date,role=currentRole,now=new Date()){
  const month=typeof date==='string'&&date.slice(0,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return false;
  return role==='admin'||role==='manager'||
    (['supervisor','staff'].includes(role)&&month>=projectStageToday(now).slice(0,7));
}

function progressMonthSchedule(project,month){
  const saved=project.progressMonths?.[month]?.schedule;
  const entries=Array.isArray(saved)?saved:(project.schedule||[]);
  return entries.filter(entry=>typeof entry?.date==='string'&&entry.date.slice(0,7)===month);
}

function progressAllSchedule(project){
  const months=project.progressMonths||{};
  return (project.schedule||[]).filter(entry=>!Array.isArray(months[entry?.date?.slice(0,7)]?.schedule))
    .concat(Object.keys(months).flatMap(month=>Array.isArray(months[month]?.schedule)?progressMonthSchedule(project,month):[]));
}

async function relinkUpcomingProgress(project,stage,relink){
  const currentMonth=projectStageToday().slice(0,7);
  const months=[...new Set(progressAllSchedule(project).filter(entry=>entry.stage===stage)
    .map(entry=>entry.date?.slice(0,7)).filter(month=>month&&month>=currentMonth))];
  if(months.length)await writeProgressMonths(months.map(month=>{
    const before=progressMonthSchedule(project,month);
    return {projectId:project.id,month,field:'schedule',before,
      after:before.map(entry=>entry.stage===stage?relink(entry):entry)};
  }));
}

function progressMonthNote(project,month){
  return project.progressMonths?.[month]?.siteNote??project.siteNote??'';
}

// Each mutation carries the field value the editor saw. Compare it against the
// latest document and merge only the requested months, including on retries.
async function writeProgressMonths(changes){
  const byProject=new Map();
  for(const change of changes){
    if(!progressCanEditDate(change.month))throw new Error('這個月份的工程進度為唯讀。');
    if(!byProject.has(change.projectId))byProject.set(change.projectId,[]);
    byProject.get(change.projectId).push(change);
  }
  const writes=[...byProject].map(([id,entries])=>({ref:doc(db,'projects',id),entries}));
  function prepare(snapshot,{entries}){
    if(!snapshot.exists())throw new Error('找不到案件，未儲存工程進度。');
    const project=snapshot.data(),progressMonths={...project.progressMonths};
    for(const {month,field,before,after} of entries){
      const stored=field==='schedule'?progressMonthSchedule(project,month):progressMonthNote(project,month);
      if(JSON.stringify(stored)!==JSON.stringify(before))throw new Error('工程進度已被更新，請重新整理後再試。');
      progressMonths[month]={...progressMonths[month],[field]:after};
    }
    return {progressMonths,progressWriteMonths:[...new Set(entries.map(entry=>entry.month))]};
  }
  if(localTestMode){
    const snapshots=await Promise.all(writes.map(({ref})=>getDoc(ref)));
    const patches=writes.map((write,index)=>prepare(snapshots[index],write));
    for(let index=0;index<writes.length;index++)await updateDoc(writes[index].ref,patches[index]);
  }else{
    await fbRunTransaction(db,async transaction=>{
      const snapshots=await Promise.all(writes.map(({ref})=>transaction.get(ref)));
      writes.forEach((write,index)=>transaction.update(write.ref,prepare(snapshots[index],write)));
    });
  }
}
