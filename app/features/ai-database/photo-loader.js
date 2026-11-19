// One bounded queue survives re-renders; matching in-flight reads share a promise.
export function createPhotoLoader(getBlob,limit=8){
  const cache=new Map(),pending=new Map(),queue=[];
  let active=0,disposed=false;
  const stopped=()=>Object.assign(Error('照片載入已取消。'),{code:'aidb/cancelled'});
  function pump(){
    while(!disposed&&active<limit&&queue.length){
      const job=queue.shift();active++;
      (async()=>{
        try{
          if(!job.isCurrent())throw stopped();
          let blob;
          try{blob=await job.getBlob(job.path);}
          catch(error){
            if(job.file.thumbnailPath&&error.code==='storage/object-not-found'){
              if(disposed||!job.isCurrent())throw stopped();
              blob=await job.getBlob(job.file.storagePath);
            }else throw error;
          }
          if(disposed)throw stopped();
          const url=URL.createObjectURL(blob);cache.set(job.path,url);job.resolve(url);
        }catch(error){job.reject(error);}
        finally{pending.delete(job.path);active--;pump();}
      })();
    }
  }
  return {
    load(file,isCurrent=()=>true,readBlob=getBlob){
      if(disposed)return Promise.reject(stopped());
      const path=file.thumbnailPath||file.storagePath;
      if(cache.has(path))return Promise.resolve(cache.get(path));
      // Keep the latest view's validity check when it reuses an older queued read.
      if(pending.has(path)){const job=pending.get(path);job.isCurrent=isCurrent;return job.promise;}
      const job={file,path,isCurrent,getBlob:readBlob};
      job.promise=new Promise((resolve,reject)=>Object.assign(job,{resolve,reject}));
      pending.set(path,job);queue.push(job);pump();return job.promise;
    },
    prune(files){
      const live=new Set(files.map(file=>file.thumbnailPath||file.storagePath));
      for(const [path,url] of cache)if(!live.has(path)){URL.revokeObjectURL(url);cache.delete(path);}
    },
    dispose(){
      disposed=true;
      for(const job of queue.splice(0)){pending.delete(job.path);job.reject(stopped());}
      for(const url of cache.values())URL.revokeObjectURL(url);
      cache.clear();
    },
  };
}
