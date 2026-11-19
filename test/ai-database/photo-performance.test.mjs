import assert from 'node:assert/strict';
import {createProductionStore} from '../../app/features/ai-database/firebase-store.js';
import {createPhotoLoader} from '../../app/features/ai-database/photo-loader.js';
import {observePhotoCards} from '../../app/features/ai-database/photo-view.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(){
  let queries=0,downloads=0,role='manager',active=0,peak=0;
  const auth={currentUser:{uid:'admin'}};
  const store=createProductionStore({db:{},auth,storage:{},fs:{doc:(_db,...parts)=>parts.join('/'),getDocFromServer:async()=>{queries++;await pause(30);return{data:()=>({role,status:'active'})};}},storageSdk:{ref:(_s,path)=>path,getBlob:async()=>{downloads++;active++;peak=Math.max(peak,active);await pause(20);active--;return new Blob(['thumbnail']);}}});
  return {store,auth,get queries(){return queries;},get downloads(){return downloads;},get peak(){return peak;},setRole:value=>role=value};
}
const files=Array.from({length:32},(_,i)=>({id:String(i),storagePath:'aiDatabase/cases/c/'+i,thumbnailPath:'aiDatabase/cases/c/'+i+'_thumb.jpg'}));
const before=fixture(),oldLoader=createPhotoLoader(path=>before.store.getBlob(path),4);
let start=performance.now();await Promise.all(files.map(file=>oldLoader.load(file)));const oldMs=Math.round(performance.now()-start);oldLoader.dispose();
assert.equal(before.queries,32);assert.equal(before.downloads,32);assert.equal(before.peak,4);
const after=fixture();start=performance.now();const session=after.store.createPhotoReadSession();await session.ready;
const newLoader=createPhotoLoader(path=>session.getBlob(path));await Promise.all(files.map(file=>newLoader.load(file)));const newMs=Math.round(performance.now()-start);
assert.equal(session.permissionQueries,1);assert.equal(after.queries,1);assert.equal(after.downloads,32);assert.equal(after.peak,8);
await Promise.all(files.map(file=>newLoader.load(file)));assert.equal(after.downloads,32);newLoader.dispose();
after.auth.currentUser={uid:'different-account'};await assert.rejects(session.getBlob(files[0].thumbnailPath),{code:'aidb/permission-denied'});assert.equal(after.downloads,32);
const staff=fixture();staff.setRole('staff');const denied=staff.store.createPhotoReadSession();await assert.rejects(denied.ready,{code:'aidb/permission-denied'});assert.equal(staff.downloads,0);

const saved={window:globalThis.window,IntersectionObserver:globalThis.IntersectionObserver,requestAnimationFrame:globalThis.requestAnimationFrame};
let intersection,requested=[],reports=[];
globalThis.window={innerHeight:800};globalThis.requestAnimationFrame=callback=>setImmediate(callback);
globalThis.IntersectionObserver=class{constructor(callback){intersection=callback;}observe(){}unobserve(){}disconnect(){}};
const imgs=files.slice(0,16).map((file,i)=>({dataset:{photoId:file.id},getBoundingClientRect:()=>({width:100,height:100,top:i<8?200:3000,bottom:i<8?300:3100}),decode:async()=>{}}));
const lazyLoader=createPhotoLoader(async path=>{requested.push(path);return new Blob(['thumbnail']);});
try{
  const stop=observePhotoCards({root:{querySelectorAll:()=>imgs},files,loader:lazyLoader,readSession:{permissionQueries:1,getBlob:async path=>{requested.push(path);return new Blob(['thumbnail']);}},isCurrent:()=>true,onError:error=>{throw error;},onReport:report=>reports.push(report)});
  await pause(15);assert.equal(requested.length,8);assert.notEqual(reports.at(-1).firstBatchMs,null);assert.equal(reports.at(-1).allLoadedMs,null);assert.equal(reports.at(-1).deferred,8);
  intersection(imgs.slice(8).map(target=>({isIntersecting:true,target,boundingClientRect:{top:200}})));
  await pause(15);assert.equal(requested.length,16);assert.notEqual(reports.at(-1).allLoadedMs,null);assert.equal(reports.at(-1).loaded,16);stop();
}finally{lazyLoader.dispose();Object.assign(globalThis,saved);}
console.log(`PASS simulated 32 photos (permission 30ms + image 20ms): before queries=${before.queries}, total=${oldMs}ms; after queries=${after.queries}, total=${newMs}ms. Not Production timings.`);
console.log('PASS: max8, memory reuse, staff denied/account switch blocked; 8 visible first, 8 deferred until intersection, first/all timing records.');
