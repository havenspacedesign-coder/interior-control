import {DOCUMENT_TYPES,RULE_LIMITS} from './analysis-rule-model.js';
import {newId} from './model.js';
import {date,esc} from './ui-utils.js';

const changes={created:'建立',edited:'編輯',enabled:'啟用',disabled:'停用',ordered:'調整排序',deleted:'刪除'};
const scope=rule=>rule.documentTypes.map(type=>DOCUMENT_TYPES[type]).join('、');
const time=value=>date(value?.toDate?.()??value);
const button=(action,label,attributes='')=>`<button type="button" class="btn btn-sm${action==='confirm-delete'?' btn-danger':''}" data-rule-action="${action}" ${attributes}>${label}</button>`;
const selected=rule=>rule.archived?'已刪除':rule.enabled?'已啟用':'已停用';

function listItem(rule,index,rows){
  return `<li class="aidb-rule-card" data-rule-id="${esc(rule.id)}">
    <div class="aidb-rule-heading"><strong>${esc(rule.name)}</strong><span>${selected(rule)}</span></div>
    <p class="aidb-muted">${esc(scope(rule))} · 第 ${esc(rule.version)} 版</p><p class="aidb-rule-content">${esc(rule.content)}</p>
    <div class="aidb-rule-actions">
      ${rule.archived?'':[
        button('edit','編輯'),button('toggle',rule.enabled?'停用':'啟用'),
        button('up','上移',index===0?'disabled':''),button('down','下移',index===rows.length-1?'disabled':''),
        button('delete','刪除'),
      ].join('')}
      ${button('history','版本紀錄')}
    </div>
  </li>`;
}

function editor(rule){
  const types=rule?.documentTypes??['all'];
  return `<form data-rule-editor>
    <label>規則名稱<input name="name" maxlength="${RULE_LIMITS.name}" value="${esc(rule?.name)}" required></label>
    <fieldset><legend>適用文件</legend><div class="aidb-rule-documents">
      ${Object.entries(DOCUMENT_TYPES).map(([key,label])=>`<label><input type="checkbox" name="documents" value="${key}" ${types.includes(key)?'checked':''}>${label}</label>`).join('')}
    </div></fieldset>
    <label>規則內容<textarea name="content" maxlength="${RULE_LIMITS.content}" rows="6" required>${esc(rule?.content)}</textarea></label>
    ${rule?'':'<label class="aidb-rule-check"><input type="checkbox" name="enabled" checked>建立後啟用</label>'}
    <div class="aidb-rule-actions">${button('back','取消')}<button class="btn btn-p" type="submit">儲存</button></div>
  </form>`;
}

export function openAnalysisRules(root,category,store,canManage,onClose){
  if(!store||!canManage())return null;
  const doc=root.ownerDocument;
  if(!doc.querySelector('[data-ai-rule-style]')){
    const link=doc.createElement('link');
    link.rel='stylesheet';
    link.href=new URL('./analysis-rules.css',import.meta.url);
    link.dataset.aiRuleStyle='';
    doc.head.append(link);
  }
  const dialog=doc.createElement('dialog');
  dialog.className='aidb-dialog aidb-rule-dialog';
  dialog.setAttribute('aria-labelledby','aidb-rules-title');
  dialog.innerHTML=`<header class="aidb-rule-heading">
    <h2 id="aidb-rules-title">${esc(category.name)} · AI 分析規則</h2>${button('close','關閉')}
  </header><div data-rule-body></div><p data-rule-feedback role="alert" hidden></p>`;
  root.append(dialog);
  const body=dialog.querySelector('[data-rule-body]'),feedback=dialog.querySelector('[data-rule-feedback]');
  let rules=null,page='list',current=null,versions=[],busy=false,closed=false,dirty=false;
  const active=()=>rules?.filter(rule=>!rule.archived)??[];
  const allowed=()=>!closed&&canManage();
  function message(text){
    feedback.textContent=text;
    feedback.hidden=!text;
  }
  function render(focus){
    if(!allowed())return;
    const live=active(),archived=rules?.filter(rule=>rule.archived)??[];
    if(page==='edit')body.innerHTML=editor(current);
    else if(page==='delete'){
      body.innerHTML=`<h3>刪除規則</h3><p>確定刪除「${esc(current.name)}」？刪除後仍可查看版本紀錄。</p>
        <div class="aidb-rule-actions">${button('back','取消')}${button('confirm-delete','確認刪除')}</div>`;
    }else if(page==='history'){
      body.innerHTML=`<h3>${esc(current.name)} · 版本紀錄</h3>${button('back','返回規則清單')}
        <ol class="aidb-rule-list">${versions.map(rule=>`<li class="aidb-rule-card">
        <strong>第 ${esc(rule.version)} 版 · ${esc(changes[rule.change])} · ${esc(rule.name)}</strong>
        <p class="aidb-muted">${esc(time(rule.updatedAt))} · ${selected(rule)} · ${esc(scope(rule))}</p>
        <p class="aidb-rule-content">${esc(rule.content)}</p></li>`).join('')}</ol>`;
    }else{
      body.innerHTML=rules?`<div class="aidb-rule-actions">${button('create','＋新增規則')}${button('reload','重新載入')}</div>
        ${live.length?`<ol class="aidb-rule-list">${live.map(listItem).join('')}</ol>`:'<p class="aidb-muted">尚未新增規則。</p>'}
        ${archived.length?`<details><summary>已刪除規則（${archived.length}）</summary><ol class="aidb-rule-list">${archived.map(listItem).join('')}</ol></details>`:''}`
        :`<p class="aidb-muted">尚未載入 AI 分析規則。</p>${button('reload','重新載入')}`;
    }
    (focus?body.querySelector(focus):null)?.focus();
  }
  function dispose(){
    if(closed)return;
    closed=true;
    dialog.remove();
    onClose?.();
  }
  function close(){
    if(busy||(dirty&&!doc.defaultView.confirm('規則尚未儲存，確定關閉嗎？')))return false;
    dispose();
    return true;
  }
  async function run(work,after){
    if(busy||!allowed())return;
    busy=true;
    const controls=[...dialog.querySelectorAll('button,input,textarea')].filter(node=>!node.disabled);
    for(const node of controls)node.disabled=true;
    dialog.setAttribute('aria-busy','true');
    message('');
    try{
      const result=await work();
      if(allowed())after?.(result);
    }catch(error){
      if(allowed())message(error.code==='permission-denied'?'無法存取 AI 分析規則。請確認已套用規則權限設定。':error.message);
    }finally{
      busy=false;
      dialog.removeAttribute('aria-busy');
      for(const node of controls)node.disabled=false;
    }
  }
  const reload=()=>run(()=>store.list(category.id),value=>{rules=value;render();});
  function save(command){
    return run(async()=>{
      await store.save(category.id,command);
      dirty=false;
      page='list';
      rules=null;
      const updated=await store.list(category.id);
      return updated;
    },value=>{rules=value;render('[data-rule-action="create"]');}).then(()=>{
      if(allowed()&&page==='list'&&!rules)render();
    });
  }
  dialog.addEventListener('input',event=>{if(event.target.closest('[data-rule-editor]'))dirty=true;});
  dialog.addEventListener('change',event=>{
    const target=event.target;
    if(target.name!=='documents'||!target.checked)return;
    for(const input of target.form.elements.documents){
      if(input!==target&&(target.value==='all'||input.value==='all'))input.checked=false;
    }
  });
  dialog.addEventListener('submit',event=>{
    event.preventDefault();
    if(page!=='edit'||busy||!allowed())return;
    const data=new FormData(event.target);
    void save({type:current?'edit':'create',id:current?.id??newId(),version:current?.version,fields:{
      name:data.get('name'),content:data.get('content'),documentTypes:data.getAll('documents'),enabled:data.has('enabled'),
    }});
  });
  dialog.addEventListener('click',event=>{
    const control=event.target.closest('[data-rule-action]');
    if(!control||busy||!allowed())return;
    const action=control.dataset.ruleAction;
    if(action==='close'){close();return;}
    if(action==='reload'){void reload();return;}
    if(action==='back'){
      if(dirty&&!doc.defaultView.confirm('規則尚未儲存，確定取消嗎？'))return;
      dirty=false;page='list';message('');render('[data-rule-action="create"]');return;
    }
    if(action==='create'){page='edit';current=null;message('');render('[name="name"]');return;}
    if(action==='confirm-delete'){void save({type:'delete',id:current.id,version:current.version});return;}
    const rule=rules?.find(row=>row.id===control.closest('[data-rule-id]')?.dataset.ruleId);
    if(!rule)return;
    if(action==='history'){
      void run(()=>store.history(category.id,rule.id),value=>{current=rule;versions=value;page='history';render('[data-rule-action="back"]');});
      return;
    }
    if(rule.archived)return;
    if(action==='edit'||action==='delete'){page=action;current=rule;message('');render(action==='edit'?'[name="name"]':'[data-rule-action="back"]');return;}
    if(action==='toggle'){void save({type:action,id:rule.id,version:rule.version});return;}
    if(action==='up'||action==='down'){
      const rows=active(),neighbor=rows[rows.indexOf(rule)+(action==='up'?-1:1)];
      if(neighbor)void save({type:'move',id:rule.id,version:rule.version,neighborId:neighbor.id,neighborVersion:neighbor.version});
    }
  });
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('close',dispose,{once:true});
  render();
  dialog.showModal();
  void reload();
  return {dispose,close,isDirty:()=>dirty||busy};
}
