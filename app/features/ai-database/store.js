import {initialState,applyCommand,assertManager} from './model.js';
// Local preview persists original Blob data, never a temporary object URL.
export async function createLocalStore(identity){
  const request=indexedDB.open('havenAiDatabaseTestV1',1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('state');request.result.createObjectStore('blobs');};
  const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('haven-ai-database-test'):null;
  function access(){assertManager(identity());}
  function read(store,key){access();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  function writeBlob(path,blob){access();return new Promise((resolve,reject)=>{const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(blob,path);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('檔案無法保存，請檢查瀏覽器剩餘空間。'));tx.onerror=()=>{};});}
  const store={
    mode:'local',label:'本機預覽：資料與檔案保存在此瀏覽器；尚未連接管理員共用資料庫。',
    async load(){return await read('state','main')||initialState();},
    async commit(command,expectedRevision){
      access();return new Promise((resolve,reject)=>{
        const tx=db.transaction('state','readwrite'),os=tx.objectStore('state'),r=os.get('main');let next,failure;
        r.onsuccess=()=>{try{const current=r.result||initialState();if(current.revision!==expectedRevision)throw Error('資料已由其他視窗修改，請重新載入後再儲存。');next=applyCommand(current,command,identity());os.put(next,'main');}catch(error){failure=error;tx.abort();}};
        tx.oncomplete=()=>{channel?.postMessage('changed');resolve(next);};tx.onabort=()=>reject(failure||tx.error||Error('資料保存失敗。'));tx.onerror=()=>{};
      });
    },
    putBlob:writeBlob,
    async getBlob(path){const blob=await read('blobs',path);if(!blob)throw Error('找不到原始檔案。');return blob;},
    async deleteBlob(path){access();return new Promise((resolve,reject)=>{const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').delete(path);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});},
    subscribe(callback){if(channel)channel.onmessage=callback;return()=>{if(channel)channel.onmessage=null;};},
    close(){channel?.close();db.close();}
  };return store;
}
