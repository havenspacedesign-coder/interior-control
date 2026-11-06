import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
const projectId='demo-haven-ai';
const environment=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8181}});
try{
  for(const [name,role,status] of [['admin-a','manager','active'],['admin-b','admin','active'],['staff','staff','active'],['resigned','manager','resigned']]){
    const body=JSON.stringify({email:name+'@ai-test.local',password:'EmulatorOnly123!',returnSecureToken:true});
    let result=await (await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-only',{method:'POST',headers:{'Content-Type':'application/json'},body})).json();
    if(result.error?.message==='EMAIL_EXISTS')result=await (await fetch('http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only',{method:'POST',headers:{'Content-Type':'application/json'},body})).json();
    if(!result.localId)throw Error(JSON.stringify(result));
    await environment.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'members',result.localId),{uid:result.localId,name,role,status}));
  }
  console.log('Created/updated four isolated emulator accounts; existing AI cases/files were preserved.');
}finally{await environment.cleanup();}
