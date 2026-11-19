import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {createPhotoLoader} from '../../app/features/ai-database/photo-loader.js';
import {photoThumbnail} from '../../app/features/ai-database/photo-thumbnail.js';
import {uploadCaseFiles,cleanupFiles,openFile} from '../../app/features/ai-database/files.js';
import {createLocalStore} from '../../app/features/ai-database/store.js';
import {createProductionStore} from '../../app/features/ai-database/firebase-store.js';
import {renderFile} from '../../app/features/ai-database/file-view.js';

const originalDocument=globalThis.document,originalBitmap=globalThis.createImageBitmap;
let dimensions={width:2400,height:3600},canvasSize,closed=0;
globalThis.createImageBitmap=async()=>({...dimensions,close(){closed++;}});
globalThis.document={createElement(){const canvas={getContext:()=>({fillRect(){},drawImage(){}}),toBlob(callback,type){canvasSize=[canvas.width,canvas.height];callback(new Blob(['small thumbnail'],{type}));}};return canvas;}};
try{
  await photoThumbnail(new Blob());assert.deepEqual(canvasSize,[320,480]);
  dimensions={width:3600,height:2400};await photoThumbnail(new Blob());assert.deepEqual(canvasSize,[480,320]);
  dimensions={width:120,height:80};await photoThumbnail(new Blob());assert.deepEqual(canvasSize,[120,80]);assert.equal(closed,3);
  globalThis.indexedDB=indexedDB;
  const manager={uid:'photo-test',role:'manager',status:'active'};
  const store=await createLocalStore(()=>manager);
  const context={store,state:await store.load(),async commit(command){this.state=await this.store.commit(command,this.state.revision);}};
  await context.commit({type:'case.create',payload:{id:'photo-case',categoryId:'cases',fields:{name:'縮圖隔離測試'}}});
  const original=new File([new Uint8Array([255,216,255]),'original full resolution data'],'original.jpg',{type:'image/jpeg'});
  await uploadCaseFiles(context,'photo-case','photo',[original]);
  const file=context.state.files[0];
  assert.equal(file.thumbnailPath,file.storagePath+'_thumb.jpg');
  assert.deepEqual(await (await store.getBlob(file.storagePath)).arrayBuffer(),await original.arrayBuffer());
  assert.equal(await (await store.getBlob(file.thumbnailPath)).text(),'small thumbnail');
  await context.commit({type:'file.caption',payload:{id:'photo-case',fileId:file.id,caption:'保留的照片備註'}});
  store.close();
  const reopened=await createLocalStore(()=>manager);context.store=reopened;context.state=await reopened.load();
  assert.equal(context.state.files[0].caption,'保留的照片備註');assert.equal(context.state.files[0].thumbnailPath,file.thumbnailPath);
  assert.equal(await (await reopened.getBlob(file.thumbnailPath)).text(),'small thumbnail');
  // Preview always reads the original, independently of the card thumbnail.
  const oldWindow=globalThis.window,oldTimer=globalThis.setTimeout;let previewPath,previewUrl;
  globalThis.window={open:()=>({location:{replace(url){previewUrl=url;}},close(){}})};
  globalThis.setTimeout=()=>0;
  try{await openFile({getBlob:async path=>{previewPath=path;return original;}},file);assert.equal(previewPath,file.storagePath);}
  finally{URL.revokeObjectURL(previewUrl);globalThis.window=oldWindow;globalThis.setTimeout=oldTimer;}
  await context.commit({type:'file.delete',payload:{id:'photo-case',fileId:file.id}});
  assert.deepEqual(new Set(context.state.cleanupPaths),new Set([file.storagePath,file.thumbnailPath]));
  await cleanupFiles(context);
  await assert.rejects(reopened.getBlob(file.storagePath));await assert.rejects(reopened.getBlob(file.thumbnailPath));
  // A failed thumbnail upload rolls back only this new upload, not prior records.
  const deleted=[],saved=[];
  await assert.rejects(uploadCaseFiles({state:{files:[]},store:{putBlob:async path=>{saved.push(path);if(path.endsWith('_thumb.jpg'))throw Error('upload failure');},deleteBlob:async path=>deleted.push(path)},commit:()=>assert.fail('failed upload must not create a record')},'photo-case','photo',[original]),/upload failure/);
  assert.deepEqual(deleted,[saved[0]]);
  globalThis.createImageBitmap=async()=>{throw Error('decode failure');};
  await assert.rejects(uploadCaseFiles({store:{putBlob:()=>assert.fail('failed resize must not upload')}},'photo-case','photo',[original]),/縮圖建立失敗/);
  reopened.close();
  const uploads=[];
  const firebase=createProductionStore({db:{},auth:{currentUser:{uid:'admin'}},storage:{},fs:{doc:(_db,...parts)=>parts.join('/'),getDocFromServer:async()=>({data:()=>({role:'manager',status:'active'})})},storageSdk:{ref:(_s,path)=>path,uploadBytes:async(...args)=>uploads.push(args)}});
  await firebase.putBlob('aiDatabase/cases/case/file',original,'image/jpeg');
  await firebase.putBlob('aiDatabase/cases/case/file_thumb.jpg',new Blob(),'image/jpeg');
  assert.ok(uploads.every(upload=>upload[2].cacheControl==='private, max-age=86400'));
  assert.match(renderFile({...file,kind:'photo',caption:''}),/loading="lazy" decoding="async"/);
}finally{globalThis.document=originalDocument;globalThis.createImageBitmap=originalBitmap;}

let active=0,peak=0,reads=[];const releases=[];
const loader=createPhotoLoader(async path=>{reads.push(path);active++;peak=Math.max(peak,active);await new Promise(resolve=>releases.push(()=>{active--;resolve();}));return new Blob([path]);});
const files=Array.from({length:12},(_,i)=>({storagePath:'original-'+i,thumbnailPath:'thumb-'+i}));
const tasks=files.map(file=>loader.load(file));
const duplicate=loader.load(files[0]);assert.equal(duplicate,tasks[0]);
while(releases.length){releases.splice(0).forEach(resolve=>resolve());await new Promise(resolve=>setImmediate(resolve));}
await Promise.all(tasks);assert.equal(peak,4);assert.equal(reads.length,12);assert.ok(reads.every(path=>path.startsWith('thumb-')));
await loader.load(files[0]);assert.equal(reads.length,12);loader.dispose();
const fallbackReads=[];
const fallback=createPhotoLoader(async path=>{fallbackReads.push(path);if(path==='missing-thumb')throw Object.assign(Error(),{code:'storage/object-not-found'});return new Blob([path]);});
await fallback.load({storagePath:'old-original'});
await fallback.load({storagePath:'fallback-original',thumbnailPath:'missing-thumb'});
assert.deepEqual(fallbackReads,['old-original','missing-thumb','fallback-original']);fallback.dispose();
let deniedReads=0;
const denied=createPhotoLoader(async()=>{deniedReads++;throw Object.assign(Error(),{code:'storage/unauthorized'});});
await assert.rejects(denied.load({storagePath:'private-original',thumbnailPath:'private-thumb'}),{code:'storage/unauthorized'});assert.equal(deniedReads,1);denied.dispose();
console.log('PASS: long-edge 480px, unchanged originals, durable thumbnail paths/captions, rollback, cleanup, original preview, cache metadata, max-4 concurrent reads, deduplication and legacy fallback. Image encoding/Storage mocked; local persistence uses IndexedDB.');
