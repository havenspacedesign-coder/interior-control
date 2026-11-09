import {initialState,applyCommand,assertManager} from './model.js';
export const EMULATOR_PROJECT='demo-haven-ai';
export const COLLECTIONS={categories:'aiDbTestCategories',cases:'aiDbTestCases',files:'aiDbTestFiles',knowledge:'aiDbTestKnowledge',analysisRuns:'aiDbTestAnalysisRuns',questions:'aiDbTestQuestions',answerRevisions:'aiDbTestAnswerRevisions'};
const productionCollections={
  categories:'aiDbCategories',cases:'aiDbCases',files:'aiDbFiles',
  knowledge:'aiDbKnowledge',analysisRuns:'aiDbAnalysisRuns',questions:'aiDbQuestions',
  answerRevisions:'aiDbAnswerRevisions',
};

export function createProductionStore({db,auth,storage,fs,storageSdk}){
  return createFirebaseStore({
    db,auth,storage,fs,storageSdk,collections:productionCollections,
    metaCollection:'aiDbMeta',prefix:'aiDatabase',
    mode:'production',label:'公司 AI 資料庫｜限管理員存取',
  });
}

export async function createEmulatorStore(options={}){
  const testLocation=options.location||location;
  if(!['127.0.0.1','localhost'].includes(testLocation.hostname))throw Error('AI 資料庫測試連線只允許本機模擬器。');
  const account=new URL(testLocation.href).searchParams.get('aiTestUser')||'admin-a';
  if(!['admin-a','admin-b','staff','resigned'].includes(account))throw Error('不支援的模擬器測試帳號。');
  const [appSdk,fs,authSdk,storageSdk]=options.sdk||await Promise.all([
    import('https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/11.9.0/firebase-storage.js')
  ]);
  const app=appSdk.initializeApp({projectId:EMULATOR_PROJECT,apiKey:'emulator-only',storageBucket:EMULATOR_PROJECT+'.appspot.com'},'ai-database-emulator-'+account);
  const db=fs.getFirestore(app),auth=authSdk.getAuth(app),storage=storageSdk.getStorage(app);
  fs.connectFirestoreEmulator(db,'127.0.0.1',8181);authSdk.connectAuthEmulator(auth,'http://127.0.0.1:9199',{disableWarnings:true});storageSdk.connectStorageEmulator(storage,'127.0.0.1',9299);
  try{await authSdk.signInWithEmailAndPassword(auth,account+'@ai-test.local','EmulatorOnly123!');}
  catch{throw Error('無法登入 AI 測試模擬器。請依 README 啟動模擬器並建立測試帳號；不會改連正式 Firebase。');}
  const store=createFirebaseStore({
    db,auth,storage,fs,storageSdk,collections:COLLECTIONS,
    metaCollection:'aiDbTestMeta',prefix:'aiDatabaseTest',
    mode:'emulator',label:'Firebase 隔離測試資料庫：'+account+'；不會讀寫正式業務資料。',
    close:()=>appSdk.deleteApp(app),
  });
  try{await store.identity();return store;}
  catch(error){await store.close();throw error;}
}

function createFirebaseStore({db,auth,storage,fs,storageSdk,collections,metaCollection,prefix,mode,label,close}){
  const meta=fs.doc(db,metaCollection,'state');
  async function identity(){
    const uid=auth.currentUser?.uid;
    if(!uid)assertManager(null);
    const snapshot=await fs.getDocFromServer(fs.doc(db,'members',uid));
    if(auth.currentUser?.uid!==uid)assertManager(null);
    const member=snapshot.data();
    const user={...member,uid,status:member?.status??'active'};
    assertManager(user);
    return user;
  }
  function filePath(caseId,fileId){
    return prefix+'/cases/'+caseId+'/'+fileId;
  }
  function fileRef(path){
    const parts=typeof path==='string'?path.split('/'):[];
    if(parts.length!==4||parts[0]!==prefix||parts[1]!=='cases'
      ||parts.slice(2).some(id=>!id||id==='.'||id==='..'))throw Error('AI 檔案路徑不正確。');
    return storageSdk.ref(storage,path);
  }
  async function load(){
    await identity();
    for(let attempt=0;attempt<3;attempt++){
      const before=await fs.getDocFromServer(meta);if(!before.exists())return initialState();
      const state={...initialState(),revision:before.data().revision,cleanupPaths:before.data().cleanupPaths||[]};
      await Promise.all(Object.entries(collections).map(async([key,name])=>{const result=await fs.getDocsFromServer(fs.collection(db,name));state[key]=result.docs.map(doc=>{const {serverUpdatedAt,...data}=doc.data();return data;});}));
      const after=await fs.getDocFromServer(meta);if(after.data()?.revision===state.revision)return state;
    }throw Error('其他管理員正在更新資料，請稍後再試。');
  }
  return {
    mode,label,load,filePath,identity,
    async commit(command,expectedRevision){
      const user=await identity(),before=await load();if(before.revision!==expectedRevision)throw Error('資料已由其他管理員修改，請重新載入後再儲存。');
      const next=applyCommand(before,command,user);
      await fs.runTransaction(db,async tx=>{
        const snapshot=await tx.get(meta);if((snapshot.data()?.revision||0)!==expectedRevision)throw Error('資料已由其他管理員修改，請重新載入後再儲存。');
        for(const [key,name] of Object.entries(collections)){
          const old=new Map(before[key].map(row=>[row.id,row])),fresh=new Map(next[key].map(row=>[row.id,row]));
          for(const row of next[key])if(!snapshot.exists()||JSON.stringify(old.get(row.id))!==JSON.stringify(row))tx.set(fs.doc(db,name,row.id),{...row,serverUpdatedAt:fs.serverTimestamp()});
          for(const row of before[key])if(!fresh.has(row.id))tx.delete(fs.doc(db,name,row.id));
        }
        tx.set(meta,{schemaVersion:1,revision:next.revision,cleanupPaths:next.cleanupPaths,updatedBy:user.uid,updatedAt:fs.serverTimestamp()});
      });return next;
    },
    async putBlob(path,blob,mime){await identity();await storageSdk.uploadBytes(fileRef(path),blob,{contentType:mime});},
    async getBlob(path){await identity();return storageSdk.getBlob(fileRef(path));},
    async deleteBlob(path){await identity();try{await storageSdk.deleteObject(fileRef(path));}catch(e){if(e.code!=='storage/object-not-found')throw e;}},
    subscribe(callback){return fs.onSnapshot(meta,()=>callback(),()=>callback());},
    close,
  };
}
