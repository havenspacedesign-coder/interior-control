// Runtime-composed source module. Keep declarations in shared application scope.
// ── Members ──
let expandedMemberInfo={};
let editingMemberInfo={};
function renderMembers(){
  if(!isAdmin())return;
  const el=$('panel-members');
  const pending=S.members.filter(m=>m.role==='pending');
  const roleOrder={manager:0,admin:1,staff:2};
  const active=S.members.filter(m=>m.role!=='pending'&&m.status!=='resigned')
    .sort((a,b)=>(roleOrder[a.role]??3)-(roleOrder[b.role]??3));
  const resigned=S.members.filter(m=>m.role!=='pending'&&m.status==='resigned');
  function memberCard(m,isResigned){
    const ei=m.employeeInfo||{};
    const open=!!expandedMemberInfo[m.id];
    const isEdit=!!editingMemberInfo[m.id];
    const roleLabel=m.role==='manager'?'管理員':(m.role==='admin'?'主管':'員工');
    const roleBadgeClass=m.role==='manager'?'role-manager':(m.role==='admin'?'role-admin':'role-staff');
    return`<div class="member-card" style="flex-direction:column;align-items:stretch">
    <div style="display:flex;align-items:center;gap:10px">
      <img class="member-avatar" src="${m.photoURL||''}" onerror="this.style.display='none'">
      <div class="member-info" style="flex:1">
        <div class="member-name">${memberDisplayName(m)}${isResigned?' <span style="font-size:11px;color:var(--text3)">（離職）</span>':''}</div>
        <div class="member-email">${m.email}</div>
      </div>
      ${!isResigned?`<span class="role-badge ${roleBadgeClass}">${roleLabel}</span>`:''}
      ${!isResigned?`<select class="btn btn-sm" onchange="changeRole('${m.id}',this.value)">
        ${m.uid===currentUser?.uid?`<option value="manager" ${m.role==='manager'?'selected':''}>管理員</option>`:''}
        <option value="admin" ${m.role==='admin'?'selected':''}>主管</option>
        <option value="staff" ${m.role==='staff'?'selected':''}>員工</option>
      </select>`:''}
      ${m.uid===currentUser?.uid?'<span style="font-size:11px;color:var(--text3)">（自己）</span>':''}
      <button class="btn btn-sm" onclick="toggleMemberInfo('${m.id}')">${open?'收起資料':'員工資料'}</button>
      ${m.uid!==currentUser?.uid?(isResigned?`<button class="btn btn-sm btn-p" onclick="setMemberStatus('${m.id}','active')">恢復在職</button>`:`<button class="btn btn-sm btn-danger" onclick="setMemberStatus('${m.id}','resigned')">設為離職</button>`):''}
    </div>
    ${open?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);font-size:12px">
      <div style="display:flex;justify-content:flex-end;margin-bottom:6px">
        <button class="btn btn-sm ${isEdit?'btn-p':''}" onclick="toggleMemberEdit('${m.id}')">${isEdit?'完成':'✎ 編輯'}</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 12px;align-items:end">
      <div style="grid-column:1/-1;font-weight:600;color:var(--text2)">顯示設定</div>
      ${mfField(m.id,'displayName','顯示名稱',m.displayName||'',isEdit)}
      ${mfField(m.id,'tagInitial','標記縮寫（例如：偉）',m.tagInitial||'',isEdit)}
      <div style="grid-column:1/-1;font-weight:600;color:var(--text2)">基本資料</div>
      ${eiField(m.id,'realName','姓名',ei.realName,isEdit)}
      ${eiField(m.id,'idNumber','身份證字號',ei.idNumber,isEdit)}
      ${eiField(m.id,'birthDate','出生日期',ei.birthDate,isEdit)}
      ${eiField(m.id,'gender','性別',ei.gender,isEdit)}
      ${eiField(m.id,'bloodType','血型',ei.bloodType,isEdit)}
      ${eiField(m.id,'marital','婚姻狀況',ei.marital,isEdit)}
      <div style="grid-column:1/-1;font-weight:600;color:var(--text2)">聯絡資訊</div>
      ${eiField(m.id,'homeAddr','戶籍地址',ei.homeAddr,isEdit)}
      ${eiField(m.id,'mailAddr','聯絡地址',ei.mailAddr,isEdit)}
      ${eiField(m.id,'phone','手機',ei.phone,isEdit)}
      ${eiField(m.id,'emergName','緊急聯絡人姓名',ei.emergName,isEdit)}
      ${eiField(m.id,'emergRel','緊急聯絡人關係',ei.emergRel,isEdit)}
      ${eiField(m.id,'emergPhone','緊急聯絡人電話',ei.emergPhone,isEdit)}
      <div style="grid-column:1/-1;font-weight:600;color:var(--text2)">任職資訊</div>
      ${eiField(m.id,'title','職稱',ei.title,isEdit)}
      ${eiField(m.id,'department','所屬部門',ei.department,isEdit)}
      ${eiField(m.id,'hireDate','到職日',ei.hireDate,isEdit)}
      ${eiField(m.id,'resignDate','離職日',ei.resignDate,isEdit)}
      ${eiField(m.id,'insuranceDate','勞健保加保日',ei.insuranceDate,isEdit)}
      </div>
    </div>`:''}
    </div>`;
  }
  function fieldWrap(label,inner){
    return`<div><div style="color:var(--text3);font-size:11px;margin-bottom:2px">${label}</div>${inner}</div>`;
  }
  function mfField(uid,field,label,val,isEdit){
    const inner=isEdit
      ?`<input type="text" value="${escAttr(val)}" onblur="saveMemberField('${uid}','${field}',this.value)" onkeydown="if(event.key==='Enter')this.blur()" style="width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:inherit">`
      :`<div style="padding:4px 2px;font-size:12px;min-height:20px">${escAttr(val)||'—'}</div>`;
    return fieldWrap(label,inner);
  }
  const DATE_FIELDS=['birthDate','hireDate','resignDate','insuranceDate'];
  function eiField(uid,field,label,val,isEdit){
    const isDate=DATE_FIELDS.includes(field);
    const inner=isEdit
      ?`<input type="${isDate?'date':'text'}" value="${escAttr(val||'')}" onblur="saveEmployeeInfo('${uid}','${field}',this.value)" onkeydown="if(event.key==='Enter')this.blur()" style="width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:12px;font-family:inherit">`
      :`<div style="padding:4px 2px;font-size:12px;min-height:20px">${escAttr(val||'')||'—'}</div>`;
    return fieldWrap(label,inner);
  }
  el.innerHTML=`
  <div style="font-size:15px;font-weight:600;margin-bottom:1rem">成員管理</div>
  ${pending.length?`<div style="font-size:13px;font-weight:500;margin-bottom:8px;color:var(--amber)">待審核（${pending.length}）</div>
  ${pending.map(m=>`<div class="member-card">
    <img class="member-avatar" src="${m.photoURL||''}" onerror="this.style.display='none'">
    <div class="member-info"><div class="member-name">${memberDisplayName(m)}</div><div class="member-email">${m.email}</div></div>
    <span class="role-badge role-pending">待審核</span>
    <button class="btn btn-sm btn-p" onclick="approveMember('${m.id}','staff')">核准（員工）</button>
    <button class="btn btn-sm btn-p" style="background:var(--pd)" onclick="approveMember('${m.id}','admin')">核准（主管）</button>
    <button class="btn btn-sm btn-danger" onclick="rejectMember('${m.id}')">拒絕</button>
  </div>`).join('')}`:''}
  <div style="font-size:13px;font-weight:500;margin-bottom:8px;margin-top:${pending.length?'16px':'0'}">所有成員（${active.length}）</div>
  ${active.map(m=>memberCard(m,false)).join('')}
  ${resigned.length?`<div style="font-size:13px;font-weight:500;margin-bottom:8px;margin-top:16px;color:var(--text3)">離職員工（${resigned.length}）</div>
  ${resigned.map(m=>memberCard(m,true)).join('')}`:''}`;
}
window.toggleMemberInfo=function(uid){expandedMemberInfo[uid]=!expandedMemberInfo[uid];renderMembers();}
window.toggleMemberEdit=function(uid){editingMemberInfo[uid]=!editingMemberInfo[uid];renderMembers();}
window.saveMemberField=async function(uid,field,val){
  if(!isAdmin())return;
  await updateDoc(doc(db,'members',uid),{[field]:val});
}
window.saveEmployeeInfo=async function(uid,field,val){
  if(!isAdmin())return;
  const m=S.members.find(x=>x.id===uid);
  const ei={...(m?.employeeInfo||{}),[field]:val};
  await updateDoc(doc(db,'members',uid),{employeeInfo:ei});
}
window.setMemberStatus=async function(uid,status){
  if(!isAdmin())return;
  const m=S.members.find(x=>x.id===uid);
  if(status==='resigned'&&!confirm('確定要將這位成員設為離職嗎？設定後他將無法再登入系統，但所有資料會保留。'))return;
  const patch={status};
  if(status==='resigned'){
    patch.resignedAt=serverTimestamp();
    const ei={...(m?.employeeInfo||{})};
    if(!ei.resignDate)ei.resignDate=fmtDay(today());
    patch.employeeInfo=ei;
  }
  await updateDoc(doc(db,'members',uid),patch);
}
window.approveMember=async function(uid,role){await updateDoc(doc(db,'members',uid),{role,status:'active'});}
window.rejectMember=async function(uid){if(!confirm('確定拒絕？'))return;await deleteDoc(doc(db,'members',uid));}
window.changeRole=async function(uid,role){await updateDoc(doc(db,'members',uid),{role});}
