const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const shared=fs.readFileSync(path.join(root,'app/shared/projects.js'),'utf8');
const overview=fs.readFileSync(path.join(root,'app/features/project-overview/index.js'),'utf8');
const context={console,Intl,Date,setInterval:()=>0,document:{addEventListener:()=>{}},window:null,
  activePanel:'overview',localTestMode:true,currentRole:'manager',S:{projects:[]},
  statusInfo:key=>({l:{contact:'接洽中',cv:'客變案',design:'設計中',prog:'施工中',done:'已完工'}[key]}),
  escAttr:String,alert:()=>{},setSyncing:()=>{},setSynced:()=>{},closeMo:()=>{},
  getBibleStages:()=>[],db:{},doc:(_db,collection,id)=>({collection,id})};
context.window=context;vm.createContext(context);
vm.runInContext(shared.slice(0,shared.indexOf('function ymdInputs')),context);
vm.runInContext(overview,context);
const call=(name,...args)=>{context.args=args;return vm.runInContext(`${name}(...args)`,context);};
const plain=value=>JSON.parse(JSON.stringify(value));
const initial=(status='contact',day='2026-10-01')=>({id:'test',status,stageHistory:call('projectStageInitial',status,day)});
const move=(project,status,day,choice='keep')=>({...project,status,stageHistory:call('projectStageTransition',project,status,choice,day)});
const totals=(project,day)=>plain(call('projectStageTotals',project.stageHistory,day));
async function main(){
  assert.equal(call('projectStageToday',new Date('2026-10-01T15:59:59Z')),'2026-10-01');
  assert.equal(call('projectStageToday',new Date('2026-10-01T16:00:00Z')),'2026-10-02');
  const first=initial();assert.equal(totals(first,'2026-10-01').contact,1);
  assert.equal(totals(first,'2026-10-04').contact,4);
  const design=move(first,'design','2026-10-05');
  assert.deepEqual(totals(design,'2026-10-09'),{contact:4,cv:0,design:5,prog:0});
  const kept=move(design,'contact','2026-10-10');
  assert.deepEqual(totals(kept,'2026-10-10'),{contact:5,cv:0,design:5,prog:0});
  assert.equal(totals(move(kept,'design','2026-10-11'),'2026-10-11').design,6);
  const deleted=move(design,'contact','2026-10-10','delete');
  assert.deepEqual(totals(deleted,'2026-10-10'),{contact:10,cv:0,design:0,prog:0});
  assert.equal(totals(move(deleted,'design','2026-10-11'),'2026-10-11').design,1);
  for(const choice of ['keep','delete']){
    let same=move(first,'design','2026-10-05');same=move(same,'prog','2026-10-05');same=move(same,'contact','2026-10-05',choice);
    assert.deepEqual(totals(same,'2026-10-05'),{contact:5,cv:0,design:0,prog:0});
    assert.equal(totals(move(same,'design','2026-10-05'),'2026-10-05').design,1);
  }
  const finished=move(design,'done','2026-10-10');
  assert.deepEqual(totals(finished,'2026-10-10'),totals(finished,'2030-10-10'));
  const reopened=move(finished,'contact','2026-10-15');assert.equal(totals(reopened,'2026-10-15').contact,5);
  assert.equal(totals(reopened,'2026-10-15').design,5);
  const leap=move(initial('cv','2024-02-28'),'design','2024-03-01');assert.equal(totals(leap,'2024-03-01').cv,2);
  const legacy={id:'old',status:'prog',createdAt:'2020-01-01'};
  assert.equal(call('projectStageHistory',legacy),null);assert(call('projectStageCell',legacy).includes('缺乏可靠'));
  const tracked=move(legacy,'design','2026-10-10');assert.equal(tracked.stageHistory.partial,true);
  assert.deepEqual(totals(tracked,'2026-10-10'),{contact:0,cv:0,design:1,prog:0});
  assert.throws(()=>move(design,'contact','2026-10-04'),/早於/);
  assert.throws(()=>call('projectStageDayNumber','2026-02-30'),/不正確/);
  assert.throws(()=>call('projectStageTransition',{...design,stageHistory:{version:7}},'contact'),/格式/);
  // Every date belongs to exactly one status, including same-day transitions.
  let mixed=initial();mixed=move(mixed,'cv','2026-10-03');mixed=move(mixed,'design','2026-10-03');mixed=move(mixed,'prog','2026-10-08');mixed=move(mixed,'contact','2026-10-12');
  assert.equal(Object.values(totals(mixed,'2026-10-20')).reduce((a,b)=>a+b,0),20);
  const original=JSON.stringify(design);
  context.projectStageConfirmReturn=async()=> 'cancel';
  assert.equal(await call('prepareProjectStageChange',design,'contact'),false);assert.equal(JSON.stringify(design),original);
  // Actual status handler: cancel performs no writes; done patch and history are atomic.
  let writes=[];context.updateDoc=async(_ref,data)=>writes.push(data);
  context.renderOverview=()=>{};context.getDoc=async()=>({exists:()=>true,data:()=>context.S.projects[0]});
  context.S.projects=[design];await context.updateStatus('test','contact');assert.equal(writes.length,0);
  context.projectStageConfirmReturn=async()=> 'keep';
  await context.updateStatus('test','contact');assert.equal(writes.length,1);assert.equal(writes[0].status,'contact');assert(writes[0].stageHistory);
  writes=[];context.S.projects=[design];await context.updateStatus('test','done',['設計完成'],'2026-10-09');
  assert.equal(writes[0].status,'done');assert.deepEqual(writes[0].completionTypes,['設計完成']);assert.equal(writes[0].stageHistory.segments.at(-1).status,'done');
  // Stale other-device revision must not overwrite the current record.
  context.S.projects=[kept];writes=[];
  await assert.rejects(call('writeProjectStageChange',design,{status:'contact'},kept.stageHistory),/已被更新/);assert.equal(writes.length,0);
  context.localTestMode=false;let remotePatch;
  context.fbRunTransaction=async(_db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>design}),update:(_ref,patch)=>{remotePatch=patch;}});
  await call('writeProjectStageChange',design,{status:'contact'},kept.stageHistory);assert.equal(remotePatch.status,'contact');assert(remotePatch.stageHistory);
  context.localTestMode=true;
  // Existing completion gates stay active before any status write.
  context.S.projects=[{id:'blocked',status:'design'}];let blocked=0;context.alert=()=>blocked++;
  context.checkConstructionManualCompletion=()=>({passed:false,incompleteTotal:1,incompleteStages:[],designProgressIncompleteCount:1});
  context.handleStatusChange('blocked',{value:'prog'});assert.equal(blocked,1);assert.equal(writes.length,0);
  for(const status of ['contact','cv','design']){
    context.S.projects=[{id:'blocked',status}];const previous=blocked;
    context.handleStatusChange('blocked',{value:'done'});assert.equal(blocked,previous+1);
  }
  context.S.projects=[{id:'blocked',status:'prog'}];let closeOptions;
  context.checkConstructionManualCompletion=(_id,options)=>{closeOptions=options;return {passed:false,incompleteStages:[]};};
  context.handleStatusChange('blocked',{value:'done'});assert.equal(closeOptions.startStageIndex,16);assert.equal(closeOptions.includeDesignProgress,false);
  context.checkConstructionManualCompletion=()=>({passed:true});context.checkProjectTradeCompletion=()=>({passed:false,hasCategories:false});
  context.handleStatusChange('blocked',{value:'done'});assert.equal(writes.length,0);
  context.checkProjectTradeCompletion=()=>({passed:true});context.checkB1FProjectCompletion=()=>({passed:false,pendingOtherOrders:[{}],pendingUsages:[]});
  context.handleStatusChange('blocked',{value:'done'});assert.equal(writes.length,0);
  context.S.projects=[{id:'blocked',status:'done'}];context.currentRole='admin';
  context.handleStatusChange('blocked',{value:'contact'});assert.equal(writes.length,0);context.currentRole='manager';
  // New project form persists day-one history in the original projects collection.
  context.projectStageConfirmReturn=async()=> 'keep';
  vm.runInContext(shared.slice(shared.indexOf('window.saveProjectForm='),shared.indexOf('window.deleteProject=')),context);
  context.isAdmin=()=>true;context.canEditProjects=()=>true;context.ymdValue=()=>'';context.serverTimestamp=()=> 'server-time';context.collection=(_db,name)=>name;
  const fields={'np-name':'New stage test','np-status':'contact','np-type-kind':'新成屋','np-type-building':'公寓'};
  context.$=id=>({value:fields[id]||'',checked:false});context.sortDesignProjs=()=>[];context.setDoc=async()=>{};
  let created;context.addDoc=async(collection,data)=>{assert.equal(collection,'projects');created=data;return{id:'new'};};
  await context.saveProjectForm(null);assert.equal(created.stageHistory.segments[0].status,'contact');assert.equal(call('projectStageTotals',created.stageHistory).contact,1);
  // Form cancellation must keep its draft open and must not write any fields.
  context.S.projects=[design];fields['np-status']='contact';writes=[];context.projectStageConfirmReturn=async()=> 'cancel';
  await context.saveProjectForm('test');assert.equal(writes.length,0);assert.equal(context.S.projects[0].status,'design');
  let dayRenders=0;context.renderOverview=()=>dayRenders++;context.projectStageToday=()=> '2040-01-01';
  call('refreshProjectStageDay');call('refreshProjectStageDay');assert.equal(dayRenders,1);assert.equal(writes.length,0);
  console.log('PASS: Taipei midnight/calendar days, leap day, 4+5-day example, keep/delete/cancel, same-day multi-switch, independent accumulated totals, done freeze/reopen, unknown legacy data, invalid dates, no-write cancellation, atomic status/history, stale-device protection, existing completion gate, new-project persistence.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
