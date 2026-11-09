import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc } from 'firebase/firestore';
import { connectStorageEmulator, deleteObject, getBytes, getStorage, listAll, ref, updateMetadata, uploadBytes } from 'firebase/storage';
import * as firestoreSdk from 'firebase/firestore';
import * as storageSdk from 'firebase/storage';
import { createProductionStore } from '../../app/features/ai-database/firebase-store.js';
import { cleanupFiles, uploadCaseFiles } from '../../app/features/ai-database/files.js';
import { sorted } from '../../app/features/ai-database/model.js';

// Only use the dedicated local review emulators.
const projectId = 'demo-haven-ai-review';
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8281 },
  storage: { host: '127.0.0.1', port: 9399 },
});

const apps = [];
async function connectAccount(name) {
  const app = initializeApp({
    projectId,
    apiKey: 'emulator-only',
    storageBucket: projectId + '.appspot.com',
  }, name);
  apps.push(app);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9499', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8281);
  connectStorageEmulator(storage, '127.0.0.1', 9399);

  let uid;
  if (name !== 'anonymous') {
    const email = name + '@ai-review.test';
    const password = 'LocalReviewOnly123!';
    const created = await createUserWithEmailAndPassword(auth, email, password);
    await signOut(auth);
    const signedIn = await signInWithEmailAndPassword(auth, email, password);
    uid = signedIn.user.uid;
    assert.equal(uid, created.user.uid);
  }
  return { uid, auth, firestore: () => db, storage: () => storage };
}

async function checkProductionAdapter(admin,manager,staff){
  function storeFor(context){
    return createProductionStore({
      db:context.firestore(),auth:context.auth,storage:context.storage(),
      fs:firestoreSdk,storageSdk:{
        ...storageSdk,
        // Browser getBlob uses the same authenticated object request as getBytes.
        getBlob:async file=>new Blob([await getBytes(file)]),
      },
    });
  }
  const store=storeFor(admin),second=storeFor(manager),employee=storeFor(staff);
  const context={
    store,state:await store.load(),
    async commit(command){
      this.state=await store.commit(command,this.state.revision);
    },
  };
  const commit=(type,payload)=>context.commit({type,payload});
  const categoryId='release-review-category',caseId='release-review-case';
  await assert.rejects(employee.load(),{code:'aidb/permission-denied'});
  await commit('category.create',{id:categoryId,name:'虛構測試分類'});
  await commit('category.rename',{id:categoryId,name:'虛構分類更新'});
  await commit('category.order',{ids:[categoryId,'cases']});
  await commit('case.create',{id:caseId,categoryId:'cases',fields:{name:'虛構案例'}});
  await commit('case.update',{id:caseId,fields:{name:'虛構案例更新',area:12.5,amount:10000,year:2025}});
  await assert.rejects(store.getBlob('projectPhotos/example/quote.pdf'),/路徑/);

  const fixtures=await Promise.all(['verification.pdf','verification.png'].map(name=>
    readFile(new URL('./fixtures/'+name,import.meta.url))));
  for(const [kind,name,type,bytes] of [
    ['quote','verification.pdf','application/pdf',fixtures[0]],
    ['drawing','drawing.pdf','application/pdf',fixtures[0]],
    ['photo','verification.png','image/png',fixtures[1]],
  ]){
    await uploadCaseFiles(context,caseId,kind,[new File([bytes],name,{type})]);
    const snapshot=await second.load();
    assert.equal(sorted(snapshot.categories)[0].id,categoryId);
    assert.equal(snapshot.cases.find(item=>item.id===caseId).area,12.5);
    const file=snapshot.files.find(item=>item.kind===kind);
    assert.match(file.storagePath,/^aiDatabase\/cases\/release-review-case\//);
    assert.equal(file.name,name);
    assert.deepEqual(Buffer.from(await (await second.getBlob(file.storagePath)).arrayBuffer()),bytes);
    await assert.rejects(getBytes(ref(staff.storage(),file.storagePath)),{code:'storage/unauthorized'});
  }
  const oldPhoto=context.state.files.find(item=>item.kind==='photo');
  await uploadCaseFiles(context,caseId,'photo',
    [new File([fixtures[1]],'replacement.png',{type:'image/png'})],oldPhoto.id);
  await assert.rejects(second.getBlob(oldPhoto.storagePath),{code:'storage/object-not-found'});
  const paths=context.state.files.map(file=>file.storagePath);
  await commit('case.delete',{id:caseId});
  await cleanupFiles(context);
  await commit('category.delete',{id:categoryId});
  const state=await second.load();
  assert.equal(state.cases.length,0);
  assert.equal(state.files.length,0);
  assert.equal(state.cleanupPaths.length,0);
  for(const path of paths)await assert.rejects(second.getBlob(path),{code:'storage/object-not-found'});
  console.log('PASS production adapter: category management, case persistence, PDF and photo upload/read, staff direct object denial, replacement and deletion.');
}

let allowed = 0;
let denied = 0;
async function allow(operation) {
  const result = await operation;
  allowed++;
  return result;
}

async function deny(operation) {
  await assert.rejects(operation, error =>
    ['permission-denied', 'storage/unauthorized', 'storage/unauthenticated'].includes(error.code));
  denied++;
}

const collections = [
  'aiDbCategories', 'aiDbCases', 'aiDbFiles', 'aiDbMeta',
  'aiDbKnowledge', 'aiDbAnalysisRuns', 'aiDbQuestions', 'aiDbAnswerRevisions',
];
const pdf = new TextEncoder().encode('%PDF-1.4\nfictional review fixture');
const photo = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const pdfMetadata = { contentType: 'application/pdf' };
const photoMetadata = { contentType: 'image/png' };

try {
  const [admin, manager, staff, supervisor, resigned, newcomer, anonymous, outsider] =
    await Promise.all([
      'admin', 'manager', 'staff', 'supervisor', 'resigned', 'newcomer', 'anonymous', 'outsider',
    ].map(connectAccount));

  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [uid, role, status] of [
      [admin.uid, 'admin', 'active'], [manager.uid, 'manager', 'active'],
      [staff.uid, 'staff', 'active'], [supervisor.uid, 'supervisor', 'active'],
      [resigned.uid, 'manager', 'resigned'],
    ]) {
      await setDoc(doc(db, 'members', uid), { uid, role, status });
    }
  });

  const newMember = doc(newcomer.firestore(), 'members', newcomer.uid);
  const pending = { uid: newcomer.uid, role: 'pending', status: 'active' };
  await deny(setDoc(newMember, { ...pending, role: 'admin' }));
  await deny(setDoc(doc(staff.firestore(), 'members', 'other'), {
    uid: 'other', role: 'admin', status: 'active',
  }));
  await allow(setDoc(newMember, pending));
  await allow(getDoc(newMember));
  await deny(updateDoc(newMember, { role: 'manager' }));
  await deny(getDoc(doc(newcomer.firestore(), 'members', staff.uid)));

  const unauthorized = [staff, supervisor, resigned, newcomer, anonymous, outsider];
  for (const name of collections) {
    const record = context => doc(context.firestore(), name, 'example');
    await allow(setDoc(record(admin), { name: 'Fictional data' }));
    await allow(getDocs(collection(manager.firestore(), name)));
    await allow(updateDoc(record(manager), { name: 'Updated' }));
    assert.equal((await allow(getDoc(record(admin)))).data().name, 'Updated');

    for (const context of unauthorized) {
      await deny(getDoc(record(context)));
      await deny(getDocs(collection(context.firestore(), name)));
      await deny(setDoc(doc(context.firestore(), name, 'new'), { name: 'Denied' }));
      await deny(updateDoc(record(context), { name: 'Denied' }));
      await deny(deleteDoc(record(context)));
    }
    await allow(deleteDoc(record(manager)));
  }

  const nested = context => doc(context.firestore(), 'aiDbCases', 'case', 'nested', 'item');
  await allow(setDoc(nested(admin), { name: 'Nested' }));
  await deny(getDoc(nested(staff)));
  await deny(updateDoc(nested(staff), { name: 'Denied' }));

  const aiFolder = 'aiDatabase/cases/example';
  for (const [fileName, bytes, metadata] of [
    ['quote.pdf', pdf, pdfMetadata],
    ['photo.png', photo, photoMetadata],
  ]) {
    const path = aiFolder + '/' + fileName;
    const adminFile = ref(admin.storage(), path);
    const managerFile = ref(manager.storage(), path);
    await allow(uploadBytes(adminFile, bytes, metadata));
    for (const file of [adminFile, managerFile]) {
      assert.deepEqual(new Uint8Array(await allow(getBytes(file))), bytes);
    }
    await deny(uploadBytes(adminFile, bytes, metadata));
    for (const context of unauthorized) {
      const deniedFile = ref(context.storage(), path);
      await deny(getBytes(deniedFile));
      await deny(uploadBytes(deniedFile, bytes, metadata));
      await deny(updateMetadata(deniedFile, { cacheControl: 'no-cache' }));
      await deny(uploadBytes(ref(context.storage(), aiFolder + '/denied-' + fileName), bytes, metadata));
      await deny(deleteObject(ref(context.storage(), path)));
    }
    await allow(deleteObject(adminFile));
    await assert.rejects(getBytes(adminFile), { code: 'storage/object-not-found' });
  }
  await deny(uploadBytes(ref(admin.storage(), 'aiDatabase/cases/example/page.html'),
    pdf, { contentType: 'text/html' }));
  for (const context of unauthorized) {
    await deny(listAll(ref(context.storage(), aiFolder)));
  }

  for (const [context, role] of [[staff, 'staff'], [supervisor, 'supervisor']]) {
    const db = context.firestore();
    await allow(getDocs(collection(db, 'members')));
    await allow(updateDoc(doc(db, 'members', context.uid), { name: 'Profile edit' }));
    await deny(updateDoc(doc(db, 'members', context.uid), { role: 'admin' }));
    await deny(updateDoc(doc(db, 'members', resigned.uid), { status: 'active' }));
    await deny(deleteDoc(doc(db, 'members', manager.uid)));
    const project = doc(db, 'projects', role);
    await allow(setDoc(project, { name: 'Existing APP project' }));
    await allow(getDoc(project));
    await allow(updateDoc(project, { name: 'Edited' }));
    await allow(deleteDoc(project));

    const photoPath = ref(context.storage(), 'projectPhotos/example/' + role + '.png');
    await allow(uploadBytes(photoPath, photo, photoMetadata));
    assert.deepEqual(new Uint8Array(await allow(getBytes(photoPath))), photo);
    assert.deepEqual(new Uint8Array(await allow(getBytes(ref(admin.storage(), photoPath.fullPath)))), photo);
    await allow(deleteObject(photoPath));
    await deny(uploadBytes(ref(context.storage(), 'projectPhotos/example/quote.pdf'),
      pdf, pdfMetadata));
  }

  const member = doc(manager.firestore(), 'members', newcomer.uid);
  await allow(updateDoc(member, { role: 'staff', status: 'active' }));
  await allow(updateDoc(member, { status: 'resigned' }));
  await allow(deleteDoc(member));

  console.log('PASS: ' + allowed + ' allowed operations and ' + denied + ' denied operations.');
  await checkProductionAdapter(admin,manager,staff);
  const storageRules = await readFile(new URL('production-review/storage.rules', import.meta.url));
  console.log('Storage candidate SHA-256: ' + createHash('sha256').update(storageRules).digest('hex'));
} finally {
  await Promise.all(apps.map(app => deleteApp(app)));
  await env.cleanup();
}
