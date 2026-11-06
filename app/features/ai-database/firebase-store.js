import {initialState,applyCommand,assertManager} from './model.js';
// Strictly emulator-only in phase one. No production configuration is accepted.
export const EMULATOR_PROJECT='demo-haven-ai';
export const COLLECTIONS={categories:'aiDbTestCategories',cases:'aiDbTestCases',files:'aiDbTestFiles',knowledge:'aiDbTestKnowledge',analysisRuns:'aiDbTestAnalysisRuns',questions:'aiDbTestQuestions',answerRevisions:'aiDbTestAnswerRevisions'};
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
  const identity=async()=>{if(!auth.currentUser)assertManager(null);const member=await fs.getDoc(fs.doc(db,'members',auth.currentUser.uid));const value={uid:auth.currentUser.uid,...member.data()};assertManager(value);return value;};
  await identity();
  const meta=fs.doc(db,'aiDbTestMeta','state');
  async function load(){
    await identity();
    for(let attempt=0;attempt<3;attempt++){
      const before=await fs.getDoc(meta);if(!before.exists())return initialState();
      const state={...initialState(),revision:before.data().revision,cleanupPaths:before.data().cleanupPaths||[]};
      await Promise.all(Object.entries(COLLECTIONS).map(async([key,name])=>{const result=await fs.getDocs(fs.collection(db,name));state[key]=result.docs.map(doc=>{const {serverUpdatedAt,...data}=doc.data();return data;});}));
      const after=await fs.getDoc(meta);if(after.data()?.revision===state.revision)return state;
    }throw Error('其他管理員正在更新資料，請稍後再試。');
  }
  return {
    mode:'emulator',label:'Firebase 隔離測試資料庫：'+account+'；不會讀寫正式業務資料。',load,
    async commit(command,expectedRevision){
      const user=await identity(),before=await load();if(before.revision!==expectedRevision)throw Error('資料已由其他管理員修改，請重新載入後再儲存。');
      const next=applyCommand(before,command,user);
      await fs.runTransaction(db,async tx=>{
        const snapshot=await tx.get(meta);if((snapshot.data()?.revision||0)!==expectedRevision)throw Error('資料已由其他管理員修改，請重新載入後再儲存。');
        for(const [key,name] of Object.entries(COLLECTIONS)){
          const old=new Map(before[key].map(row=>[row.id,row])),fresh=new Map(next[key].map(row=>[row.id,row]));
          for(const row of next[key])if(!snapshot.exists()||JSON.stringify(old.get(row.id))!==JSON.stringify(row))tx.set(fs.doc(db,name,row.id),{...row,serverUpdatedAt:fs.serverTimestamp()});
          for(const row of before[key])if(!fresh.has(row.id))tx.delete(fs.doc(db,name,row.id));
        }
        tx.set(meta,{schemaVersion:1,revision:next.revision,cleanupPaths:next.cleanupPaths,updatedBy:user.uid,updatedAt:fs.serverTimestamp()});
      });return next;
    },
    async putBlob(path,blob,mime){await identity();await storageSdk.uploadBytes(storageSdk.ref(storage,path),blob,{contentType:mime});},
    async getBlob(path){await identity();return storageSdk.getBlob(storageSdk.ref(storage,path));},
    async deleteBlob(path){await identity();try{await storageSdk.deleteObject(storageSdk.ref(storage,path));}catch(e){if(e.code!=='storage/object-not-found')throw e;}},
    subscribe(callback){return fs.onSnapshot(meta,()=>callback(),()=>callback());},
    async close(){await appSdk.deleteApp(app);}
  };
}
