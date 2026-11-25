import {newId} from './model.js';

export const DOCUMENT_TYPES={all:'全部文件',quote:'正式報價單',drawing:'施工圖',change:'追加減工程'};
export const RULE_LIMITS={name:120,content:8000};
export const isRuleManager=user=>!!user?.uid&&user.role==='manager'&&user.status==='active';
export function assertRuleManager(user){
  if(!isRuleManager(user))throw Object.assign(Error('只有管理員可以查看及修改 AI 分析規則。'),{code:'aidb/rules-denied'});
}

export function ruleId(value){
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(value))throw Error('分類或規則識別碼不正確。');
  return value;
}

function fields(input){
  const name=typeof input?.name==='string'?input.name.trim():'';
  const content=typeof input?.content==='string'?input.content.trim():'';
  const documentTypes=Array.isArray(input?.documentTypes)?[...new Set(input.documentTypes)]:[];
  if(!name||name.length>RULE_LIMITS.name||/[\r\n]/u.test(name))throw Error('請輸入 1～120 字的單行規則名稱。');
  if(!content||content.length>RULE_LIMITS.content)throw Error('請輸入 1～8000 字的規則內容。');
  if(!documentTypes.length||documentTypes.some(type=>!Object.hasOwn(DOCUMENT_TYPES,type))||
    (documentTypes.includes('all')&&documentTypes.length!==1))throw Error('請選擇全部文件或至少一種指定文件。');
  if(typeof input.enabled!=='boolean')throw Error('規則啟用狀態不正確。');
  return {name,content,documentTypes,enabled:input.enabled};
}

export const sortAnalysisRules=rows=>[...rows].sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));

// The caller supplies one category's rules. Retain ordered immutable revision IDs
// with any future analysis that consumes these rules.
export function selectAnalysisRules(rules,documentTypes){
  const types=new Set(documentTypes);
  if(!types.size)return [];
  return sortAnalysisRules(rules.filter(rule=>!rule.archived&&rule.enabled&&
    rule.documentTypes.some(type=>type==='all'||types.has(type))));
}

export function analysisRuleChanges(command,current,neighbor,nextOrder,now,user){
  assertRuleManager(user);
  const {type,id,version,neighborId,neighborVersion}=command;
  ruleId(id);
  const revise=(previous,values,change)=>({...previous,...values,version:(previous.version??0)+1,
    revisionId:newId(),updatedAt:now,updatedBy:user.uid,change});
  if(type==='create'){
    if(current)throw Error('規則已存在，請重新載入。');
    return [revise({id,sortOrder:nextOrder,createdAt:now,createdBy:user.uid,archived:false},fields(command.fields),'created')];
  }
  const unchanged=(row,target,expected)=>row?.id===target&&!row.archived&&row.version===expected;
  if(!unchanged(current,id,version))throw Error('規則已變更或已刪除，請重新載入規則清單。');
  switch(type){
    case 'edit': return [revise(current,fields({...command.fields,enabled:current.enabled}),'edited')];
    case 'toggle': return [revise(current,{enabled:!current.enabled},current.enabled?'disabled':'enabled')];
    case 'delete': return [revise(current,{enabled:false,archived:true},'deleted')];
    case 'move':
      if(!unchanged(neighbor,neighborId,neighborVersion)||neighborId===id||current.sortOrder===neighbor.sortOrder){
        throw Error('規則排序已變更，請重新載入規則清單。');
      }
      return [revise(current,{sortOrder:neighbor.sortOrder},'ordered'),revise(neighbor,{sortOrder:current.sortOrder},'ordered')];
    default: throw Error('不支援的規則操作。');
  }
}
