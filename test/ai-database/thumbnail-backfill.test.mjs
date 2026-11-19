import assert from 'node:assert/strict';
import {initialState,applyCommand} from '../../app/features/ai-database/model.js';
import {backfillPhotoThumbnails} from '../../app/features/ai-database/thumbnail-backfill.js';

const manager={uid:'backfill-test',role:'manager',status:'active'};
let state=applyCommand(initialState(),{type:'case.create',payload:{id:'c',categoryId:'cases',fields:{name:'保留案件',note:'保留案件備註'}}},manager);
const row=(id,extra={})=>({id,caseId:'c',kind:'photo',storagePath:'aiDatabaseTest/cases/c/'+id,name:id+'.jpg',caption:'保留照片備註',sortOrder:5,...extra});
state.files=[row('old'),row('already',{thumbnailPath:'aiDatabaseTest/cases/c/already_thumb.jpg'}),row('broken'),row('resume')];
const blobs=new Map([
  [state.files[0].storagePath,new Blob(['original-immutable'],{type:'image/jpeg'})],
  [state.files[1].storagePath,new Blob(['already-original'],{type:'image/jpeg'})],
  [state.files[3].storagePath,new Blob(['resume-original'],{type:'image/jpeg'})],
  [state.files[3].storagePath+'_thumb.jpg',new Blob(['previously-uploaded-thumbnail'],{type:'image/jpeg'})],
]);
const before=structuredClone(state),writes=[],reads=[];let injectConflict=true;
const store={load:async()=>structuredClone(state),
  getBlob:async path=>{reads.push(path);if(!blobs.has(path))throw Object.assign(Error('missing'),{code:'storage/object-not-found'});return blobs.get(path);},
  putBlob:async(path,blob)=>{writes.push(path);assert.ok(path.endsWith('_thumb.jpg'));assert.ok(!blobs.has(path));blobs.set(path,blob);},
  deleteBlob:()=>assert.fail('Backfill must never delete objects'),
  commit:async(command,revision)=>{
    assert.equal(command.type,'file.thumbnail');
    if(injectConflict){injectConflict=false;state=applyCommand(state,{type:'file.caption',payload:{id:'c',fileId:'old',caption:'其他人最新備註'}},manager);throw Error('version conflict');}
    assert.equal(revision,state.revision);state=applyCommand(state,command,manager);return structuredClone(state);
  },
};
const oldDocument=globalThis.document,oldBitmap=globalThis.createImageBitmap;
globalThis.createImageBitmap=async()=>({width:1200,height:800,close(){}});
globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}}),toBlob:callback=>callback(new Blob(['generated-thumbnail'],{type:'image/jpeg'}))})};
try{
  const result=await backfillPhotoThumbnails(store);
  assert.deepEqual([result.found,result.success,result.skipped,result.failed],[4,2,1,1]);
  assert.deepEqual(writes,[before.files[0].storagePath+'_thumb.jpg']);
  assert.equal(reads.includes(before.files[1].storagePath),false,'existing thumbnail skips original reads');
  assert.equal(state.files[0].caption,'其他人最新備註','concurrent edits are preserved');
  assert.equal(await blobs.get(before.files[0].storagePath).text(),'original-immutable');
  for(const old of before.files){const current=structuredClone(state.files.find(f=>f.id===old.id));const expected={...old,...(old.id==='old'?{caption:'其他人最新備註'}:{})};delete current.thumbnailPath;delete expected.thumbnailPath;assert.deepEqual(current,expected);}
  const writesBefore=writes.length;
  const rerun=await backfillPhotoThumbnails(store);
  assert.deepEqual([rerun.found,rerun.success,rerun.skipped,rerun.failed],[4,0,3,1]);assert.equal(writes.length,writesBefore);
  // Reject an attempt to attach a different path or touch an original.
  assert.throws(()=>applyCommand(before,{type:'file.thumbnail',payload:{id:'c',fileId:'old',storagePath:before.files[0].storagePath,thumbnailPath:before.files[0].storagePath}},manager),/路徑/);
  const baseline=structuredClone(before);baseline.files=[before.files[0]];
  const attached=applyCommand(baseline,{type:'file.thumbnail',payload:{id:'c',fileId:'old',storagePath:before.files[0].storagePath,thumbnailPath:before.files[0].storagePath+'_thumb.jpg'}},manager);
  const normalized=structuredClone(attached);normalized.revision=baseline.revision;delete normalized.files[0].thumbnailPath;assert.deepEqual(normalized,baseline);
  console.log('PASS: 4 found / 2 built / 1 skipped / 1 failed; rerun creates no objects; resume reuses upload; concurrent notes and originals preserved; only thumbnailPath + revision change.');
}finally{globalThis.document=oldDocument;globalThis.createImageBitmap=oldBitmap;}
