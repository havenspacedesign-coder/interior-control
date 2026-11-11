// Runtime-composed source module. Keep declarations in shared application scope.
function progressValidDate(day){
  try{projectStageDayNumber(day);return true;}catch(error){return false;}
}

function progressCompletedOn(project){
  if(project.status!=='done')return '';
  if(progressValidDate(project.progressCompletedOn))return project.progressCompletedOn;
  const segments=project.stageHistory?.segments;
  if(!Array.isArray(segments)||(project.stageHistory.partial&&segments.length===1))return '';
  const recorded=segments.at(-1);
  return recorded?.status==='done'&&recorded.end===null&&progressValidDate(recorded.start)?recorded.start:'';
}

function progressProjectVisible(project,month){
  if(project.status==='prog')return true;
  if(project.status!=='done')return false;
  const completedOn=progressCompletedOn(project);
  return !completedOn||month<=completedOn.slice(0,7);
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
