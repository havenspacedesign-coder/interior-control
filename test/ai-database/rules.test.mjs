import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject,listAll} from 'firebase/storage';
// Cross-service Storage rules use the emulator's configured project ID.
// Unique test documents only; never clear the interactive database.
const env=await initializeTestEnvironment({projectId:'demo-haven-ai',firestore:{host:'127.0.0.1',port:8181,rules:await readFile(new URL('firestore.rules',import.meta.url),'utf8')},storage:{host:'127.0.0.1',port:9299,rules:await readFile(new URL('storage.rules',import.meta.url),'utf8')}});
const tag=Date.now().toString(),categoryId='category-'+tag,caseId='case-'+tag,fileId='file-'+tag,path=`aiDatabaseTest/cases/${caseId}/${fileId}`;
try{
  await env.withSecurityRulesDisabled(async ctx=>{
    for(const [uid,role,status] of [['a','manager','active'],['b','admin','active'],['s','staff','active'],['r','manager','resigned']])await setDoc(doc(ctx.firestore(),'members',uid),{role,status});
    await setDoc(doc(ctx.firestore(),'aiDbTestCategories',categoryId),{id:categoryId,name:'案件資料庫',moduleType:'cases',sortOrder:0});
  });
  const a=env.authenticatedContext('a'),b=env.authenticatedContext('b'),s=env.authenticatedContext('s'),r=env.authenticatedContext('r'),anon=env.unauthenticatedContext();
  const project={id:caseId,name:'安全規則驗證',categoryId,area:25.5,amount:1200000,contentRevision:1};
  await assertSucceeds(setDoc(doc(a.firestore(),'aiDbTestCases',caseId),project));
  assert.equal((await assertSucceeds(getDoc(doc(b.firestore(),'aiDbTestCases',caseId)))).data().name,project.name);
  for(const denied of [s,r,anon]){
    await assertFails(getDoc(doc(denied.firestore(),'aiDbTestCases',caseId)));
    await assertFails(getDocs(collection(denied.firestore(),'aiDbTestCases')));
    await assertFails(setDoc(doc(denied.firestore(),'aiDbTestCases','denied-'+tag),{...project,id:'denied-'+tag}));
    await assertFails(updateDoc(doc(denied.firestore(),'aiDbTestCases',caseId),{name:'unauthorized change'}));
    await assertFails(deleteDoc(doc(denied.firestore(),'aiDbTestCases',caseId)));
    for(const collectionName of ['aiDbTestCategories','aiDbTestFiles','aiDbTestKnowledge','aiDbTestAnalysisRuns','aiDbTestQuestions','aiDbTestAnswerRevisions'])await assertFails(getDocs(collection(denied.firestore(),collectionName)));
  }
  await assertFails(updateDoc(doc(s.firestore(),'members','s'),{role:'manager'}));
  await assertFails(setDoc(doc(a.firestore(),'aiDbTestCases','negative-'+tag),{...project,id:'negative-'+tag,area:-1}));
  await assertFails(setDoc(doc(a.firestore(),'aiDbTestKnowledge','fabricated-'+tag),{content:'假 AI 知識',confirmation:'confirmed'}));
  await assertFails(setDoc(doc(a.firestore(),'projects','forbidden-'+tag),{name:'must not enter business collection'}));
  await assertFails(setDoc(doc(a.firestore(),'aiDbTestFiles','forged-'+tag),{id:'forged-'+tag,caseId,kind:'quote',storagePath:'projectPhotos/forbidden.pdf',size:1}));
  const bytes=new TextEncoder().encode('%PDF-1.4\ntest');
  await assertSucceeds(uploadBytes(ref(a.storage(),path),bytes,{contentType:'application/pdf'}));
  assert.equal((await assertSucceeds(getBytes(ref(b.storage(),path)))).byteLength,bytes.byteLength);
  await assertFails(uploadBytes(ref(a.storage(),path),bytes,{contentType:'application/pdf'}));
  for(const denied of [s,r,anon]){
    await assertFails(getBytes(ref(denied.storage(),path)));
    await assertFails(uploadBytes(ref(denied.storage(),path+'-denied'),bytes,{contentType:'application/pdf'}));
    await assertFails(deleteObject(ref(denied.storage(),path)));
    await assertFails(listAll(ref(denied.storage(),`aiDatabaseTest/cases/${caseId}`)));
  }
  await assertFails(uploadBytes(ref(a.storage(),path+'-html'),bytes,{contentType:'text/html'}));
  await assertFails(uploadBytes(ref(a.storage(),`aiDatabaseTest/cases/missing-${tag}/x`),bytes,{contentType:'application/pdf'}));
  await assertFails(uploadBytes(ref(a.storage(),`projectPhotos/forbidden-${tag}.pdf`),bytes,{contentType:'application/pdf'}));
  await assertSucceeds(deleteObject(ref(a.storage(),path)));
  console.log('PASS: two administrators share Firestore/Storage; staff, resigned and anonymous read/write/delete denied; self-promotion denied; invalid data and forged AI knowledge denied.');
}finally{
  // Also remove the runner's original object if a negative assertion aborts early.
  try{await deleteObject(ref(env.authenticatedContext('a').storage(),path));}catch(error){if(error.code!=='storage/object-not-found')console.error('Rules test object cleanup failed:',path,error.code);}
  await env.withSecurityRulesDisabled(async ctx=>{await deleteDoc(doc(ctx.firestore(),'aiDbTestCases',caseId));await deleteDoc(doc(ctx.firestore(),'aiDbTestCategories',categoryId));});
  await env.cleanup();
}
// Coordinator guards use an entirely separate Firestore-only demo namespace,
// so a failing delete-regression test cannot touch the interactive coordinator.
const metaEnv=await initializeTestEnvironment({projectId:'demo-haven-ai-meta-rules',firestore:{host:'127.0.0.1',port:8181,rules:await readFile(new URL('firestore.rules',import.meta.url),'utf8')}});
try{
  await metaEnv.withSecurityRulesDisabled(async ctx=>{await setDoc(doc(ctx.firestore(),'members','rule-manager'),{role:'manager',status:'active'});await setDoc(doc(ctx.firestore(),'aiDbTestMeta','state'),{schemaVersion:1,revision:1,cleanupPaths:[],updatedBy:'rule-manager'});});
  const managerDb=metaEnv.authenticatedContext('rule-manager').firestore(),coordinator=doc(managerDb,'aiDbTestMeta','state');
  await assertFails(deleteDoc(coordinator));
  await assertFails(updateDoc(coordinator,{revision:1}));await assertFails(updateDoc(coordinator,{revision:5}));
  await assertSucceeds(updateDoc(coordinator,{revision:2}));
  console.log('PASS: coordinator deletion, revision rollback and revision skipping denied; next revision accepted. Isolated Firestore-only demo project.');
}finally{await metaEnv.cleanup();}
