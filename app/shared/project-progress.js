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

function progressCheckItems(key,month,record=S.progressCheckRecords[key]){
  if(!month)return record?.items??S.checks[key]??[];
  return record?.progressCheckEdits?.[month]??progressVersionAt(record?.progressCheckHistory?.months,
    record?.progressCheckHistory?.baseline??record?.items??S.checks[key]??[],month);
}

function progressSharedCheckPatch(before,items){
  const month=projectStageToday().slice(0,7),history=before.progressCheckHistory;
  return {items,progressCheckHistory:{baseline:history?.baseline??before.items??[],
    months:{...history?.months,[month]:items},writeMonth:month}};
}

async function writeProgressCheckItems(key,items,month){
  const ref=doc(db,'checks',key);
  function prepare(before){
    if(!month)return progressSharedCheckPatch(before,items);
    if(!isAdmin()||!progressCanEditDate(month))throw new Error('這個月份的工程進度為唯讀。');
    return {progressCheckEdits:{...before.progressCheckEdits,[month]:items},progressCheckWriteMonth:month};
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
