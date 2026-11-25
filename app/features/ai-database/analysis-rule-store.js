import {analysisRuleChanges,assertRuleManager,ruleId,sortAnalysisRules} from './analysis-rule-model.js';
import {initialState} from './model.js';

export function createFirestoreAnalysisRules({db,auth,fs,identity,categories}){
  const category=id=>[categories,ruleId(id)];
  const config=id=>[...category(id),'analysisRuleConfig','current'];
  const rules=id=>[...config(id),'rules'];
  async function manager(){
    const user=await identity();
    assertRuleManager(user);
    return user;
  }
  function checkUser(user){
    assertRuleManager(auth.currentUser?.uid===user.uid?user:null);
  }
  return {
    async list(categoryId){
      const user=await manager();
      const parent=await fs.getDocFromServer(fs.doc(db,...category(categoryId)));
      if(!parent.exists())throw Error('分類尚未儲存或已刪除，無法開啟規則。');
      const result=await fs.getDocsFromServer(fs.collection(db,...rules(categoryId)));
      checkUser(user);
      return sortAnalysisRules(result.docs.map(snapshot=>snapshot.data()));
    },
    async history(categoryId,id){
      const user=await manager();
      const result=await fs.getDocsFromServer(fs.collection(db,...rules(categoryId),ruleId(id),'versions'));
      checkUser(user);
      return result.docs.map(snapshot=>snapshot.data()).sort((a,b)=>b.version-a.version);
    },
    async save(categoryId,command){
      const user=await manager();
      const parent=fs.doc(db,...category(categoryId));
      const counter=fs.doc(db,...config(categoryId));
      const ref=fs.doc(db,...rules(categoryId),ruleId(command.id));
      await fs.runTransaction(db,async tx=>{
        const [parentSnapshot,head,neighbor,counterSnapshot]=await Promise.all([
          tx.get(parent),tx.get(ref),
          command.type==='move'?tx.get(fs.doc(db,...rules(categoryId),ruleId(command.neighborId))):null,
          command.type==='create'?tx.get(counter):null,
        ]);
        checkUser(user);
        if(!parentSnapshot.exists())throw Error('分類尚未儲存或已刪除，無法儲存規則。');
        const nextOrder=counterSnapshot?.data()?.nextOrder??0;
        const updates=analysisRuleChanges(command,head.data(),neighbor?.data(),nextOrder,fs.serverTimestamp(),user);
        for(const row of updates){
          const path=[...rules(categoryId),row.id];
          tx.set(fs.doc(db,...path),row);
          tx.set(fs.doc(db,...path,'versions',row.revisionId),row);
        }
        if(command.type==='create')tx.set(counter,{nextOrder:nextOrder+1});
      });
      checkUser(user);
    },
  };
}

export function createLocalAnalysisRules(db,identity){
  function access(categoryId,write){
    assertRuleManager(identity());
    const transaction=db.transaction('state',write?'readwrite':'readonly');
    const store=transaction.objectStore('state');
    return {transaction,store,key:'analysis-rules:'+ruleId(categoryId)};
  }
  function useCategory(categoryId,operation,write=false){
    const {transaction,store,key}=access(categoryId,write);
    return new Promise((resolve,reject)=>{
      let result,failure;
      const categoryRequest=store.get('main');
      const request=store.get(key);
      request.onsuccess=()=>{
        try{
          const user=identity();
          assertRuleManager(user);
          if(!(categoryRequest.result??initialState()).categories.some(row=>row.id===categoryId)){
            throw Error('分類已刪除，無法開啟規則。');
          }
          const state=request.result??{nextOrder:0,rules:new Map(),versions:new Map()};
          result=operation(state,user);
          if(write)store.put(state,key);
        }catch(error){failure=error;transaction.abort();}
      };
      transaction.oncomplete=()=>resolve(result);
      transaction.onabort=()=>reject(failure??transaction.error??Error('規則儲存失敗。'));
    });
  }
  return {
    async list(categoryId){return useCategory(categoryId,state=>sortAnalysisRules(state.rules.values()));},
    async history(categoryId,id){return useCategory(categoryId,state=>[...(state.versions.get(ruleId(id))??[])].reverse());},
    async save(categoryId,command){
      return useCategory(categoryId,(state,user)=>{
        const id=ruleId(command.id);
        const neighbor=command.type==='move'?state.rules.get(ruleId(command.neighborId)):null;
        const rows=analysisRuleChanges(command,state.rules.get(id),neighbor,
          state.nextOrder,new Date().toISOString(),user);
        for(const row of rows){
          state.rules.set(row.id,row);
          state.versions.set(row.id,[...(state.versions.get(row.id)??[]),row]);
        }
        if(command.type==='create')state.nextOrder++;
      },true);
    },
  };
}
