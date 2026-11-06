import assert from 'node:assert/strict';
import * as appSdk from 'firebase/app';import * as firestore from 'firebase/firestore';import * as auth from 'firebase/auth';import * as storage from 'firebase/storage';
import {createEmulatorStore} from '../../app/features/ai-database/firebase-store.js';
import {uploadCaseFiles,cleanupFiles} from '../../app/features/ai-database/files.js';
// getBlob is browser-only; getBytes exercises the same authenticated Storage request in Node.
const sdk=[appSdk,firestore,auth,{...storage,getBlob:async ref=>new Blob([await storage.getBytes(ref)])}];
const connect=name=>createEmulatorStore({location:{hostname:'127.0.0.1',href:'http://127.0.0.1:4180/test/index.html?aiTestUser='+name},sdk});
const a=await connect('admin-a'),b=await connect('admin-b');
const id='repository-'+Date.now();let state=await a.load();
const ctx={store:a,state,async commit(command){this.state=await a.commit(command,this.state.revision);}};
try{
  const parent=state.categories.find(c=>c.moduleType==='cases');assert(parent,'interactive seed category must exist');
  const stale=await b.load();
  await ctx.commit({type:'case.create',payload:{id,categoryId:parent.id,fields:{name:'Repository integration test',area:28.75}}});
  await assert.rejects(b.commit({type:'case.update',payload:{id,fields:{name:'stale'}}},stale.revision),/修改/);
  const seen=await b.load();assert.equal(seen.cases.find(c=>c.id===id).area,28.75);
  await b.commit({type:'case.update',payload:{id,fields:{name:'Edited by second administrator',area:30.5}}},seen.revision);
  ctx.state=await a.load();assert.equal(ctx.state.cases.find(c=>c.id===id).name,'Edited by second administrator');
  const pdf=new File(['%PDF-1.4\noriginal'],'repository.pdf',{type:'application/pdf'});
  await uploadCaseFiles(ctx,id,'quote',[pdf]);const old=ctx.state.files.find(f=>f.caseId===id);assert.equal(await (await b.getBlob(old.storagePath)).text(),await pdf.text());
  await uploadCaseFiles(ctx,id,'quote',[pdf]);assert.equal(ctx.state.files.filter(f=>f.caseId===id).length,1);assert(!ctx.state.cleanupPaths.length);
  await assert.rejects(b.getBlob(old.storagePath));
  for(const role of ['staff','resigned'])await assert.rejects(connect(role),/管理權限/);
  console.log('PASS: real Firebase repository, two administrator sessions, shared cases, stale-write rejection, original PDF bytes, replacement cleanup and denied roles.');
}finally{
  ctx.state=await a.load();if(ctx.state.cases.some(c=>c.id===id)){await ctx.commit({type:'case.delete',payload:{id}});await cleanupFiles(ctx);}
  await a.close();await b.close();for(const app of appSdk.getApps())await appSdk.deleteApp(app);
}
