export const HOUSE_TYPES=['新成屋','中古屋','老屋翻新','預售屋客變','其他'];
export const SCOPES=['玄關','客廳','餐廳','廚房','主臥','次臥','書房','浴室','陽台','其他'];
export const FILE_TYPES={quote:'正式報價單 PDF',drawing:'施工圖 PDF',change:'追加減工程 PDF',photo:'完工照片'};
export const clone=value=>structuredClone(value);
export const newId=()=>crypto.randomUUID();
export function initialState(){return {schemaVersion:1,revision:0,categories:[{id:'cases',name:'案件資料庫',moduleType:'cases',sortOrder:0}],cases:[],files:[],knowledge:[],analysisRuns:[],questions:[],answerRevisions:[],cleanupPaths:[]};}
export function assertManager(identity){if(!identity?.uid||!['manager','admin'].includes(identity.role)||identity.status!=='active'){const error=Error('沒有 AI 資料庫管理權限。');error.code='aidb/permission-denied';throw error;}}
export function caseFields(input){
  const name=String(input.name||'').trim();if(!name)throw Error('請輸入案件名稱。');if(name.length>120)throw Error('案件名稱不可超過 120 字。');
  function number(key,label){if(input[key]===''||input[key]==null)return null;const value=Number(input[key]);if(!Number.isFinite(value)||value<0)throw Error(label+'必須是零或正數。');return value;}
  const area=number('area','室內實際坪數'),amount=number('amount','工程總金額'),year=number('year','案件年份');
  if(year!==null&&(!Number.isInteger(year)||year<1900||year>2200))throw Error('請輸入有效的四位數年份。');
  const url=String(input.url||'').trim();if(url){let parsed;try{parsed=new URL(url);}catch{throw Error('官方網址格式不正確。');}if(!['http:','https:'].includes(parsed.protocol))throw Error('官方網址須以 https:// 或 http:// 開頭。');}
  if(input.houseType&&!HOUSE_TYPES.includes(input.houseType))throw Error('房屋類型不正確。');
  return {name,area,amount,year,houseType:input.houseType||'',scopes:[...new Set(input.scopes||[])].filter(x=>SCOPES.includes(x)),url,note:String(input.note||'')};
}
export function sorted(rows){return [...rows].sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));}
export function applyCommand(previous,command,user,now=new Date().toISOString()){
  assertManager(user);const state=clone(previous),p=command.payload||{},id=p.id;
  const category=()=>{const value=state.categories.find(x=>x.id===id);if(!value)throw Error('分類已不存在。');return value;};
  const project=()=>{const value=state.cases.find(x=>x.id===id);if(!value)throw Error('案件已不存在。');return value;};
  const stamp=value=>Object.assign(value,{updatedAt:now,updatedBy:user.uid});
  const touch=value=>{stamp(value);value.contentRevision=(value.contentRevision||0)+1;value.analysisState='not_enabled';};
  function discardCases(ids,keepGeneral){
    const removed=state.files.filter(f=>ids.includes(f.caseId));state.cleanupPaths.push(...removed.map(f=>f.storagePath));
    state.files=state.files.filter(f=>!ids.includes(f.caseId));state.cases=state.cases.filter(c=>!ids.includes(c.id));
    state.knowledge=state.knowledge.flatMap(k=>!ids.includes(k.caseId)?[k]:(keepGeneral&&k.scope==='company'&&k.confirmation==='confirmed'?[{...k,caseId:null,sourceCaseDeleted:true,sourceFiles:[],sourceCaseName:null}]:[]));
    const runIds=state.analysisRuns.filter(r=>ids.includes(r.caseId)).map(r=>r.id);
    state.analysisRuns=state.analysisRuns.filter(r=>!ids.includes(r.caseId));
    const questionIds=state.questions.filter(q=>ids.includes(q.caseId)||runIds.includes(q.runId)).map(q=>q.id);
    state.questions=state.questions.filter(q=>!questionIds.includes(q.id));state.answerRevisions=state.answerRevisions.filter(a=>!questionIds.includes(a.questionId));
  }
  switch(command.type){
    case 'category.create':{
      const name=String(p.name||'').trim();if(!name||name.length>80)throw Error('分類名稱需為 1～80 字。');
      if(state.categories.some(c=>c.id===id))throw Error('分類已存在。');
      state.categories.push(stamp({id,name,moduleType:'blank',sortOrder:state.categories.length}));break;
    }
    case 'category.restoreCases':if(!state.categories.some(c=>c.moduleType==='cases'))state.categories.push(stamp({id,name:'案件資料庫',moduleType:'cases',sortOrder:state.categories.length}));break;
    case 'category.rename':{const name=String(p.name||'').trim();if(!name||name.length>80)throw Error('分類名稱需為 1～80 字。');category().name=name;stamp(category());break;}
    case 'category.delete':{category();discardCases(state.cases.filter(c=>c.categoryId===id).map(c=>c.id),!!p.keepGeneral);state.categories=state.categories.filter(c=>c.id!==id);break;}
    case 'category.order':{
      if(p.ids.length!==state.categories.length||new Set(p.ids).size!==p.ids.length||p.ids.some(x=>!state.categories.some(c=>c.id===x)))throw Error('分類已變更，請重新排序。');
      p.ids.forEach((key,index)=>{state.categories.find(c=>c.id===key).sortOrder=index;});break;
    }
    case 'case.create':{
      const parent=state.categories.find(c=>c.id===p.categoryId);if(parent?.moduleType!=='cases')throw Error('此分類尚未建立案件內容模組。');
      if(state.cases.some(c=>c.id===id))throw Error('案件已存在。');
      state.cases.push(stamp({id,categoryId:p.categoryId,...caseFields(p.fields),sortOrder:state.cases.filter(c=>c.categoryId===p.categoryId).length,contentRevision:1,analysisState:'not_enabled',createdAt:now,createdBy:user.uid}));break;
    }
    case 'case.update':{const value=project();Object.assign(value,caseFields(p.fields));touch(value);break;}
    case 'case.delete':project();discardCases([id],!!p.keepGeneral);break;
    case 'case.order':{
      const rows=state.cases.filter(c=>c.categoryId===p.categoryId);
      if(p.ids.length!==rows.length||new Set(p.ids).size!==p.ids.length||p.ids.some(x=>!rows.some(c=>c.id===x)))throw Error('案件已變更，請重新排序。');
      p.ids.forEach((key,index)=>{state.cases.find(c=>c.id===key).sortOrder=index;});break;
    }
    case 'file.add':{
      project();if(!FILE_TYPES[p.file.kind]||p.file.caseId!==id||state.files.some(f=>f.id===p.file.id))throw Error('檔案資料不正確。');
      const replaced=state.files.filter(f=>f.caseId===id&&((p.file.kind!=='photo'&&f.kind===p.file.kind)||f.id===p.replaceId));
      state.cleanupPaths.push(...replaced.map(f=>f.storagePath));state.files=state.files.filter(f=>!replaced.includes(f));
      state.files.push({...p.file,uploadedAt:now,uploadedBy:user.uid});touch(project());break;
    }
    case 'file.caption':{const f=state.files.find(x=>x.id===p.fileId&&x.caseId===id);if(!f||f.kind!=='photo')throw Error('照片已不存在。');f.caption=String(p.caption||'');touch(project());break;}
    case 'file.delete':{project();const f=state.files.find(x=>x.id===p.fileId&&x.caseId===id);if(!f)throw Error('檔案已不存在。');state.cleanupPaths.push(f.storagePath);state.files=state.files.filter(x=>x.id!==f.id);touch(project());break;}
    case 'cleanup.done':state.cleanupPaths=state.cleanupPaths.filter(path=>!p.paths.includes(path));break;
    default:throw Error('不支援的操作。');
  }
  state.cleanupPaths=[...new Set(state.cleanupPaths)];state.revision++;return state;
}
