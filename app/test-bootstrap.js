// Minimal local environment used only by the eight focused test pages.
const focusedFeature = window.__APP_FEATURE_TEST__ || 'home';
const focusedTestSessionKey = 'interiorFocusedTestSession';
const originalSignOut = window.signOut;

window.signOut = async function () {
  sessionStorage.removeItem(focusedTestSessionKey);
  return originalSignOut();
};

window.enterLocalTestMode = async function () {
  sessionStorage.setItem(focusedTestSessionKey, '1');
  localTestMode = true;
  currentRole = 'manager';
  currentUser = {uid:'local-test-admin',displayName:'本機測試管理員',email:'test@localhost',photoURL:''};
  const ds = fmtDay(today()), tomorrow = fmtDay(addDays(today(), 1));
  S.members = [
    {id:currentUser.uid,uid:currentUser.uid,name:currentUser.displayName,email:currentUser.email,role:'manager',status:'active',tagInitial:'測'},
    {id:'local-designer',uid:'local-designer',name:'王設計師',email:'designer@localhost',role:'staff',status:'active',tagInitial:'王'},
    {id:'local-site-lead',uid:'local-site-lead',name:'陳工務',email:'site@localhost',role:'staff',status:'active',tagInitial:'陳'}
  ];
  S.bible = JSON.parse(JSON.stringify(WORD_BIBLE_IMPORT));
  S.bibleOrder = Object.keys(S.bible);
  S.projects = [
    {id:'local-demo-project',name:'本機展示案件',owner:'測試業主',address:'台北市測試路 80 號',type:'住宅設計',designer:'本機測試管理員',budget:'300',area:'30',pricePerPing:'5000',contractAmount:'2500000',contractStart:ds,contractEnd:fmtDay(addDays(today(),60)),finish:fmtDay(addDays(today(),60)),status:'prog',process:'此案件只存在於本機測試模式，不會寫入正式 Firebase。',designProgress:{},schedule:[{date:ds,time:'09:00',label:'現場確認',stage:'現場確認',note:'本機測試資料'},{date:tomorrow,time:'14:00',label:'工程排程',stage:'工程排程',note:'可用來檢查週／日檢視'}]},
    {id:'local-design-project',name:'設計階段展示案',owner:'設計測試業主',address:'新北市預覽街 8 號',type:'新成屋',designer:'本機測試管理員',budget:'180',area:'22',pricePerPing:'4500',contractStart:ds,contractEnd:fmtDay(addDays(today(),45)),finish:fmtDay(addDays(today(),45)),status:'design',process:'供設計進度頁面測試使用。',designProgress:{},schedule:[]},
    {id:'local-third-project',name:'河南路住宅案',owner:'第三測試業主',address:'台中市河南路測試號',type:'住宅設計',designer:'王設計師',budget:'220',area:'28',pricePerPing:'4800',contractStart:ds,contractEnd:fmtDay(addDays(today(),75)),finish:fmtDay(addDays(today(),75)),status:'prog',process:'供跨功能測試使用。',designProgress:{},schedule:[]}
  ];
  S.checks = {}; S.dailyLogs = {}; S.meetingLogs = {}; S.globalNotes = {};
  S.privateNotes = {work:{},personal:{}}; S.userTodos = [];
  userPrefs = {todoProjects:['local-demo-project','local-design-project'],noteHeight:'300px',appearance:normalizeAppearance(JSON.parse(localStorage.getItem('localPreviewAppearance')||'null'))};
  if (typeof companyDutyConfig !== 'undefined') companyDutyConfig = {groups:[],memberOrder:[],anchorMonth:''};
  restoreLocalPreviewState();
  applyAppearance(userPrefs.appearance);
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('pending-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('user-name').textContent = currentUser.displayName;
  document.getElementById('slbl').textContent = '本機測試';
  document.getElementById('sdot').style.background = 'var(--amber)';
  document.querySelectorAll('.admin-only').forEach(node => node.classList.add('show'));
  document.querySelectorAll('.nav-tab').forEach(node => {
    const selected = node.dataset.tab === focusedFeature;
    node.hidden = false;
    node.classList.toggle('active', selected);
  });
  activePanel = focusedFeature;
  document.querySelectorAll('.panel').forEach(node => node.classList.toggle('active', node.id === 'panel-' + focusedFeature));
  if (focusedFeature === 'home') {
    if (typeof loadHomeLayouts === 'function') await loadHomeLayouts();
    if (typeof initTodayNews === 'function') initTodayNews();
    if (typeof initDailyJoke === 'function') initDailyJoke();
    if (typeof initDailyQuiz === 'function') initDailyQuiz();
    if (typeof initDailyWaste === 'function') initDailyWaste();
  }
  if (focusedFeature === 'vendors' && typeof materialGuides !== 'undefined' && !materialGuides.length) {
    try {
      const saved = localStorage.getItem('materialGuides');
      materialGuides = saved ? JSON.parse(saved) : await (await fetch(new URL('assets/material-guide-seed.json', window.__APP_BASE_URL__))).json();
      activeMaterialGuideId = materialGuides[0]?.id || '';
    } catch (error) {
      console.warn('material guide seed failed', error);
    }
  }
  if (focusedFeature === 'b1f' && typeof initB1FSharedStore === 'function') await initB1FSharedStore();
  renderActive();
  saveLocalPreviewState();
};

if (sessionStorage.getItem(focusedTestSessionKey) === '1') {
  window.enterLocalTestMode();
}
