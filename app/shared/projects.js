// Runtime-composed source module. Keep declarations in shared application scope.
// ── Project CRUD ──
function ymdInputs(prefix,label){
  return`<div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:2px">${label}</div>
    <div class="project-ymd-fields">
      <input class="project-year" id="${prefix}-y" type="number" placeholder="年">年
      <input class="project-month" id="${prefix}-m" type="number" placeholder="月" min="1" max="12">月
      <input class="project-day" id="${prefix}-d" type="number" placeholder="日" min="1" max="31">日
    </div>
  </div>`;
}
function ymdValue(prefix){
  const y=$(`${prefix}-y`).value.trim(),m=$(`${prefix}-m`).value.trim(),d=$(`${prefix}-d`).value.trim();
  if(!y||!m||!d)return'';
  return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
function ymdSetFields(prefix,val){
  if(!val)return;
  const parts=val.split('-');
  if(parts.length!==3)return;
  if($(`${prefix}-y`))$(`${prefix}-y`).value=parts[0];
  if($(`${prefix}-m`))$(`${prefix}-m`).value=parseInt(parts[1],10);
  if($(`${prefix}-d`))$(`${prefix}-d`).value=parseInt(parts[2],10);
}
window.autoGrow=function(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}
window.updateNPAmount=function(){
  const area=parseFloat($('np-area').value)||0;
  const price=parseFloat($('np-price').value)||0;
  $('np-design-amount').textContent=(area*price).toLocaleString();
}
window.showAddProject=function(){
  if(!isAdmin())return;
  showProjectForm(null);
}
window.showEditProject=function(projId){
  if(!canEditProjects())return;
  showProjectForm(projId);
}
let projectFormDraft=null;
window.captureProjectFormDraft=function(){
  const ids=['np-referrer','np-name','np-site-tag','np-owner','np-phone','np-type-kind','np-type-building','np-address','np-panorama-url','np-designer','np-budget','np-area','np-price','np-render-url','np-contract-amount','np-process','np-status'];
  const values={};ids.forEach(id=>{const el=$(id);if(el)values[id]=el.value;});
  values.budgetIncludeFurniture=!!$('np-budget-furniture')?.checked;values.budgetIncludeAC=!!$('np-budget-ac')?.checked;
  values.contractStart=ymdValue('np-cs');values.contractEnd=ymdValue('np-ce');projectFormDraft=values;return values;
}
function restoreProjectFormDraft(draft){
  if(!draft)return;Object.entries(draft).forEach(([id,value])=>{const el=$(id);if(el&&id!=='budgetIncludeFurniture'&&id!=='budgetIncludeAC')el.value=value??'';});
  if($('np-budget-furniture'))$('np-budget-furniture').checked=!!draft.budgetIncludeFurniture;if($('np-budget-ac'))$('np-budget-ac').checked=!!draft.budgetIncludeAC;
  ymdSetFields('np-cs',draft.contractStart);ymdSetFields('np-ce',draft.contractEnd);updateNPAmount();
}
function showProjectForm(projId,draft=null){
  const p=projId?S.projects.find(x=>x.id===projId):null;
  const typeParts=String(p?.type||'').split('／');
  const formPhotos=projectPhotos(p);
  const photoEditor=p?`<section class="project-photo-panel">
      <div class="project-photo-head"><span>📷 案件照片（${formPhotos.length}）</span><label class="btn btn-sm" style="cursor:pointer">＋ 上傳照片<input type="file" accept="image/*" multiple hidden onchange="captureProjectFormDraft();uploadProjectPhotos('${p.id}',this.files,true);this.value=''"></label></div>
      ${formPhotos.length?`<div class="project-photo-grid">${formPhotos.map(photo=>`<div class="project-photo-card"><img src="${escAttr(photo.url)}" alt="${escAttr(photo.name||'案件照片')}" onclick="window.open(this.src,'_blank','noopener')"><div class="project-photo-name" title="${escAttr(photo.name||'案件照片')}">${escAttr(photo.name||'案件照片')}</div><button class="project-photo-delete" title="刪除照片" onclick="deleteProjectPhotoFromForm('${p.id}','${photo.id}')">×</button></div>`).join('')}</div>`:'<div class="project-photo-empty">尚未上傳照片</div>'}
    </section>`:`<div style="font-size:11px;color:var(--text3);border:1px dashed var(--border);border-radius:var(--r);padding:8px;text-align:center">📷 請先儲存新案件，再回到編輯案件上傳照片。</div>`;
  $('mo-content').classList.remove('project-detail-modal');$('mo-content').classList.add('project-form-modal');
  $('mo-content').innerHTML=`<div class="project-form-title"><div class="mo-title">${p?'編輯案件':'新增案件'}</div><input id="np-referrer" type="text" placeholder="介紹人" value="${escAttr(p?.referrer||'')}"></div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px;max-height:65vh;overflow-y:auto">
      <div class="project-form-pair"><input id="np-name" type="text" placeholder="案件名稱*" value="${escAttr(p?.name||'')}"><input id="np-site-tag" type="text" maxlength="12" placeholder="工地標記（例如：平等街）" value="${escAttr(p?.siteTag||'')}"></div>
      <div class="project-form-pair"><input id="np-owner" type="text" placeholder="業主姓名" value="${escAttr(p?.owner||'')}"><input id="np-phone" type="text" placeholder="電話" value="${escAttr(p?.phone||'')}"></div>
      <div class="project-type-pair"><select id="np-type-kind" onchange="updateProjectTypeRequired()"><option value=""></option>${['預售屋','新成屋','中古屋'].map(v=>`<option value="${v}" ${typeParts.includes(v)?'selected':''}>${v}</option>`).join('')}</select><select id="np-type-building" onchange="updateProjectTypeRequired()"><option value=""></option>${['公寓','電梯大樓','透天別墅'].map(v=>`<option value="${v}" ${typeParts.includes(v)?'selected':''}>${v}</option>`).join('')}</select></div>
      <input id="np-address" type="text" placeholder="案件地址" value="${escAttr(p?.address||'')}">
      <input id="np-panorama-url" type="text" inputmode="url" placeholder="Google 相簿 3D 環景網址（https://…）" value="${escAttr(p?.panoramaUrl||'')}">
      <input id="np-designer" type="text" placeholder="設計師" value="${escAttr(p?.designer||'')}">
      <div class="project-budget-row">
        <label class="project-budget-field"><input id="np-budget" type="text" placeholder="預算" value="${escAttr(p?.budget||'')}"><span class="project-budget-unit">萬</span></label>
        <div class="project-budget-options">
          <label><input type="checkbox" id="np-budget-furniture" ${p?.budgetIncludeFurniture?'checked':''}> 含家具</label>
          <label><input type="checkbox" id="np-budget-ac" ${p?.budgetIncludeAC?'checked':''}> 含空調</label>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <input class="project-number-input" id="np-area" type="number" placeholder="設計簽約坪數" oninput="updateNPAmount()" value="${escAttr(p?.area||'')}" style="flex:1">
        <span>×</span>
        <input class="project-number-input" id="np-price" type="number" placeholder="單坪價格" oninput="updateNPAmount()" value="${escAttr(p?.pricePerPing||'')}" style="flex:1">
      </div>
      <div style="font-size:12px;color:var(--text2)">設計合約金額（自動計算）：<span id="np-design-amount" style="font-weight:600;color:var(--text)">${p?((parseFloat(p.area)||0)*(parseFloat(p.pricePerPing)||0)).toLocaleString():'0'}</span></div>
      <input id="np-render-url" type="text" inputmode="url" placeholder="3D 渲染圖網址（https://…）" value="${escAttr(p?.renderUrl||'')}">
      <input id="np-contract-amount" type="text" placeholder="工程合約金額" value="${escAttr(p?.contractAmount||'')}">
      <div class="project-date-pair">${ymdInputs('np-cs','合約起始日')}${ymdInputs('np-ce','合約完工日')}</div>
      <textarea id="np-process" placeholder="廠商施工流程…" rows="10" oninput="autoGrow(this)" style="font-family:inherit;padding:8px;border:1px solid var(--border);border-radius:var(--r);overflow-y:auto;resize:none;min-height:190px;max-height:340px">${escAttr(p?.process||'')}</textarea>
      ${photoEditor}
      <select id="np-status">
        ${STATUS_OPTS.map(o=>`<option value="${o.v}" ${p?.status===o.v?'selected':''}>${o.l}</option>`).join('')}
      </select>
    </div>
    <div class="mo-footer"><button class="btn" onclick="closeMo()">取消</button><button id="np-save-btn" class="btn btn-p" onclick="saveProjectForm(${p?`'${p.id}'`:'null'})" ${p?'':'disabled'}>${p?'儲存':'新增'}</button></div>`;
  $('mo-content').dataset.lockBackdrop='true';$('modal').style.display='flex';
  if(draft)restoreProjectFormDraft(draft);else{ymdSetFields('np-cs',p?.contractStart);ymdSetFields('np-ce',p?.contractEnd||(!p?.contractStart?p?.finish:''));}if(!p)updateProjectTypeRequired();
  requestAnimationFrame(function(){const ta=$('np-process');if(ta)autoGrow(ta);});
}
window.updateProjectTypeRequired=function(){
  const saveButton=$('np-save-btn');if(saveButton)saveButton.disabled=!$('np-type-kind').value||!$('np-type-building').value;
}
window.saveProjectForm=async function(projId){
  if(projId?!canEditProjects():!isAdmin())return;
  const name=$('np-name').value.trim();if(!name)return alert('請填寫案件名稱');
  if(!projId&&(!$('np-type-kind').value||!$('np-type-building').value))return alert('請選擇房屋狀態與建築類型');
  const contractStart=ymdValue('np-cs');
  const contractEnd=ymdValue('np-ce');
  const panoramaUrl=$('np-panorama-url').value.trim(),renderUrl=$('np-render-url').value.trim();
  if(panoramaUrl&&!/^https:\/\//i.test(panoramaUrl))return alert('3D 現場環景網址請使用 https:// 開頭。');
  if(renderUrl&&!/^https:\/\//i.test(renderUrl))return alert('3D 渲染圖網址請使用 https:// 開頭。');
  const data={
    name,
    siteTag:$('np-site-tag').value.trim(),
    referrer:$('np-referrer').value.trim(),
    owner:$('np-owner').value.trim(),
    phone:$('np-phone').value.trim(),
    panoramaUrl,
    renderUrl,
    address:$('np-address').value.trim(),
    type:[$('np-type-kind').value,$('np-type-building').value].filter(Boolean).join('／'),
    designer:$('np-designer').value.trim(),
    budget:$('np-budget').value.trim(),
    budgetIncludeFurniture:$('np-budget-furniture').checked,
    budgetIncludeAC:$('np-budget-ac').checked,
    area:$('np-area').value.trim(),
    pricePerPing:$('np-price').value.trim(),
    contractAmount:$('np-contract-amount').value.trim(),
    contractStart,
    contractEnd,
    finish:contractEnd,
    process:$('np-process').value.trim(),
    status:$('np-status').value};
  setSyncing();
  if(projId){
    await updateDoc(doc(db,'projects',projId),data);
  }else{
    const created=await addDoc(collection(db,'projects'),Object.assign({},data,{schedule:[],designProgress:{},createdAt:serverTimestamp()}));
    const order=[created.id,...sortDesignProjs(S.projects).map(p=>p.id).filter(id=>id!==created.id)];designProjectOrder=order;
    await setDoc(doc(db,'settings','designProjectOrder'),{order});
  }
  closeMo();setSynced();
}
window.deleteProject=async function(id){
  if(!canDeleteProjects())return;if(!confirm('確定刪除？'))return;
  await deleteDoc(doc(db,'projects',id));
}
function projectTradeSummary(projectId){
  const saved=S.projectTradeSelections[projectId]||{};
  const lines=[];
  S.tradeCategories.forEach(function(category){
    const sel=saved[category.id];if(!sel)return;
    if(sel.none){lines.push('<strong>'+escAttr(category.name)+'</strong>：無');return;}
    const vendors=(sel.vendorIds||[]).map(function(id){
      const vendor=S.tradeVendors.find(v=>v.id===id);if(!vendor)return'';
      const note=(sel.notes||{})[id];
      return escAttr(vendor.companyName||'未命名')+(vendor.contactName?'｜'+escAttr(vendor.contactName):'')+(note?'（'+escAttr(note)+'）':'');
    }).filter(Boolean);
    if(vendors.length)lines.push('<strong>'+escAttr(category.name)+'</strong>：'+vendors.join('、'));
  });
  return lines.join('<br>');
}
function projectPhotos(p){return Array.isArray(p?.photos)?p.photos.filter(x=>x&&x.url):[];}
const photoBlobCache=new Map();
function photoId(){return`photo-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
function fileAsDataUrl(file){return new Promise(function(resolve,reject){const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});}
function safePhotoFileName(name){return String(name||'photo').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-80)||'photo';}
window.uploadProjectPhotos=async function(projectId,files,returnToForm){
  if(!isAdmin()||!files?.length)return;
  const p=S.projects.find(x=>x.id===projectId);if(!p)return;
  const selected=Array.from(files);
  const invalid=selected.find(file=>!String(file.type||'').startsWith('image/')||file.size>10*1024*1024);
  if(invalid){alert('只能上傳圖片，且單張不可超過 10 MB。');return;}
  try{
    setSyncing();
    const added=[];
    for(const file of selected){
      const id=photoId();
      photoBlobCache.set(id,file);
      let url,path='';
      if(localTestMode){url=await fileAsDataUrl(file);path=`local/${projectId}/${id}`;}
      else{
        path=`projectPhotos/${projectId}/${id}-${safePhotoFileName(file.name)}`;
        const fileRef=storageRef(storage,path);
        await uploadBytes(fileRef,file,{contentType:file.type});
        url=await getDownloadURL(fileRef);
      }
      added.push({id,name:file.name||'照片',size:file.size||0,path,url,uploadedAt:new Date().toISOString(),uploadedBy:currentUser?.uid||''});
    }
    await updateDoc(doc(db,'projects',projectId),{photos:[...projectPhotos(p),...added]});
    setSynced();
    if(returnToForm){const draft=projectFormDraft;projectFormDraft=null;showProjectForm(projectId,draft);}
    else if(localTestMode)showProjectDetail(projectId);
  }catch(error){
    console.error(error);setOffline();
    alert('照片上傳失敗。請確認已登入，並確認 Firebase Storage 安全規則已設定。');
  }
}
window.deleteProjectPhoto=async function(projectId,photoIdValue){
  if(!isAdmin())return;
  const p=S.projects.find(x=>x.id===projectId);const photo=projectPhotos(p).find(x=>x.id===photoIdValue);if(!p||!photo)return;
  if(!confirm(`確定要刪除「${photo.name||'這張照片'}」嗎？`))return;
  try{
    setSyncing();
    if(!localTestMode&&photo.path)await deleteObject(storageRef(storage,photo.path));
    photoBlobCache.delete(photoIdValue);
    await updateDoc(doc(db,'projects',projectId),{photos:projectPhotos(p).filter(x=>x.id!==photoIdValue)});
    setSynced();if(localTestMode)showProjectDetail(projectId);
  }catch(error){console.error(error);setOffline();alert('照片刪除失敗，請稍後再試。');}
}
window.deleteProjectPhotoFromForm=async function(projectId,photoIdValue){
  const draft=window.captureProjectFormDraft();
  await window.deleteProjectPhoto(projectId,photoIdValue);
  if(localTestMode)showProjectForm(projectId,draft);
}
function projectShareText(p){return String(p?.process||'').trim();}
async function copyTextForLine(text){
  try{await navigator.clipboard.writeText(text);alert('文字已複製，可直接到 LINE 貼上。');}
  catch(error){prompt('請複製以下文字，再貼到 LINE：',text);}
}
function wrapCanvasText(ctx,text,x,y,maxWidth,lineHeight,maxLines){
  const chars=Array.from(String(text||''));let line='';let lines=[];
  for(const ch of chars){if(ch==='\n'){lines.push(line);line='';continue;}const trial=line+ch;if(ctx.measureText(trial).width>maxWidth&&line){lines.push(line);line=ch;}else line=trial;}
  if(line)lines.push(line);lines=lines.slice(0,maxLines||lines.length);
  lines.forEach((lineText,index)=>ctx.fillText(lineText,x,y+index*lineHeight));return lines.length*lineHeight;
}
async function photoBitmap(photo){
  const blob=await photoBlob(photo);
  if('createImageBitmap'in window)return createImageBitmap(blob);
  return new Promise(function(resolve,reject){const objectUrl=URL.createObjectURL(blob);const img=new Image();img.onload=()=>{URL.revokeObjectURL(objectUrl);resolve(img);};img.onerror=reject;img.src=objectUrl;});
}
async function photoBlob(photo){
  const cached=photoBlobCache.get(photo.id);
  if(cached)return cached;
  const response=await fetch(photo.url);if(!response.ok)throw new Error('photo fetch failed');return response.blob();
}
async function clipboardPhotoBlob(photo){
  const image=await photoBitmap(photo),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return new Promise(function(resolve,reject){canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('photo conversion failed')),'image/png');});
}
async function buildPhotoCollage(p){
  const photos=projectPhotos(p);if(!photos.length)throw new Error('no photos');
  const images=await Promise.all(photos.map(photo=>photoBitmap(photo)));
  const width=1200,pad=40,gap=16,columns=Math.min(images.length,3),cellWidth=(width-pad*2-gap*(columns-1))/columns;
  const rows=Math.ceil(images.length/columns),cellHeight=cellWidth*.72;
  const photoTop=pad,canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=Math.ceil(photoTop+rows*cellHeight+(rows-1)*gap+pad);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  images.forEach(function(image,index){const col=index%columns,row=Math.floor(index/columns),x=pad+col*(cellWidth+gap),y=photoTop+row*(cellHeight+gap);const ratio=Math.max(cellWidth/image.width,cellHeight/image.height),dw=image.width*ratio,dh=image.height*ratio;ctx.save();ctx.beginPath();ctx.rect(x,y,cellWidth,cellHeight);ctx.clip();ctx.drawImage(image,x+(cellWidth-dw)/2,y+(cellHeight-dh)/2,dw,dh);ctx.restore();});
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
}
async function copyImageForLine(blob,successText){
  if(!blob)throw new Error('image generation failed');
  if(navigator.clipboard&&window.ClipboardItem){await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);alert(successText);return;}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='案件分享照片.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);alert('瀏覽器不支援直接複製圖片，已改為下載圖片；請將檔案拖曳或貼到 LINE。');
}
window.shareProjectText=function(projectId){const p=S.projects.find(x=>x.id===projectId);if(!p)return;const text=projectShareText(p);if(!text){alert('尚未填寫「廠商施工流程」，沒有可分享的文字。');return;}copyTextForLine(text);}
window.setProjectDetailPhoto=async function(projectId,photoId,checked){
  if(selectedProjectDetailId!==projectId){selectedProjectDetailId=projectId;selectedProjectDetailPhotoId='';}
  selectedProjectDetailPhotoId=checked?photoId:'';selectedProjectDetailPhotoBlob=null;showProjectDetail(projectId);
  if(!checked)return;
  const p=S.projects.find(x=>x.id===projectId),photo=p&&projectPhotos(p).find(x=>x.id===photoId);if(!photo)return;
  try{const blob=await clipboardPhotoBlob(photo);if(selectedProjectDetailId===projectId&&selectedProjectDetailPhotoId===photoId){selectedProjectDetailPhotoBlob=blob;showProjectDetail(projectId);}}
  catch(error){console.error(error);if(selectedProjectDetailId===projectId&&selectedProjectDetailPhotoId===photoId){selectedProjectDetailPhotoId='';selectedProjectDetailPhotoBlob=null;showProjectDetail(projectId);}alert('這張照片暫時無法準備複製，請稍後再試。');}
}
window.copySelectedProjectPhoto=async function(projectId){
  if(selectedProjectDetailId!==projectId||!selectedProjectDetailPhotoBlob)return;
  try{await copyImageForLine(selectedProjectDetailPhotoBlob,'已複製這張照片，可直接到 LINE 對話貼上。');}
  catch(error){console.error(error);alert('照片複製失敗，請確認照片仍可讀取後再試。');}
}
window.shareProjectPhotoCollage=async function(projectId){
  const p=S.projects.find(x=>x.id===projectId);if(!p)return;
  if(!projectPhotos(p).length){alert('請先上傳至少一張照片。');return;}
  try{const blob=await buildPhotoCollage(p);await copyImageForLine(blob,'照片已合成並複製，可直接到 LINE 訊息或記事本貼上。');}
  catch(error){console.error(error);alert('照片合成失敗。剛上傳的照片可立即分享；已存照片需完成 Storage 的 CORS 設定後才能合成分享。');}
}
function renderProjectDesignReadOnly(p){
  const dp=p.designProgress||{};
  return getDesignCols().map(function(col){
    const colKey=col.key||col.name;
    const raw=dp[colKey];
    let value='';
    if(col.kind==='member'){
      const ids=Array.isArray(raw)?raw:(raw?[raw]:[]);
      value=ids.map(function(uid){
        const member=S.members.find(function(item){return item.uid===uid;});
        return member?memberDisplayName(member):uid;
      }).filter(Boolean).join('、');
    }else{
      value=raw==null?'':String(raw).trim();
      if(value.startsWith('#'))value='#'+displayStageName(value.slice(1));
    }
    const storedDate=String(dp[colKey+'__date']||'');
    const dateParts=storedDate.split('-');
    const year=dp[colKey+'__date_y']!==undefined?dp[colKey+'__date_y']:(dateParts[0]||'');
    const month=dp[colKey+'__date_m']!==undefined?dp[colKey+'__date_m']:(dateParts[1]||'');
    const day=dp[colKey+'__date_d']!==undefined?dp[colKey+'__date_d']:(dateParts[2]||'');
    const date=[year,month,day].filter(function(part){return part!==''&&part!=null;}).join('/');
    if(!value&&!date)return'';
    return`<div class="project-design-readonly-row">
      <div class="project-design-readonly-label">${escAttr(col.name)}</div>
      <div class="project-design-readonly-value">${date?`<div class="project-design-readonly-date">${escAttr(date)}</div>`:''}${escAttr(value)}</div>
    </div>`;
  }).join('');
}
window.showProjectDetail=function(projId){
  const p=S.projects.find(x=>x.id===projId);
  if(!p)return;
  if(selectedProjectDetailId!==projId){selectedProjectDetailId=projId;selectedProjectDetailPhotoId='';selectedProjectDetailPhotoBlob=null;}
  const si=statusInfo(p.status);
  const designAmount=(parseFloat(p.area)||0)*(parseFloat(p.pricePerPing)||0);
  const tradeSummary=projectTradeSummary(p.id);
  const designProgressMarkup=renderProjectDesignReadOnly(p);
  const photos=projectPhotos(p);
  const photoPanel=function(placement){const helpId=`project-photo-help-${placement}`;return`<section class="project-photo-panel">
      <div class="project-photo-head"><span>📷 案件照片 <span class="help-wrap project-photo-help"><button class="help-btn" type="button" aria-label="案件照片操作說明" onclick="toggleHelpPop(event,'${helpId}')">?</button><span class="help-pop" id="${helpId}" onclick="event.stopPropagation()"><ul><li>勾選一張照片後，才能使用單張複製。</li><li>一次僅能選取一張照片。</li><li>分享照片（合成）會將全部照片排成一張。</li></ul></span></span>（${photos.length}）</span></div>
      ${photos.length?`<div class="project-photo-grid">${photos.map(photo=>`<div class="project-photo-card"><input class="project-photo-select" type="checkbox" aria-label="選取 ${escAttr(photo.name||'案件照片')}" ${selectedProjectDetailPhotoId===photo.id?'checked':''} ${selectedProjectDetailPhotoId&&selectedProjectDetailPhotoId!==photo.id?'disabled':''} onchange="setProjectDetailPhoto('${p.id}','${photo.id}',this.checked)"><img src="${escAttr(photo.url)}" alt="${escAttr(photo.name||'案件照片')}" onclick="window.open(this.src,'_blank','noopener')"><div class="project-photo-name" title="${escAttr(photo.name||'案件照片')}">${escAttr(photo.name||'案件照片')}</div></div>`).join('')}</div>`:'<div class="project-photo-empty">尚未上傳照片</div>'}
      <div class="project-share-row"><div class="project-share-actions"><button class="btn btn-sm" onclick="shareProjectText('${p.id}')">分享文字</button><button class="btn btn-sm btn-p" onclick="shareProjectPhotoCollage('${p.id}')">分享照片（合成）</button><button class="btn btn-sm" onclick="copySelectedProjectPhoto('${p.id}')" ${selectedProjectDetailPhotoId&&selectedProjectDetailPhotoBlob?'':'disabled'}>單張複製</button></div><div class="project-detail-actions">${canEditProjects()?`<button class="btn" onclick="showEditProject('${p.id}')">編輯</button>`:''}<button class="btn" onclick="closeMo()">關閉</button></div></div>
    </section>`;};
  function row(label,val){
    return`<div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px">
      <div style="width:110px;flex-shrink:0;color:var(--text2)">${label}</div>
      <div style="flex:1;white-space:pre-wrap;word-break:break-word">${val||'—'}</div>
    </div>`;
  }
  $('mo-content').classList.add('project-detail-modal');
  $('mo-content').innerHTML=`<div class="mo-title" style="display:flex;align-items:center;gap:12px"><span>${p.name}</span>${p.panoramaUrl?`<a class="project-panorama-link" href="${escAttr(p.panoramaUrl)}" target="_blank" rel="noopener noreferrer">◉ 3D現場環景</a>`:''}${p.renderUrl?`<a class="project-panorama-link" href="${escAttr(p.renderUrl)}" target="_blank" rel="noopener noreferrer">◉ 3D渲染圖</a>`:''}</div>
    <div class="project-detail-grid has-design-progress">
      <div class="project-detail-main">
      ${row('業主姓名',p.owner)}
      ${row('介紹人',p.referrer)}
      ${row('電話',p.phone)}
      ${row('案件地址',p.address)}
      ${row('類型',p.type)}
      ${row('設計師',p.designer)}
      ${row('預算',p.budget?`${p.budget}萬${p.budgetIncludeFurniture||p.budgetIncludeAC?'（'+[p.budgetIncludeFurniture?'含家具':'',p.budgetIncludeAC?'含空調':''].filter(Boolean).join('、')+'）':''}`:'')}
      ${row('設計簽約坪數',p.area)}
      ${row('單坪價格',p.pricePerPing)}
      ${row('設計合約金額',designAmount?designAmount.toLocaleString():'')}
      ${row('工程合約金額',p.contractAmount&&!isNaN(parseFloat(p.contractAmount))?parseFloat(p.contractAmount).toLocaleString():p.contractAmount)}
      ${row('合約起始日',p.contractStart)}
      ${row('合約完工日',p.contractEnd||p.finish)}
      ${row('初驗日',p.initialInspectionDate)}
      ${row('狀態',`<span class="badge" style="background:${si.bg};color:${si.color}">${si.l}</span>`)}
      ${p.completionTypes&&p.completionTypes.length?row('完工類型',p.completionTypes.join('、')):''}
      ${row('廠商施工流程',p.process)}
      <div class="project-detail-mobile-photo">${photoPanel('mobile')}</div>
      </div>
      <section class="project-detail-design">
        <div class="project-detail-trades-title">設計進度（唯讀）</div>
        <div class="project-design-readonly">${designProgressMarkup}</div>
      </section>
      <aside class="project-detail-trades">
        <div class="project-detail-trades-title">案件工班</div>
        <div class="project-detail-trades-list">${tradeSummary||'<span class="project-detail-empty">尚未設定工班</span>'}</div>
      </aside>
    </div>
    <div class="project-detail-desktop-photo">${photoPanel('desktop')}</div>`;
  $('modal').style.display='flex';
}
window.setCalMode=function(m){calMode=m==='week'?'month':m;lastHScrollLeft=0;renderProgress();}
window.changePeriod=async function(d){
  rememberProgressMonthScroll();
  monthOffset+=d;
  lastHScrollLeft=progressScrollLeftForMonth();
  const visibleDays=getWeekDates();
  await syncAllRecurringSchedules(fmtDay(visibleDays[visibleDays.length-1]));
  renderProgress();
}

// Formula bar functions
var formulaBarState=null; // {type,ds,idx,text,rowId} — selected meeting/work/personal item
// Inline HTML "oninput" attributes run in a scope that can't see this
// module's top-level variables directly, so they must go through a
// window-exposed function like this instead of touching formulaBarState.
window.pnSyncFormulaText=function(text){
  if(formulaBarState)formulaBarState.text=text;
}
var selGen=0;
function escAttr(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function normalizeLinkedItem(item){
  const source=String(item?.text||'');
  if(item?.link?.url)return{text:source,link:{label:item.link.label||source,url:item.link.url}};
  const legacy=source.match(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/);
  if(!legacy)return{text:source,link:null};
  return{text:source.slice(0,legacy.index)+legacy[1]+source.slice(legacy.index+legacy[0].length),link:{label:legacy[1],url:legacy[2]}};
}
function smartLinkHtml(label,url){
  let host='連結';try{host=new URL(url).hostname.replace(/^www\./,'');}catch(e){}
  const kind=/google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(url)?'Google 地圖':host;
  return'<span class="smart-link-wrap"><a class="inline-link" href="'+escAttr(url)+'" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">'+escAttr(label)+'</a><a class="smart-link-card" href="'+escAttr(url)+'" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><div class="smart-link-title">📍 '+escAttr(kind)+' · '+escAttr(label)+'</div><div class="smart-link-url">'+escAttr(url)+'</div><span class="smart-link-open">開啟連結</span></a></span>';
}
function renderPlainTextWithProjects(text){
  return String(text||'').split(/(\[proj:[^\]]+\])/g).map(function(part){
    const m=part.match(/^\[proj:([^\]]+)\]$/);
    return m?'<span style="color:var(--purple);font-weight:600;background:var(--pl);padding:0 4px;border-radius:3px;font-size:10px">'+escAttr(m[1])+'</span>':escAttr(part);
  }).join('');
}
function renderItemText(item){
  const linked=normalizeLinkedItem(item),text=linked.text,link=linked.link;
  if(!link)return renderPlainTextWithProjects(text);
  const pos=text.indexOf(link.label);if(pos<0)return renderPlainTextWithProjects(text);
  return renderPlainTextWithProjects(text.slice(0,pos))+smartLinkHtml(link.label,link.url)+renderPlainTextWithProjects(text.slice(pos+link.label.length));
}
function linkFromInput(input,text){
  const url=(input.dataset.linkUrl||'').trim(),label=input.dataset.linkLabel||'';
  if(!url||!label||!String(text).includes(label))return null;
  return{url,label};
}
window.insertUrlForSelection=function(event,input){
  const start=input.selectionStart,end=input.selectionEnd;
  if(start==null||end==null||start===end)return true;
  event.preventDefault();event.stopPropagation();
  const selected=input.value.slice(start,end);
  const url=prompt('貼上網址（Google 地圖或其他 http / https 網址）','https://');
  if(url===null)return false;
  let parsed;
  try{parsed=new URL(url.trim());}catch(err){alert('網址格式不正確');return false;}
  if(parsed.protocol!=='http:'&&parsed.protocol!=='https:'){alert('只支援 http 或 https 網址');return false;}
  input.dataset.linkUrl=parsed.href;input.dataset.linkLabel=selected;
  if(formulaBarState)formulaBarState.link={url:parsed.href,label:selected};
  input.setSelectionRange(start,end);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus();
  return false;
}
// Core save: always reads the live value straight off the given input element,
// identified by explicit type/ds/idx (baked into that box at render time) —
// never relies on a shared "current selection" variable that could be stale.
window.pnSaveBox=async function(el,type,ds,idx){
  if(!currentUser||!el)return;
  if(pnEditCanceled){
    pnEditCanceled=false;
    S.privateEditing=null;
    var pn0=S.privateNotes||{work:{},personal:{}};
    var items0=(pn0[type]&&pn0[type][ds])||[];
    var origText=items0[idx]?items0[idx].text||'':'';
    updateFormulaBar(type,ds,idx,origText);
    renderProgress();
    return;
  }
  var text=el.value;var link=linkFromInput(el,text);
  var pn=S.privateNotes||{work:{},personal:{}};
  var items=(pn[type]&&pn[type][ds])?[...pn[type][ds]]:[];
  while(items.length<=idx)items.push({text:'',color:''});
  items[idx]=Object.assign({},items[idx],{text:text,link:link});
  S.privateNotes=Object.assign({},pn);
  S.privateNotes[type]=Object.assign({},pn[type]||{});
  S.privateNotes[type][ds]=items;
  S.privateEditing=null;
  persistLocalPrivateNotes();
  setSyncing();
  await setDoc(doc(db,'privateNotes',currentUser.uid),S.privateNotes);
  setSynced();
  if(activePanel==='progress')renderProgress();
}
// Box (in-place chip) blur — identity is baked into the call at render time.
window.pnBoxBlur=function(el,type,ds,idx){
  var pending=S.privatePendingSelection;
  var pendingAdd=S.privatePendingAdd;
  S.privatePendingSelection=null;
  S.privatePendingAdd=null;
  if(pendingAdd)S.privateAddingFromBlur=true;
  pnSaveBox(el,type,ds,idx).then(function(){
    if(pendingAdd){S.privateAddingFromBlur=false;pnAdd(pendingAdd.type,pendingAdd.ds);return;}
    if(pending)pnSelect(pending.type,pending.ds,pending.idx);
  });
}
function updateFormulaBar(type,ds,idx,text,rowId,link){
  const same=formulaBarState&&formulaBarState.type===type&&formulaBarState.ds===ds&&formulaBarState.idx===idx;
  const keptLink=link===undefined&&same?formulaBarState.link:link;
  formulaBarState=(type===null)?null:{type:type,ds:ds,idx:idx,text:text||'',rowId:rowId||'',link:keptLink||null};
  var bar=document.getElementById('pn-formula-bar');
  var inp=document.getElementById('pn-formula-input');
  var lbl=document.getElementById('pn-formula-label');
  if(!bar||!inp)return;
  if(!formulaBarState){
    bar.classList.remove('active');
    inp.value='';
    return;
  }
  bar.classList.add('active');
  const meetingName=type==='meeting'?(MEETING_ROWS.find(r=>r.id===rowId)?.name||'會議 / 其他事項'):'';
  lbl.textContent=(type==='meeting'?meetingName:(type==='work'?'工地記事':'私人記事'))+' · '+ds.slice(5).replace('-','/');
  inp.value=text||'';
  inp.dataset.linkUrl=formulaBarState.link?.url||'';
  inp.dataset.linkLabel=formulaBarState.link?.label||'';
}
// Top bar blur — identity comes from formulaBarState (the top bar always
// mirrors whichever item was last selected), but the TEXT is read live
// from the input itself.
window.formulaBarSave=async function(){
  if(!formulaBarState)return;
  var inp=document.getElementById('pn-formula-input');
  if(formulaBarState.type==='meeting')await mSaveBox(inp,formulaBarState.rowId,formulaBarState.ds,formulaBarState.idx);
  else await pnSaveBox(inp,formulaBarState.type,formulaBarState.ds,formulaBarState.idx);
}

// Date color picker
function defaultDateDayType(ds){const day=new Date(ds+'T00:00:00').getDay();return day===0||day===6?'holiday':'work';}
function dateDayType(ds){const type=S.dateColors[ds]?.dayType;return type==='holiday'||type==='work'?type:defaultDateDayType(ds);}
window.openDateColorPicker=function(ds){
  if(!isAdmin())return;
  var dc=S.dateColors[ds]||{};
  var dayType=dateDayType(ds);
  $('mo-content').innerHTML=`<div class="mo-title">${ds.slice(5).replace('-','/')} 日期設定</div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
      <div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">顏色</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[{c:'',l:'預設'},{c:'#E24B4A',l:'紅'},{c:'#EF9F27',l:'橘'},
             {c:'#1D9E75',l:'綠'},{c:'#534AB7',l:'藍'},{c:'#9c9690',l:'灰'}].map(col=>
            `<span onclick="document.getElementById('dcp-color').value='${col.c}';document.querySelectorAll('.dcp-dot').forEach(el=>el.style.outline='');this.style.outline='2px solid #333'"
              class="dcp-dot" style="width:24px;height:24px;border-radius:50%;background:${col.c||'#e8e5e0'};cursor:pointer;display:inline-block;border:1.5px solid rgba(0,0,0,.2);${(dc.color||'')===col.c?'outline:2px solid #333':''}" title="${col.l}"></span>`
          ).join('')}
          <input type="color" style="width:28px;height:28px;border:none;cursor:pointer;border-radius:4px" value="${dc.color||'#E24B4A'}" oninput="document.getElementById('dcp-color').value=this.value">
        </div>
        <input type="hidden" id="dcp-color" value="${dc.color||''}">
      </div>
      <div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">備註（如：中秋節、補班日）</div>
        <input type="text" id="dcp-note" value="${dc.note||''}" placeholder="可不填">
      </div>
      <div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:6px">日期類型（六、日預設休假；一至五預設工作）</div>
        <input type="hidden" id="dcp-day-type" value="${dayType}">
        <div style="display:flex;gap:7px">
          ${[{v:'work',l:'工作日'},{v:'holiday',l:'休假日'}].map(type=>`<button type="button" class="btn btn-sm ${dayType===type.v?'btn-p':''}" data-dcp-day-type="${type.v}" onclick="document.getElementById('dcp-day-type').value='${type.v}';document.querySelectorAll('[data-dcp-day-type]').forEach(el=>el.classList.toggle('btn-p',el.dataset.dcpDayType==='${type.v}'))">${type.l}</button>`).join('')}
        </div>
      </div>
    </div>
    <div class="mo-footer">
      <button class="btn btn-danger btn-sm" onclick="saveDateColor('${ds}','','',defaultDateDayType('${ds}'))">清除</button>
      <button class="btn" onclick="closeMo()">取消</button>
      <button class="btn btn-p" onclick="saveDateColor('${ds}',document.getElementById('dcp-color').value,document.getElementById('dcp-note').value,document.getElementById('dcp-day-type').value)">儲存</button>
    </div>`;
  $('modal').style.display='flex';
}
window.saveDateColor=async function(ds,color,note,dayType){
  var colors=Object.assign({},S.dateColors);
  var type=dayType==='holiday'||dayType==='work'?dayType:defaultDateDayType(ds);
  if(!color&&!note&&type===defaultDateDayType(ds)){delete colors[ds];}
  else{colors[ds]={color:color||'',note:note||'',dayType:type};}
  S.dateColors=colors;
  setSyncing();
  await setDoc(doc(db,'settings','dateColors'),{colors});
  closeMo();setSynced();
}
