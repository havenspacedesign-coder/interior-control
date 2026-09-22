// Runtime-composed source module. Keep declarations in shared application scope.
// ── Auth ──
let googleSignInInProgress=false;
const isIOSDevice=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandaloneMode=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
window.signInWithGoogle=async function(){
  if(googleSignInInProgress)return;
  googleSignInInProgress=true;
  try{
    if(isIOSDevice||isStandaloneMode)await signInWithRedirect(auth,provider);
    else{
      try{await signInWithPopup(auth,provider);}
      catch(e){
        // 內嵌瀏覽器可能會自動關閉 Google 彈出式視窗；改以整頁導向登入。
        if(['auth/popup-closed-by-user','auth/popup-blocked','auth/cancelled-popup-request'].includes(e?.code)){
          await signInWithRedirect(auth,provider);
          return;
        }
        throw e;
      }
    }
  }catch(e){
    googleSignInInProgress=false;
    alert('登入失敗：'+e.message);
  }
}
window.signOut=async function(){
  if(localTestMode){location.reload();return;}
  await fbSignOut(auth);location.reload();
}

window.enterLocalTestMode=async function(){
  if(!IS_LOCAL_PREVIEW)return;
  localTestMode=true;
  currentRole='manager';
  currentUser={uid:'local-test-admin',displayName:'本機測試管理員',email:'test@localhost',photoURL:''};
  const ds=fmtDay(today());
  const tomorrow=fmtDay(addDays(today(),1));
  S.members=[
    {id:currentUser.uid,uid:currentUser.uid,name:currentUser.displayName,email:currentUser.email,role:'manager',status:'active',tagInitial:'測'},
    {id:'local-designer',uid:'local-designer',name:'王設計師',email:'designer@localhost',role:'staff',status:'active',tagInitial:'王'},
    {id:'local-site-lead',uid:'local-site-lead',name:'陳工務',email:'site@localhost',role:'staff',status:'active',tagInitial:'陳'}
  ];
  companyDutyConfig=makeLocalCompanyDutyConfig();
  S.recommendationRegions=[];
  S.recommendationCategories=[
    {id:'food-drink',name:'吃喝',sortOrder:0,enabled:true},{id:'media-reading',name:'影視閱讀',sortOrder:1,enabled:true},{id:'goods-tools',name:'好物／工具',sortOrder:2,enabled:true},{id:'places-events',name:'景點活動',sortOrder:3,enabled:true},{id:'other',name:'其他',sortOrder:4,enabled:true}
  ];
  S.recommendations=[
    {id:'local-recommend-1',title:'設計師週末咖啡店',description:'適合帶著筆電整理靈感，空間舒服、採光很好。',url:'https://example.com/',imageUrl:'',categoryId:'food-drink',authorUid:'local-designer',authorName:'王設計師',createdAt:new Date(Date.now()-3600000).toISOString()},
    {id:'local-recommend-2',title:'線上配色工具',description:'快速建立空間配色提案的實用網站。',url:'https://example.com/',imageUrl:'',categoryId:'goods-tools',authorUid:'local-site-lead',authorName:'陳工務',createdAt:new Date(Date.now()-7200000).toISOString()},
    {id:'local-recommend-old',title:'尚未分類的舊推薦',description:'用來確認舊資料仍會保留並顯示。',url:'',imageUrl:'',authorUid:'local-designer',authorName:'王設計師',createdAt:new Date(Date.now()-10800000).toISOString()}
  ];
  S.growthItems=[
    {id:'local-growth-1',name:'客製框明鏡',url:'https://example.com/',projectIds:['local-demo-project'],createdAt:new Date(Date.now()-86400000*10).toISOString()},
    {id:'local-growth-2',name:'天花板懸吊吊燈上升',url:'https://example.com/',projectIds:[],createdAt:new Date(Date.now()-86400000*8).toISOString()},
    {id:'local-growth-3',name:'主臥床上吊燈',url:'',projectIds:['local-demo-project','local-design-project'],createdAt:new Date(Date.now()-86400000*6).toISOString()}
  ];
  try{const savedAnnouncements=JSON.parse(localStorage.getItem('localPreviewAnnouncements')||'[]');S.announcements=Array.isArray(savedAnnouncements)?savedAnnouncements:[];}catch(error){console.warn('本機公告資料無法讀取',error);S.announcements=[];}
  S.bible=JSON.parse(JSON.stringify(WORD_BIBLE_IMPORT));
  S.bibleOrder=Object.keys(S.bible);
  const localStages=['測試－現場放樣','測試－材料進場','測試－完工驗收'];
  localStages.forEach(function(stage){
    if(!S.bible[stage])S.bible[stage]={before:['確認日期與負責人','確認材料及圖面'],during:['拍照記錄','核對施工品質'],after:['清潔現場','回報完成狀態']};
    if(!S.bibleOrder.includes(stage))S.bibleOrder.push(stage);
  });
  S.projects=[{
    id:'local-demo-project',name:'本機展示案件',owner:'測試業主',phone:'0900-000-000',address:'台北市測試路 80 號',
    type:'住宅設計',designer:'本機測試管理員',budget:'300',area:'30',pricePerPing:'5000',contractAmount:'2500000',
    contractStart:ds,contractEnd:fmtDay(addDays(today(),60)),finish:fmtDay(addDays(today(),60)),status:'prog',
    process:'此案件只存在於本機測試模式，不會寫入正式 Firebase。',designProgress:{},
    schedule:[{date:ds,time:'09:00',label:'現場確認',stage:'現場確認',note:'本機測試資料'},{date:tomorrow,time:'14:00',label:'工程排程',stage:'工程排程',note:'可用來檢查週／日檢視'}]
  },{
    id:'local-design-project',name:'設計階段展示案',owner:'設計測試業主',phone:'0900-111-111',address:'新北市預覽街 8 號',
    type:'新成屋',designer:'本機測試管理員',budget:'180',area:'22',pricePerPing:'4500',contractAmount:'',
    contractStart:ds,contractEnd:fmtDay(addDays(today(),45)),finish:fmtDay(addDays(today(),45)),status:'design',
    process:'供設計進度頁面測試使用。',designProgress:{},schedule:[]
  },{
    id:'local-third-project',name:'河南路住宅案',owner:'第三測試業主',phone:'0900-222-222',address:'台中市河南路測試號',
    type:'住宅設計',designer:'王設計師',budget:'220',area:'28',pricePerPing:'4800',contractAmount:'',
    contractStart:ds,contractEnd:fmtDay(addDays(today(),75)),finish:fmtDay(addDays(today(),75)),status:'prog',
    process:'供成長清單跨三個不同案件測試使用。',designProgress:{},schedule:[]
  }];
  userPrefs={todoProjects:['local-demo-project','local-design-project'],noteHeight:'300px',appearance:normalizeAppearance(JSON.parse(localStorage.getItem('localPreviewAppearance')||'null'))};applyAppearance(userPrefs.appearance);
  S.meetingLogs={};
  S.meetingLogs['meet1_'+ds]={rowId:'meet1',date:ds,items:[{text:'本機測試會議－確認平面配置',mentions:['local-designer'],color:'',bg:''}]};
  S.dailyLogs={};
  S.dailyLogs['local-designer_'+ds]={uid:'local-designer',date:ds,text:'確認平面配置與工程項目',assigned:[{id:'local-task-1',text:'整理現場照片'}]};
  try{const savedPrivateNotes=JSON.parse(localStorage.getItem('localPreviewPrivateNotes_'+currentUser.uid)||'null');if(savedPrivateNotes&&typeof savedPrivateNotes==='object')S.privateNotes=savedPrivateNotes;}catch(error){console.warn('本機記事狀態無法讀取',error);}
  S.userTodos=[{id:'local-todo-1',uid:currentUser.uid,projId:'local-demo-project',text:'確認本機下拉選單',done:false}];
  if(!materialGuides.length){try{const saved=localStorage.getItem('materialGuides');materialGuides=saved?JSON.parse(saved):await (await fetch(new URL('assets/material-guide-seed.json',window.__APP_BASE_URL__||location.href))).json();activeMaterialGuideId=materialGuides[0]?.id||'';}catch(error){console.error('material guide seed failed',error);}}
  restoreLocalPreviewState();
  applyAppearance(userPrefs.appearance);
  $('login-screen').style.display='none';
  $('pending-screen').style.display='none';
  $('app-screen').style.display='block';
  $('user-name').textContent=currentUser.displayName;
  $('slbl').textContent='本機測試';
  $('sdot').style.background='var(--amber)';
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.add('show'));
  await loadHomeLayouts();
  initTodayNews();
  initDailyJoke();
  initDailyQuiz();
  initDailyWaste();
  renderHome();
  saveLocalPreviewState();
}

if(IS_LOCAL_PREVIEW){
  $('local-test-btn').style.display='flex';
  $('local-test-hint').style.display='block';
}

if(!IS_LOCAL_PREVIEW){
  try{await getRedirectResult(auth);}
  catch(e){alert('登入失敗：'+e.message);}
  onAuthStateChanged(auth,async user=>{
  if(!user){
    $('login-screen').style.display='flex';
    $('pending-screen').style.display='none';
    $('app-screen').style.display='none';
    return;
  }
  currentUser=user;
  const memberRef=doc(db,'members',user.uid);
  const memberSnap=await getDoc(memberRef);
  let memberData;
  if(!memberSnap.exists()){
    const role='pending';
    memberData={uid:user.uid,name:user.displayName,email:user.email,photoURL:user.photoURL,role,status:'active',createdAt:serverTimestamp()};
    await setDoc(memberRef,memberData);
    currentRole=role;
  }else{
    memberData=memberSnap.data();
    currentRole=memberData.role;
  }
  if(memberData.status==='resigned'){
    await fbSignOut(auth);
    $('login-screen').style.display='flex';
    $('pending-screen').style.display='none';
    $('app-screen').style.display='none';
    alert('此帳號已被設定為離職，無法登入。如有疑問請聯絡主管。');
    return;
  }
  if(currentRole==='pending'){
    $('login-screen').style.display='none';
    $('pending-screen').style.display='flex';
    $('app-screen').style.display='none';
    $('pending-email').textContent=user.email;
    return;
  }
  $('login-screen').style.display='none';
  $('pending-screen').style.display='none';
  $('app-screen').style.display='block';
  if(user.photoURL){$('user-avatar').src=user.photoURL;$('user-avatar').style.display='block';}
  $('user-name').textContent=memberDisplayName(memberData);
  if(isAdmin())document.querySelectorAll('.admin-only').forEach(el=>el.classList.add('show'));
  initListeners();await loadHomeLayouts();renderHome();

  });
}

// ── AI Assistant ──
var aiOpen=false;
window.toggleAI=function(){
  aiOpen=!aiOpen;
  var panel=document.getElementById('ai-panel');
  if(panel)panel.style.display=aiOpen?'flex':'none';
  if(aiOpen){setTimeout(function(){var inp=document.getElementById('ai-input');if(inp)inp.focus();},100);}
}
window.sendAI=async function(){
  var inp=document.getElementById('ai-input');
  var msgs=document.getElementById('ai-messages');
  var btn=document.getElementById('ai-send');
  if(!inp||!msgs)return;
  var q=inp.value.trim();if(!q)return;
  inp.value='';btn.disabled=true;
  var userDiv=document.createElement('div');
  userDiv.className='ai-msg-user';userDiv.textContent=q;
  msgs.appendChild(userDiv);
  var loadDiv=document.createElement('div');
  loadDiv.className='ai-msg-ai';loadDiv.textContent='思考中…';
  msgs.appendChild(loadDiv);
  msgs.scrollTop=msgs.scrollHeight;
  var projList=S.projects.map(function(p){return p.name+'（'+({design:'設計中',prog:'施工中',done:'已完工',wait:'待確認',stop:'暫停'}[p.status]||p.status)+'）';}).join('、');
  var stageList=Object.keys(S.bible||{}).filter(function(k){return k!=='orderConfig';}).join('、');
  var systemPrompt='你是一個室內設計公司的專案管理 AI 助理，請用繁體中文回答。\n目前系統資料：\n【案件列表】'+projList+'\n【施工寶典階段】'+(stageList||'尚無')+'。\n請根據以上資料回答，若問題與資料無關也可提供室內設計相關建議。';
  try{
    var resp=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,system:systemPrompt,messages:[{role:'user',content:q}]})
    });
    var data=await resp.json();
    var answer=(data.content&&data.content[0]&&data.content[0].text)||'抱歉，無法取得回應';
    loadDiv.textContent=answer;
  }catch(err){loadDiv.textContent='連線發生問題，請稍後再試';}
  btn.disabled=false;
  msgs.scrollTop=msgs.scrollHeight;
}

function initListeners(){
  initTodayNews();
  initDailyJoke();
  initDailyQuiz();
  initDailyWaste();
  initB1FSharedStore();
  onSnapshot(doc(db,'homeLayouts','company-default'),snap=>{if(!snap.exists())return;companyHomeLayout=normalizeHomeLayout(snap.data());personalHomeLayout=syncPersonalHomeLayout(personalHomeLayout);if(activePanel==='home'&&!homeEditMode)renderHome();});
  onSnapshot(collection(db,'projects'),snap=>{S.projects=snap.docs.map(d=>({id:d.id,...d.data()}));renderActive();setSynced();},()=>setOffline());
  onSnapshot(collection(db,'checks'),snap=>{S.checks={};snap.docs.forEach(d=>{S.checks[d.id]=d.data().items||[]});renderAfterCheckSync();});
  onSnapshot(collection(db,'bible'),snap=>{
    S.bible={};S.bibleOrder=[];
    snap.docs.forEach(d=>{if(d.id==='orderConfig'){S.bibleOrder=[...new Set(d.data().order||[])];}else{const data=d.data(),stage=data.stageTitle||bibleStageFromStorageId(d.id);S.bible[stage]=data;}});
    const allStages=Object.keys(S.bible).filter(k=>k!=='orderConfig');
    allStages.forEach(s=>{if(!S.bibleOrder.includes(s))S.bibleOrder.push(s);});
    renderActive();
  });
  onSnapshot(collection(db,'members'),snap=>{S.members=snap.docs.map(d=>({id:d.id,...d.data()}));renderActive();});
  onSnapshot(collection(db,'homeNotes'),snap=>{S.homeNotes=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='home')renderHome();});
  onSnapshot(collection(db,'recommendations'),snap=>{S.recommendations=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='home')renderHome();});
  onSnapshot(collection(db,'recommendationCategories'),snap=>{S.recommendationCategories=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='home')renderHome();});
  onSnapshot(collection(db,'recommendationRegions'),snap=>{S.recommendationRegions=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='home')renderHome();});
  onSnapshot(collection(db,'materialGuides'),snap=>{materialGuides=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));if(!materialGuides.length&&isAdmin())ensureMaterialGuideSeed();if(activePanel==='vendors')renderVendors();});
  onSnapshot(collection(db,'growthItems'),snap=>{S.growthItems=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='home')renderHome();});
  onSnapshot(collection(db,'announcements'),snap=>{S.announcements=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='home')renderHome();});
  onSnapshot(doc(db,'settings','companyDuty'),snap=>{companyDutyConfig=normalizeCompanyDutyConfig(snap.exists()?snap.data():{});if(activePanel==='home')renderHome();});
  onSnapshot(collection(db,'tradeCategories'),snap=>{S.tradeCategories=sortTradeCategories(snap.docs.map(d=>({id:d.id,...d.data()})));if(activePanel==='vendors')renderVendors();});
  onSnapshot(collection(db,'tradeVendors'),snap=>{S.tradeVendors=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='vendors')renderVendors();});
  onSnapshot(collection(db,'otherVendorCategories'),snap=>{S.otherVendorCategories=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='vendors')renderVendors();});
  onSnapshot(collection(db,'otherVendors'),snap=>{S.otherVendors=snap.docs.map(d=>({id:d.id,...d.data()}));if(activePanel==='vendors')renderVendors();});
  onSnapshot(collection(db,'projectTradeSelections'),snap=>{S.projectTradeSelections={};snap.docs.forEach(d=>{S.projectTradeSelections[d.id]=d.data().categories||{}});if(activePanel==='vendors')renderVendors();});
  onSnapshot(doc(db,'settings','designCols'),snap=>{
    const saved=snap.exists()?(snap.data().cols||DEFAULT_DESIGN_COLS):DEFAULT_DESIGN_COLS;
    const normalized=normalizeDesignCols(saved);
    designCols=normalized;
    if(!designStructureMigrationAttempted&&JSON.stringify(saved)!==JSON.stringify(normalized)){
      designStructureMigrationAttempted=true;
      setDoc(doc(db,'settings','designCols'),{cols:normalized}).catch(err=>console.warn('設計欄位結構同步失敗',err));
    }
    renderActive();
  });
  onSnapshot(doc(db,'settings','designColWidths'),snap=>{
    designColWidths=snap.exists()?(snap.data().widths||{}):{};
    if(activePanel==='design')renderDesign();
  });
  onSnapshot(doc(db,'settings','designProjectOrder'),snap=>{
    designProjectOrder=snap.exists()?(snap.data().order||[]):[];
    if(activePanel==='design')renderDesign();else if(activePanel==='overview')renderOverview();else if(activePanel==='progress')renderProgress();
  });
  onSnapshot(doc(db,'settings','dateColors'),snap=>{
    S.dateColors=snap.exists()?(snap.data().colors||{}):{};
    if(activePanel==='progress')renderProgress();
  });
  // Daily logs: shared, keyed by date
  onSnapshot(collection(db,'dailyLogs'),snap=>{
    S.dailyLogs={};
    snap.docs.forEach(d=>{S.dailyLogs[d.id]=d.data();});
    if(activePanel==='progress')renderProgress();
  });
  onSnapshot(collection(db,'meetingLogs'),snap=>{
    S.meetingLogs={};
    snap.docs.forEach(d=>{S.meetingLogs[d.id]=d.data();});
    if(activePanel==='progress')renderProgress();
  });
  onSnapshot(doc(db,'globalNotes','dailyLogMemberOrder'),snap=>{
    dailyLogMemberOrder=snap.exists()&&Array.isArray(snap.data().order)?snap.data().order:[];
    if(activePanel==='progress')renderProgress();
  });
  onSnapshot(
    query(collection(db,'globalNotes'),where('uid','==',currentUser.uid)),
    snap=>{
      S.globalNotes={};
      snap.docs.forEach(d=>{S.globalNotes[d.id]=d.data();});
      if(activePanel==='progress')renderProgress();
    }
  );
  onSnapshot(
    query(collection(db,'userTodos'),where('uid','==',currentUser.uid)),
    snap=>{
      S.userTodos=snap.docs.map(d=>({id:d.id,...d.data()}));
      if(activePanel==='progress')renderProgress();
    }
  );
  // Private notes: per user
  if(currentUser){
    onSnapshot(doc(db,'userPrefs',currentUser.uid),snap=>{
      userPrefs=snap.exists()?snap.data():{todoProjects:[]};applyAppearance(userPrefs.appearance);
      if(userPrefs.noteHeight)globalNoteBoxHeight=userPrefs.noteHeight;
      if(activePanel==='progress')renderProgress();
    });
    onSnapshot(doc(db,'privateNotes',currentUser.uid),snap=>{
      S.privateNotes=snap.exists()?snap.data():{work:{},personal:{}};
      if(activePanel==='progress')renderProgress();
      syncAllRecurringSchedules();
    });
  }
}

document.querySelectorAll('.nav-tab').forEach(t=>{
  t.addEventListener('click',()=>{
    if(t.dataset.tab==='progress'&&activePanel!=='progress'){
      monthOffset=0;
      lastHScrollLeft=Math.max(0,(today().getDate()-2)*180);
    }
    document.querySelectorAll('.nav-tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');activePanel=t.dataset.tab;
    const mobileBrand=$('mobile-nav-brand');if(mobileBrand)mobileBrand.textContent=t.textContent.trim();
    closeMobileNav();
    $(`panel-${activePanel}`).classList.add('active');renderActive();
  });
});
window.toggleMobileNav=function(){
  const nav=document.querySelector('.topnav'),button=$('mobile-menu-toggle');if(!nav||!button)return;
  const opening=!nav.classList.contains('mobile-menu-open');
  nav.classList.toggle('mobile-menu-open',opening);button.setAttribute('aria-expanded',String(opening));button.textContent=opening?'×':'☰';
};
function closeMobileNav(){
  const nav=document.querySelector('.topnav'),button=$('mobile-menu-toggle');if(!nav||!button)return;
  nav.classList.remove('mobile-menu-open');button.setAttribute('aria-expanded','false');button.textContent='☰';
}
