// Runtime-composed source module. Keep declarations in shared application scope.
// ── Design ──
// 施工階段欄位要能完整容納「年／月／日／＋」同一行。
const DESIGN_STAGE_MIN_WIDTH=180;
function designColumnMinWidth(key){
  if(!String(key).startsWith('c'))return 60;
  const column=getDesignCols()[Number(String(key).slice(1))];
  return column?.kind==='text'&&/^(?:[1-9]|1\d|20)$/.test(String(column.name))?DESIGN_STAGE_MIN_WIDTH:60;
}
let designRowDragInProgress=false,designRowDragSrc=null,pendingDesignRender=false,designLastHScrollLeft=0;
function sortDesignProjs(projs){
  if(!designProjectOrder.length)return projs;
  const order=designProjectOrder;
  return[...projs].sort((a,b)=>{
    const ia=order.indexOf(a.id),ib=order.indexOf(b.id);
    const ra=ia<0?Infinity:ia,rb=ib<0?Infinity:ib;
    return ra-rb;
  });
}
function renderDesign(){
  if(designRowDragInProgress){pendingDesignRender=true;return;}
  const el=$('panel-design');
  const previousDesignScroll=$('design-scroll-wrap')?.scrollLeft;
  if(Number.isFinite(previousDesignScroll))designLastHScrollLeft=previousDesignScroll;
  const cols=getDesignCols();
  const blueCols=cols.filter(c=>c.collapsible);
  const redCols=cols.filter(c=>!c.collapsible);
  const noteCol=redCols.find(c=>c.kind==='note'||c.name==='備註')||null;
  const otherRedCols=redCols.filter(c=>c!==noteCol);
  const allProjs=sortDesignProjs(S.projects.filter(p=>['contact','design','cv'].includes(p.status)));
  const isOpen=designBlueColsGlobalOpen;
  const editing=designEditMode;
  function colW(key,fallback){return Math.max(designColumnMinWidth(key),Number(designColWidths[key])||fallback);}
  const visibleCols=[noteCol,...(blueCols.length&&isOpen?blueCols:[]),...otherRedCols].filter(Boolean);
  const designTableWidth=(editing?22:0)+colW('name',150)+colW('budget',90)+(blueCols.length?22:0)+visibleCols.reduce((sum,c)=>sum+colW('c'+cols.indexOf(c),150),0);
  const handle=(key)=>editing?`<span class="col-resize" onmousedown="startColResize(event,'${key}')"></span>`:'';
  const dragW=editing?22:0,nameW=colW('name',150),budgetW=colW('budget',90),toggleW=blueCols.length?38:0,noteW=noteCol?colW('c'+cols.indexOf(noteCol),150):0;
  const freeze=(left,width,extra='',name=false)=>`class="design-freeze${name?' design-freeze-name':''}" style="width:${width}px;left:${left}px;${extra}"`;
  const missingBlueCount=p=>blueCols.filter(c=>{const key=c.key||c.name,progress=p.designProgress||{},value=progress[key],customTags=progress[key+'__customTags'],hasCustomTags=Array.isArray(customTags)&&customTags.length>0;return Array.isArray(value)?value.length===0&&!hasCustomTags:!String(value||'').trim()&&!hasCustomTags;}).length;
  el.innerHTML=`
  <div class="flex-sb" style="margin-bottom:1rem;position:relative">
    <span style="font-size:14px;font-weight:500">設計進度 <span style="font-size:11px;font-weight:400;color:var(--text3);margin-left:8px">可打 # 連結施工寶典階段</span></span>
    ${isAdmin()?`<button class="btn btn-sm ${editing?'btn-p':''}" onclick="toggleDesignEditMode()">${editing?'✓ 編輯中':'✎ 編輯'}</button>`:''}
  </div>
  ${allProjs.length===0?`<div class="empty">尚無案件</div>`:`
  <div id="design-scroll-wrap" class="hide-hscrollbar" style="overflow-x:auto;max-width:100%">
  <table class="design-tbl" id="design-table" style="width:${designTableWidth}px;min-width:${designTableWidth}px">
    <thead><tr>
      ${editing?`<th ${freeze(0,22)}></th>`:''}
      <th ${freeze(dragW,nameW,'text-align:left;position:relative',true)}>案件名稱${handle('name')}</th>
      <th ${freeze(dragW+nameW,budgetW,'position:relative')}>預算${handle('budget')}</th>
      ${blueCols.length?`<th ${freeze(dragW+nameW+budgetW,toggleW,'cursor:pointer;color:var(--purple)')} onclick="toggleDesignBlueCols()" title="顯示/隱藏會議人員等欄位">${isOpen?'▼':'▶'}</th>`:''}
      ${noteCol?`<th ${freeze(dragW+nameW+budgetW+toggleW,noteW,'position:relative')}>${isAdmin()?`<input class="col-name-edit" value="${noteCol.name}" onblur="saveColName(${cols.indexOf(noteCol)},this.value)" onkeydown="if(event.key==='Enter')this.blur()">`:`<span>${noteCol.name}</span>`}${handle('c'+cols.indexOf(noteCol))}</th>`:''}
      ${blueCols.length&&isOpen?blueCols.map(c=>{const ci=cols.indexOf(c);return`<th style="width:${colW('c'+ci,150)}px;position:relative">
        ${isAdmin()?`<input class="col-name-edit" value="${c.name}" onblur="saveColName(${ci},this.value)" onkeydown="if(event.key==='Enter')this.blur()">`:`<span>${c.name}</span>`}${handle('c'+ci)}
      </th>`;}).join(''):''}
      ${otherRedCols.map(c=>{const ci=cols.indexOf(c);return`<th style="width:${colW('c'+ci,150)}px;position:relative">
        ${isAdmin()?`<input class="col-name-edit" value="${c.name}" onblur="saveColName(${ci},this.value)" onkeydown="if(event.key==='Enter')this.blur()">`:`<span>${c.name}</span>`}${handle('c'+ci)}
      </th>`;}).join('')}
    </tr></thead>
    <tbody>
    ${allProjs.map(p=>{
      return`<tr data-proj="${p.id}"${editing?` draggable="true" ondragstart="designRowDragStart(event,'${p.id}')" ondragover="designRowDragOver(event,'${p.id}')" ondrop="designRowDrop(event,'${p.id}')" ondragend="designRowDragEnd()"`:''}>
        ${editing?`<td ${freeze(0,22,'text-align:center;cursor:grab;color:var(--text3)')}>⠿</td>`:''}
        <td ${freeze(dragW,nameW,'text-align:left;white-space:nowrap',true)}>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span class="design-project-link" onclick="event.stopPropagation();showProjectDetail('${p.id}')" title="點擊查看案件詳細資料">${p.name}</span>
            <span class="badge" style="font-size:11px;background:${statusInfo(p.status).bg};color:${statusInfo(p.status).color};margin-left:auto;text-align:right">${statusInfo(p.status).l}</span>
          </div>
        </td>
        <td ${freeze(dragW+nameW,budgetW,'padding:6px 8px;font-size:12px')}>${escAttr(p.budget||'')}${p.budget?'萬':''}</td>
        ${blueCols.length?`<td ${freeze(dragW+nameW+budgetW,toggleW,'text-align:center')}>${missingBlueCount(p)?`<span class="design-missing-badge">${missingBlueCount(p)}</span>`:''}</td>`:''}
        ${noteCol?renderDesignCell(p,noteCol).replace('class="','class="design-freeze ').replace('">','" style="width:'+noteW+'px;left:'+(dragW+nameW+budgetW+toggleW)+'px">') : ''}
        ${blueCols.length&&isOpen?blueCols.map(c=>renderDesignCell(p,c)).join(''):''}
        ${otherRedCols.map(c=>renderDesignCell(p,c)).join('')}
      </tr>`;
    }).join('')}
    </tbody>
  </table>
  </div><div id="design-bottom-hscroll"><div style="width:${designTableWidth}px;height:1px"></div></div>`}`;
  requestAnimationFrame(function(){restoreDesignHScroll(designLastHScrollLeft);});
}
// Shift + mouse wheel scrolls the design table horizontally from anywhere
// on the design-progress screen, not only while hovering over the table.
document.addEventListener('wheel',function(e){
  if(activePanel!=='design'||!e.shiftKey)return;
  const wrap=$('design-scroll-wrap');
  if(!wrap||wrap.scrollWidth<=wrap.clientWidth)return;
  const delta=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;
  if(!delta)return;
  e.preventDefault();
  wrap.scrollLeft+=delta;
},{passive:false});
window.saveProjectBudget=async function(projId,val){
  await updateDoc(doc(db,'projects',projId),{budget:val});
}
window.openDesignColSettings=function(){
  if(!isAdmin())return;
  const cols=getDesignCols();
  $('mo-content').innerHTML=`
    <div class="mo-title">欄位設定</div>
    <div style="font-size:11px;color:var(--text2);margin:4px 0 10px">「成員標記」欄位只能選人員、不能自由打字；「收合」欄位平常收起來，要按「顯示標記欄位」才會展開</div>
    <div style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow-y:auto">
      ${cols.map((c,ci)=>`<div style="display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);padding-bottom:6px">
        <input type="text" value="${escAttr(c.name)}" onblur="saveColName(${ci},this.value)" onkeydown="if(event.key==='Enter')this.blur()" style="flex:1;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:inherit">
        <label style="font-size:12px;display:flex;align-items:center;gap:3px;white-space:nowrap"><input type="checkbox" ${c.kind==='member'?'checked':''} onchange="saveColKind(${ci},this.checked?'member':'text')">成員標記</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:3px;white-space:nowrap"><input type="checkbox" ${c.collapsible?'checked':''} onchange="saveColCollapsible(${ci},this.checked)">收合</label>
      </div>`).join('')}
    </div>
    <div class="mo-footer"><button class="btn" onclick="closeMo()">關閉</button></div>`;
  $('modal').style.display='flex';
}
function renderDesignCell(p,col){
  const dp=p.designProgress||{};
  const colKey=col.key||col.name;
  const val=dp[colKey]||'';
  if(col.kind==='member'){
    const memberIds=Array.isArray(val)?val:(val?[val]:[]);
    const selectedMembers=memberIds.map(uid=>S.members.find(x=>x.uid===uid)).filter(m=>m&&m.role!=='manager');
    const customTags=Array.isArray(dp[colKey+'__customTags'])?dp[colKey+'__customTags']:[];
    return`<td style="text-align:center">
      <div style="display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;padding:3px">
        ${selectedMembers.map(m=>`<span style="display:inline-flex;align-items:center;gap:4px;background:var(--pl);color:var(--pd);padding:3px 9px;border-radius:12px;font-size:12px">${memberDisplayName(m)}<span onclick="dcToggleMember('${p.id}','${colKey}','${m.uid}',false)" style="cursor:pointer;font-weight:700">×</span></span>`).join('')}
        ${customTags.map((tag,index)=>`<span style="display:inline-flex;align-items:center;gap:4px;background:#f1efe8;color:var(--text2);padding:3px 9px;border-radius:12px;font-size:12px">${escAttr(tag)}<span onclick="dcRemoveCustomTag('${p.id}','${colKey}',${index})" style="cursor:pointer;font-weight:700">×</span></span>`).join('')}
        <span class="task-tag-btn" aria-label="標記人員" title="標記人員" onclick="event.stopPropagation();dcOpenPicker(event,'${p.id}','${colKey}')" onmouseenter="dcOpenPicker(event,'${p.id}','${colKey}')" onmouseleave="dcScheduleClose('${p.id}','${colKey}')" style="width:20px;height:20px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;flex:0 0 20px;font-size:14px;line-height:1;color:var(--purple);cursor:pointer;border:1px dashed var(--purple);border-radius:50%;padding:0">+</span>
      </div>
      <div class="pn-mention-menu" id="dc-mention-${p.id}-${colKey}" style="display:none" onmouseenter="mCancelCloseMention()" onmouseleave="dcScheduleClose('${p.id}','${colKey}')"></div>
    </td>`;
  }
  if(col.kind==='note'){
    return`<td class="${!val.trim()?'empty-cell':''}">
      <input type="text" class="design-cell-input" id="dcell-${p.id}-${colKey}" value="${escAttr(val)}" placeholder="輸入備註" autocomplete="off"
        onblur="saveDesignField('${p.id}','${colKey}',this.value)"
        onkeydown="if(event.key==='Enter')this.blur()">
    </td>`;
  }
  const dateVal=dp[colKey+'__date']||'';
  const dparts=dateVal.split('-');
  const dy=dp[colKey+'__date_y']!==undefined?dp[colKey+'__date_y']:(dparts[0]||'');
  const dm=dp[colKey+'__date_m']!==undefined?dp[colKey+'__date_m']:(dparts[1]?parseInt(dparts[1],10):'');
  const dd=dp[colKey+'__date_d']!==undefined?dp[colKey+'__date_d']:(dparts[2]?parseInt(dparts[2],10):'');
  const dateRow=`<div style="display:flex;align-items:center;flex-wrap:nowrap;white-space:nowrap;gap:2px;font-size:10px;color:var(--text2);padding:3px 4px 0;min-width:172px;box-sizing:border-box;overflow:hidden">
    <input id="ddy-${p.id}-${colKey}" type="number" value="${dy}" onchange="saveDesignDate('${p.id}','${colKey}')" style="width:40px;flex:0 0 40px;box-sizing:border-box;padding:1px 2px;border:1px solid var(--border);border-radius:3px;font-size:10px">年
    <input id="ddm-${p.id}-${colKey}" type="number" min="1" max="12" value="${dm}" onchange="saveDesignDate('${p.id}','${colKey}')" style="width:28px;flex:0 0 28px;box-sizing:border-box;padding:1px 2px;border:1px solid var(--border);border-radius:3px;font-size:10px">月
    <input id="ddd-${p.id}-${colKey}" type="number" min="1" max="31" value="${dd}" onchange="saveDesignDate('${p.id}','${colKey}')" style="width:28px;flex:0 0 28px;box-sizing:border-box;padding:1px 2px;border:1px solid var(--border);border-radius:3px;font-size:10px">日
    <button type="button" onclick="addDesignStageLink('${p.id}','${colKey}')" title="新增同日施工寶典" aria-label="新增同日施工寶典" style="width:18px;height:18px;flex:0 0 18px;padding:0;border:1px solid rgba(120,120,120,.18);border-radius:4px;background:transparent;color:var(--text3);opacity:.62;font:inherit;font-size:13px;line-height:1;cursor:pointer">＋</button>
  </div>`;
  const savedLinks=Array.isArray(dp[colKey+'__stageLinks'])?dp[colKey+'__stageLinks']:(val?[val]:['']);
  const links=savedLinks.length?savedLinks:[''];
  const linkMarkup=links.map((link,index)=>{
    if(link.startsWith('#')&&getBibleStages().includes(link.slice(1))){const stage=link.slice(1),stored=S.checks[`${p.id}_${stage}`]||[],allItems=projectBibleItems(p,stage),remaining=allItems.length-allItems.filter((t,i)=>stored[i]?.done||stored[i]?.skip).length;return`<div style="padding:3px 4px 0;position:relative;min-height:28px"><span onclick="openCheckMo('${p.id}','${stage}','${stage}','${p.name}')" style="cursor:pointer;background:var(--pl);color:var(--pd);padding:3px 7px;border-radius:5px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:7px;max-width:100%;line-height:1.35"><span style="min-width:0;overflow-wrap:break-word;word-break:normal">#${displayStageName(stage)}${pendBadge(remaining)}</span><span onclick="event.stopPropagation();removeDesignStageLink('${p.id}','${colKey}',${index})" title="刪除標記" style="cursor:pointer;color:var(--text3);font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">×</span></span></div>`;}
    return`<div style="padding:3px 4px 0"><input type="text" class="design-cell-input" id="dcell-${p.id}-${colKey}-${index}" value="${escAttr(link)}" autocomplete="off" oninput="dcHashCheckLink(this,'${p.id}','${colKey}',${index})" onblur="saveDesignStageLink('${p.id}','${colKey}',${index},this.value)" onkeydown="if(event.key==='Enter')this.blur()"><div class="pn-mention-menu" id="dc-hash-link-${p.id}-${colKey}-${index}" style="display:none"></div></div>`;
  }).join('');
  return`<td class="${links.some(Boolean)?'':'empty-cell'}">${dateRow}${linkMarkup}</td>`;
}
window.saveDesignDate=async function(projId,colName){
  const yEl=$(`ddy-${projId}-${colName}`),mEl=$(`ddm-${projId}-${colName}`),dEl=$(`ddd-${projId}-${colName}`);
  const y=yEl?yEl.value.trim():'',m=mEl?mEl.value.trim():'',d=dEl?dEl.value.trim():'';
  const val=(y&&m&&d)?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
  const proj=S.projects.find(p=>p.id===projId);if(!proj)return;
  const dp={...(proj.designProgress||{}),[colName+'__date']:val,[colName+'__date_y']:y,[colName+'__date_m']:m,[colName+'__date_d']:d};
  proj.designProgress=dp;
  if(localTestMode){setSynced();return;}
  setSyncing();
  await updateDoc(doc(db,'projects',projId),{designProgress:dp});
  setSynced();
}
document.addEventListener('keyup',event=>{
  if(event.key!=='Shift'||event.ctrlKey||event.altKey||event.metaKey)return;
  const current=document.activeElement;
  if(!current||!current.id)return;
  let nextId='';
  if(current.id.startsWith('ddy-'))nextId=current.id.replace(/^ddy-/,'ddm-');
  else if(current.id.startsWith('ddm-'))nextId=current.id.replace(/^ddm-/,'ddd-');
  if(!nextId)return;
  const next=$(nextId);
  if(next){event.preventDefault();next.focus();next.select();}
});
window.toggleDesignBlueCols=function(){designBlueColsGlobalOpen=!designBlueColsGlobalOpen;renderDesign();}
window.toggleDesignProj=function(projId){expandedProjs[projId]=!expandedProjs[projId];renderDesign();}
window.toggleDesignFields=function(projId){expandedFields[projId]=!expandedFields[projId];renderDesign();}
window.saveDesignField=async function(projId,col,val){
  const proj=S.projects.find(p=>p.id===projId);if(!proj)return;
  const dp={...(proj.designProgress||{}),[col]:val};
  proj.designProgress=dp;
  if(localTestMode){setSynced();if(activePanel==='design')renderDesign();return;}
  setSyncing();
  await updateDoc(doc(db,'projects',projId),{designProgress:dp});
  setSynced();
}
function designStageLinks(proj,col){const dp=proj?.designProgress||{},legacy=dp[col]||'',stored=dp[col+'__stageLinks'];return Array.isArray(stored)?[...stored]:(legacy?[legacy]:['']);}
window.addDesignStageLink=async function(projId,col){const proj=S.projects.find(p=>p.id===projId);if(!proj)return;const links=designStageLinks(proj,col);links.push('');await saveDesignStageLinks(projId,col,links);};
window.saveDesignStageLink=async function(projId,col,index,value){const proj=S.projects.find(p=>p.id===projId);if(!proj)return;const links=designStageLinks(proj,col);links[index]=(value||'').trim();await saveDesignStageLinks(projId,col,links);};
window.removeDesignStageLink=async function(projId,col,index){const proj=S.projects.find(p=>p.id===projId),links=designStageLinks(proj,col);if(!proj||!confirm('確定刪除此施工寶典連結？'))return;links.splice(index,1);await saveDesignStageLinks(projId,col,links.length?links:['']);};
async function saveDesignStageLinks(projId,col,links){const proj=S.projects.find(p=>p.id===projId);if(!proj)return;const next=links.map(v=>String(v||'').trim()),dp={...(proj.designProgress||{}),[col]:next[0]||'',[col+'__stageLinks']:next};proj.designProgress=dp;if(localTestMode){setSynced();renderDesign();return;}setSyncing();await updateDoc(doc(db,'projects',projId),{designProgress:dp});setSynced();}
function refreshDesignColSettingsIfOpen(){
  if($('modal').style.display==='flex'&&$('mo-content').querySelector('.mo-title')?.textContent==='欄位設定')openDesignColSettings();
}
window.saveColName=async function(ci,val){
  if(!isAdmin())return;
  const cols=getDesignCols().map(c=>({...c}));cols[ci].name=val||`欄位${ci+1}`;
  setSyncing();await setDoc(doc(db,'settings','designCols'),{cols});setSynced();
  refreshDesignColSettingsIfOpen();
}
window.saveColKind=async function(ci,kind){
  if(!isAdmin())return;
  const cols=getDesignCols().map(c=>({...c}));cols[ci].kind=kind;
  setSyncing();await setDoc(doc(db,'settings','designCols'),{cols});setSynced();
  refreshDesignColSettingsIfOpen();
}
window.saveColCollapsible=async function(ci,val){
  if(!isAdmin())return;
  const cols=getDesignCols().map(c=>({...c}));cols[ci].collapsible=val;
  setSyncing();await setDoc(doc(db,'settings','designCols'),{cols});setSynced();
  refreshDesignColSettingsIfOpen();
}
window.addDesignCol=async function(){
  if(!isAdmin())return;
  const cols=getDesignCols().map(c=>({...c}));
  if(cols.length>=14)return alert('最多14個欄位');
  cols.push({name:`欄位${cols.length+1}`,kind:'text',collapsible:false});
  setSyncing();await setDoc(doc(db,'settings','designCols'),{cols});setSynced();
}
// Member-tag picker for 'member' kind design columns
window.dcOpenPicker=function(e,projId,colName){
  clearTimeout(mCloseTimer);
  const menuEl=document.getElementById('dc-mention-'+projId+'-'+colName);
  if(!menuEl)return;
  const rect=e.currentTarget.getBoundingClientRect();
  menuEl.style.cssText='display:block;position:fixed;top:0;left:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:9999;min-width:180px;max-height:220px;overflow-y:auto;padding:4px 0';
  dcRenderMemberPicker(projId,colName);
  const gap=4,edge=8;
  const menuRect=menuEl.getBoundingClientRect();
  const left=Math.max(edge,Math.min(rect.left,window.innerWidth-menuRect.width-edge));
  const below=rect.bottom+gap;
  const top=below+menuRect.height<=window.innerHeight-edge
    ?below
    :Math.max(edge,rect.top-menuRect.height-gap);
  menuEl.style.left=left+'px';
  menuEl.style.top=top+'px';
}
function dcRenderMemberPicker(projId,colName){
  const menuEl=document.getElementById('dc-mention-'+projId+'-'+colName);if(!menuEl)return;
  const proj=S.projects.find(p=>p.id===projId);if(!proj)return;
  const raw=(proj.designProgress||{})[colName]||'';
  const selected=Array.isArray(raw)?raw:(raw?[raw]:[]);
  menuEl.innerHTML=markableMembersList().map(function(m){
    const checked=selected.includes(m.uid);
    return'<label class="design-member-picker-row"><input type="checkbox" '+(checked?'checked':'')+' onchange="dcToggleMember(\''+projId+'\',\''+colName+'\',\''+m.uid+'\',this.checked)"><span>'+memberDisplayName(m)+'</span></label>';
  }).join('')+'<button type="button" class="design-member-picker-row" style="width:100%;border:0;border-top:1px solid var(--border);text-align:left;font:inherit;color:var(--purple);cursor:pointer" onmousedown="event.preventDefault();mCancelCloseMention()" onclick="dcShowCustomTagInput(\''+projId+'\',\''+colName+'\')">＋ 自訂標記</button>';
}
window.dcShowCustomTagInput=function(projId,colName){const menu=document.getElementById('dc-mention-'+projId+'-'+colName);if(!menu||menu.querySelector('.dc-custom-tag-input'))return;const row=document.createElement('div');row.className='dc-custom-tag-input';row.style.cssText='display:flex;gap:5px;padding:7px;border-top:1px solid var(--border)';row.innerHTML=`<input type="text" placeholder="輸入文字…" style="min-width:0;flex:1;padding:5px;border:1px solid var(--border);border-radius:4px;font:inherit"><button type="button" class="btn btn-sm btn-p">加入</button>`;const input=row.querySelector('input'),save=()=>{const value=input.value.trim();if(value)dcAddCustomTag(projId,colName,value);};row.querySelector('button').onclick=save;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save();}if(e.key==='Escape'){row.remove();}};menu.appendChild(row);input.focus();};
window.dcAddCustomTag=async function(projId,colName,value){const tag=String(value||'').trim(),proj=S.projects.find(p=>p.id===projId);if(!proj||!tag)return;const key=colName+'__customTags',tags=Array.isArray(proj.designProgress?.[key])?[...proj.designProgress[key]]:[];if(tags.includes(tag))return;const dp={...(proj.designProgress||{}),[key]:[...tags,tag]};proj.designProgress=dp;if(localTestMode){setSynced();renderDesign();return;}setSyncing();await updateDoc(doc(db,'projects',projId),{designProgress:dp});setSynced();renderDesign();}
window.dcRemoveCustomTag=async function(projId,colName,index){const proj=S.projects.find(p=>p.id===projId);if(!proj)return;const key=colName+'__customTags',tags=Array.isArray(proj.designProgress?.[key])?[...proj.designProgress[key]]:[];if(index<0||index>=tags.length)return;tags.splice(index,1);const dp={...(proj.designProgress||{}),[key]:tags};proj.designProgress=dp;if(localTestMode){setSynced();renderDesign();return;}setSyncing();await updateDoc(doc(db,'projects',projId),{designProgress:dp});setSynced();renderDesign();}
window.dcToggleMember=async function(projId,colName,uid,checked){
  const proj=S.projects.find(p=>p.id===projId);if(!proj)return;
  if(checked&&!markableMembersList().some(m=>m.uid===uid))return;
  const raw=(proj.designProgress||{})[colName]||'';
  let ids=Array.isArray(raw)?[...raw]:(raw?[raw]:[]);
  ids=checked?[...new Set([...ids,uid])]:ids.filter(id=>id!==uid);
  const dp={...(proj.designProgress||{}),[colName]:ids};
  proj.designProgress=dp;
  const menuEl=document.getElementById('dc-mention-'+projId+'-'+colName);
  const refreshMemberUi=()=>menuEl&&menuEl.style.display!=='none'?dcRenderMemberPicker(projId,colName):renderDesign();
  if(localTestMode){setSynced();refreshMemberUi();return;}
  setSyncing();await updateDoc(doc(db,'projects',projId),{designProgress:dp});setSynced();
  refreshMemberUi();
}
window.dcScheduleClose=function(projId,colName){
  clearTimeout(mCloseTimer);
  mCloseTimer=setTimeout(function(){
    const menuEl=document.getElementById('dc-mention-'+projId+'-'+colName);
    if(menuEl)menuEl.style.display='none';
    if(activePanel==='design')renderDesign();
  },250);
}
// "#" autocomplete for text-kind design columns, linking to a 施工寶典 stage
window.dcHashCheck=function(el,projId,colName){
  const val=el.value||'';
  const pos=el.selectionStart||0;
  const textBefore=val.substring(0,pos);
  const hIdx=textBefore.lastIndexOf('#');
  const menuEl=document.getElementById('dc-hash-'+projId+'-'+colName);
  if(!menuEl)return;
  if(hIdx>=0&&textBefore.indexOf(' ',hIdx)<0){
    const q=textBefore.substring(hIdx+1).toLowerCase();
    const matches=getDesignBibleStages().filter(s=>s.toLowerCase().includes(q));
    if(matches.length){
      const rect=el.getBoundingClientRect();
      menuEl.style.cssText='display:block;position:fixed;top:'+(rect.bottom+4)+'px;left:'+rect.left+'px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:500;min-width:140px;max-height:200px;overflow-y:auto';
      menuEl.innerHTML=matches.map(s=>'<div onmousedown="event.preventDefault();dcPickStage(\''+projId+'\',\''+colName+'\',\''+s+'\')" style="padding:7px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border)">#'+displayStageName(s)+'</div>').join('');
      return;
    }
  }
  menuEl.style.display='none';
}
window.dcPickStage=function(projId,colName,stage){
  const menuEl=document.getElementById('dc-hash-'+projId+'-'+colName);
  if(menuEl)menuEl.style.display='none';
  // The input this dropdown belongs to is still focused. The upcoming
  // re-render will remove it from the DOM, and removing a focused element
  // fires a native blur on it — which would otherwise re-save whatever
  // stale text (just "#") was still sitting in the input, clobbering the
  // value we're about to save. Detach the blur handler first so that
  // doesn't happen.
  const inputEl=document.getElementById('dcell-'+projId+'-'+colName);
  if(inputEl)inputEl.onblur=null;
  saveDesignField(projId,colName,'#'+stage);
  setTimeout(function(){if(activePanel==='design')renderDesign();},0);
}
window.dcHashCheckLink=function(el,projId,colName,index){const val=el.value||'',pos=el.selectionStart||0,textBefore=val.substring(0,pos),hIdx=textBefore.lastIndexOf('#'),menuEl=document.getElementById(`dc-hash-link-${projId}-${colName}-${index}`);if(!menuEl)return;if(hIdx>=0&&textBefore.indexOf(' ',hIdx)<0){const q=textBefore.substring(hIdx+1).toLowerCase(),matches=getDesignBibleStages().filter(s=>s.toLowerCase().includes(q));if(matches.length){const rect=el.getBoundingClientRect();menuEl.style.cssText=`display:block;position:fixed;top:${rect.bottom+4}px;left:${rect.left}px;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:500;min-width:140px;max-height:200px;overflow-y:auto`;menuEl.innerHTML=matches.map(s=>`<div onmousedown="event.preventDefault();dcPickStageLink('${projId}','${colName}',${index},'${s}')" style="padding:7px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border)">#${displayStageName(s)}</div>`).join('');return;}}menuEl.style.display='none';};
window.dcPickStageLink=function(projId,colName,index,stage){const menuEl=document.getElementById(`dc-hash-link-${projId}-${colName}-${index}`);if(menuEl)menuEl.style.display='none';const inputEl=document.getElementById(`dcell-${projId}-${colName}-${index}`);if(inputEl)inputEl.onblur=null;saveDesignStageLink(projId,colName,index,'#'+stage);};
window.toggleDesignEditMode=function(){designEditMode=!designEditMode;renderDesign();}
let resizing=null;
window.startColResize=function(e,key){
  e.preventDefault();
  const th=e.target.closest('th');
  const startX=e.clientX;
  const startW=th?th.getBoundingClientRect().width:(designColWidths[key]||150);
  resizing={key,startX,startW,th};
  document.onmousemove=function(me){
    if(!resizing)return;
    const newW=Math.max(designColumnMinWidth(resizing.key),resizing.startW+(me.clientX-resizing.startX));
    if(resizing.th)resizing.th.style.width=newW+'px';
  };
  document.onmouseup=async function(){
    if(!resizing)return;
    const newW=resizing.th?parseInt(resizing.th.style.width)||resizing.startW:resizing.startW;
    const key=resizing.key;
    resizing=null;document.onmousemove=null;document.onmouseup=null;
    designColWidths=Object.assign({},designColWidths,{[key]:newW});
    if(localTestMode){setSynced();renderDesign();return;}
    setSyncing();
    try{await setDoc(doc(db,'settings','designColWidths'),{widths:designColWidths});setSynced();}
    catch(err){alert('欄位寬度存檔失敗：'+err.message);setSynced();}
  };
}
window.designRowDragStart=function(e,projId){if(!designEditMode)return;designRowDragSrc=projId;designRowDragInProgress=true;}
window.designRowDragOver=function(e,projId){if(!designEditMode)return;e.preventDefault();}
window.designRowDrop=async function(e,toProjId){
  if(!designEditMode)return;e.preventDefault();
  designRowDragInProgress=false;
  if(!designRowDragSrc||designRowDragSrc===toProjId)return;
  const cols=getDesignCols();
  const allIds=sortDesignProjs(S.projects.filter(p=>['contact','design','cv'].includes(p.status))).map(p=>p.id);
  const fi=allIds.indexOf(designRowDragSrc),ti=allIds.indexOf(toProjId);
  if(fi<0||ti<0)return;
  allIds.splice(fi,1);allIds.splice(ti,0,designRowDragSrc);
  designProjectOrder=allIds;
  renderDesign();
  setSyncing();
  try{await setDoc(doc(db,'settings','designProjectOrder'),{order:allIds});setSynced();}
  catch(err){alert('順序存檔失敗：'+err.message);setSynced();}
}
window.designRowDragEnd=function(){
  designRowDragSrc=null;
  designRowDragInProgress=false;
  if(pendingDesignRender){pendingDesignRender=false;renderDesign();}
}
