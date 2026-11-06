import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import * as appSdk from 'firebase/app';import * as fs from 'firebase/firestore';import * as auth from 'firebase/auth';import * as storage from 'firebase/storage';
import {createEmulatorStore} from '../../app/features/ai-database/firebase-store.js';
import {uploadCaseFiles,cleanupFiles} from '../../app/features/ai-database/files.js';
import {sorted} from '../../app/features/ai-database/model.js';
const sdk=[appSdk,fs,auth,{...storage,getBlob:async ref=>new Blob([await storage.getBytes(ref)])}];
const connect=name=>createEmulatorStore({location:{hostname:'127.0.0.1',href:'http://127.0.0.1:4180/test/index.html?aiTestUser='+name},sdk});
let a=await connect('admin-a');const b=await connect('admin-b');
const baseline=await a.load(),prefix='acceptance-'+Date.now(),caseId=prefix+'-case',case2=prefix+'-case2',cat1=prefix+'-cat1',cat2=prefix+'-cat2';
const result={startedAt:new Date().toISOString(),project:'demo-haven-ai',results:[],productionAccess:false};
const record=(name,evidence)=>{result.results.push({name,status:'PASS',evidence});console.log('PASS: '+name);};
const ctx={store:a,state:baseline,async commit(command){this.state=await this.store.commit(command,this.state.revision);}};
const commit=(type,payload)=>ctx.commit({type,payload});
const fileFor=kind=>ctx.state.files.find(f=>f.caseId===caseId&&f.kind===kind);
async function verifyOld(old,bytes){
  const fresh=await a.load(),active=fresh.files.find(f=>f.id===old.id);
  assert(active,'old metadata must remain active');assert.equal(active.storagePath,old.storagePath);
  assert.deepEqual(Buffer.from(await (await b.getBlob(old.storagePath)).arrayBuffer()),Buffer.from(bytes));
}
try{
  assert.equal(baseline.cleanupPaths.length,0,'Do not process an existing administrator cleanup job during acceptance.');
  const parent=baseline.categories.find(c=>c.moduleType==='cases');assert(parent);
  // Preserve all existing administrator data and sort values exactly.
  assert(sorted(baseline.categories).every((c,i)=>c.sortOrder===i),'Existing category ordering must be contiguous; acceptance must not normalize user data.');
  assert(sorted(baseline.cases.filter(c=>c.categoryId===parent.id)).every((c,i)=>c.sortOrder===i),'Existing case ordering must be contiguous.');
  await commit('category.create',{id:cat1,name:'驗收分類一'});await commit('category.create',{id:cat2,name:'驗收分類二'});
  await commit('category.rename',{id:cat1,name:'驗收分類已改名'});
  await commit('category.order',{ids:[...sorted(baseline.categories).map(c=>c.id),cat2,cat1]});
  let fresh=await b.load();assert.equal(fresh.categories.find(c=>c.id===cat1).name,'驗收分類已改名');assert.equal(sorted(fresh.categories).at(-2).id,cat2);assert.equal(fresh.categories.find(c=>c.id===cat1).moduleType,'blank');
  record('分類新增、改名、排序及跨管理員重新讀取','名稱、順序及 blank 模組類型均由 Firestore 讀回確認');
  const fields={name:'驗收案件',area:32.75,amount:2680000,year:2026,houseType:'中古屋',scopes:['客廳','廚房','主臥'],url:'https://example.com/acceptance',note:'Acceptance only; not production.'};
  await commit('case.create',{id:caseId,categoryId:parent.id,fields});await commit('case.create',{id:case2,categoryId:parent.id,fields:{name:'驗收排序案件'}});
  await commit('case.update',{id:caseId,fields:{...fields,name:'驗收案件已修改'}});
  await commit('case.order',{categoryId:parent.id,ids:[...sorted(baseline.cases.filter(c=>c.categoryId===parent.id)).map(c=>c.id),case2,caseId]});
  fresh=await b.load();const project=fresh.cases.find(c=>c.id===caseId);for(const key of Object.keys(fields))assert.deepEqual(project[key],key==='name'?'驗收案件已修改':fields[key]);
  assert.equal(sorted(fresh.cases.filter(c=>c.categoryId===parent.id)).at(-2).id,case2);
  record('案件新增、修改、全部基本欄位及排序保存','第二管理員讀回坪數、金額、年份、房型、複選範圍、網址及備註');
  const pdf=await readFile(new URL('./fixtures/verification.pdf',import.meta.url)),png=await readFile(new URL('./fixtures/verification.png',import.meta.url));
  for(const kind of ['quote','drawing','change','photo']){
    const bytes=kind==='photo'?png:pdf,mime=kind==='photo'?'image/png':'application/pdf';
    await uploadCaseFiles(ctx,caseId,kind,[new File([bytes],kind+(kind==='photo'?'.png':'.pdf'),{type:mime})]);
    const old=fileFor(kind);assert(old);assert(old.uploadedAt);assert(old.uploadedBy);assert.equal(old.size,bytes.byteLength);
    assert.deepEqual(Buffer.from(await (await b.getBlob(old.storagePath)).arrayBuffer()),bytes);
    const replacement=kind==='photo'?png:Buffer.concat([pdf,Buffer.from('\n% acceptance replacement\n')]);
    await uploadCaseFiles(ctx,caseId,kind,[new File([replacement],kind+'-v2'+(kind==='photo'?'.png':'.pdf'),{type:mime})],old.id);
    const active=fileFor(kind);assert(active);assert.notEqual(active.id,old.id);assert.equal(ctx.state.files.filter(f=>f.caseId===caseId&&f.kind===kind).length,1);
    assert.deepEqual(Buffer.from(await (await b.getBlob(active.storagePath)).arrayBuffer()),replacement);await assert.rejects(a.getBlob(old.storagePath));
    record(kind+'：上傳、下載內容與替換','原始位元組一致；新檔生效後才刪除舊檔；名稱、大小、上傳人員與時間均保存');
  }
  await commit('file.caption',{id:caseId,fileId:fileFor('photo').id,caption:'驗收照片備註'});
  const old=fileFor('quote'),oldBytes=await (await a.getBlob(old.storagePath)).arrayBuffer();
  await assert.rejects(uploadCaseFiles(ctx,caseId,'quote',[new File(['invalid'],'bad.pdf',{type:'application/pdf'})]));await verifyOld(old,oldBytes);
  record('替換失敗：格式驗證失敗保留舊檔','舊 metadata、path 與原始 bytes 完整保留');
  const uploadFailure={...ctx,store:{...a,putBlob:async()=>{throw Error('Acceptance simulated Storage failure');}}};
  await assert.rejects(uploadCaseFiles(uploadFailure,caseId,'quote',[new File([pdf],'failed.pdf',{type:'application/pdf'})]),/Storage failure/);await verifyOld(old,oldBytes);
  record('替換失敗：Storage 上傳失敗保留舊檔','故障注入只影響驗收呼叫；未修改真實規則或停止服務');
  let orphanPath='';const metadataFailure={...ctx,store:{...a,async putBlob(path,...args){orphanPath=path;await a.putBlob(path,...args);}},async commit(){throw Error('Acceptance simulated metadata failure');}};
  await assert.rejects(uploadCaseFiles(metadataFailure,caseId,'quote',[new File([pdf],'metadata-failed.pdf',{type:'application/pdf'})]),/metadata failure/);
  await verifyOld(old,oldBytes);await assert.rejects(a.getBlob(orphanPath));
  record('替換失敗：上傳成功但 metadata 寫入失敗','舊檔保持有效，新上傳未掛載物件已清理');
  // A genuine revision conflict after another administrator commits.
  const bState=await b.load();await b.commit({type:'case.update',payload:{id:case2,fields:{name:'第二管理員已更新'}}},bState.revision);
  await assert.rejects(uploadCaseFiles(ctx,caseId,'quote',[new File([pdf],'stale.pdf',{type:'application/pdf'})]),/修改/);await verifyOld(old,oldBytes);ctx.state=await a.load();
  record('替換失敗：另一管理員先修改造成版本衝突','拒絕舊版本寫入並保留舊檔；未重設或覆蓋他人資料');
  // Two transactions begin with the same revision. Exactly one may succeed.
  const rev=ctx.state.revision,commands=['A','B'].map(name=>({type:'case.update',payload:{id:case2,fields:{name:'並行寫入 '+name}}}));
  const writes=await Promise.allSettled([a.commit(commands[0],rev),b.commit(commands[1],rev)]);assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes.filter(r=>r.status==='rejected').length,1);ctx.state=await a.load();
  record('兩位管理員真正並行儲存','同版本同時送出兩筆交易，恰好一筆成功、一筆遭拒，沒有靜默覆蓋');
  // Reconnect the actual Firebase repository, not just a cached object.
  await a.close();a=await connect('admin-a');ctx.store=a;ctx.state=await a.load();
  assert.equal(fileFor('photo').caption,'驗收照片備註');assert.deepEqual(Buffer.from(await (await a.getBlob(fileFor('drawing').storagePath)).arrayBuffer()),Buffer.concat([pdf,Buffer.from('\n% acceptance replacement\n')]));
  record('關閉並重建 Firebase 連線後重新讀取','案件、排序、檔案原始 bytes 與照片備註保持');
  const prior=fileFor('drawing'),failedCleanup={...ctx,store:{...a,deleteBlob:async()=>{throw Error('Acceptance cleanup unavailable');}},async commit(command){this.state=await a.commit(command,this.state.revision);}};
  await uploadCaseFiles(failedCleanup,caseId,'drawing',[new File([pdf],'cleanup-retry.pdf',{type:'application/pdf'})]);
  assert(failedCleanup.state.cleanupPaths.includes(prior.storagePath));assert(await a.getBlob(prior.storagePath));ctx.state=await a.load();await cleanupFiles(ctx);assert.equal(ctx.state.cleanupPaths.length,0);await assert.rejects(a.getBlob(prior.storagePath));
  record('替換後清理失敗與重試','新檔仍可用，舊路徑持久列入待清理，重試後清除');
  for(const kind of ['quote','drawing','change','photo']){const file=fileFor(kind);await commit('file.delete',{id:caseId,fileId:file.id});await cleanupFiles(ctx);assert(!ctx.state.files.some(f=>f.id===file.id));await assert.rejects(a.getBlob(file.storagePath));record(kind+'：刪除 metadata 與 Storage 原檔','僅刪除程式自行建立的驗收檔案');}
  await commit('case.delete',{id:caseId});await commit('case.delete',{id:case2});
  await commit('category.delete',{id:cat1});await commit('category.delete',{id:cat2});
  record('案件與分類刪除','兩個驗收分類及兩筆驗收案件已移除，原有資料不受影響');
  const after=await a.load();for(const key of ['categories','cases','files','knowledge','analysisRuns','questions','answerRevisions','cleanupPaths'])assert.deepEqual(after[key],baseline[key],key+' must equal pre-acceptance administrator data');
  record('原有操作畫面資料完整保留','比較驗收前後所有原有分類、案件、檔案、知識及待清理資料，逐欄完全相同；只有全域 revision 正常推進');
  result.status='PASS';
}catch(error){result.status='FAIL';result.error=error.stack;throw error;}
finally{
  // On failure remove only this runner's uniquely identified records.
  try{ctx.state=await a.load();ctx.store=a;for(const id of [caseId,case2])if(ctx.state.cases.some(c=>c.id===id))await commit('case.delete',{id});for(const id of [cat1,cat2])if(ctx.state.categories.some(c=>c.id===id))await commit('category.delete',{id});if(ctx.state.cleanupPaths.length===0||ctx.state.cleanupPaths.every(path=>path.includes(prefix)))await cleanupFiles(ctx);}catch(error){result.cleanupError=error.message;}
  result.completedAt=new Date().toISOString();await writeFile(new URL('acceptance-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  for(const app of appSdk.getApps())await appSdk.deleteApp(app);
}
