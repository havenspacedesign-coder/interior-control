import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const projects = await read('app/shared/projects.js');
const dataSource = await read('app/shared/project-progress.js');
const core = await read('app/shared/core.js');
const dates = projects.slice(projects.indexOf('function projectStageToday'), projects.indexOf('function projectStageInitial'));
const calendar = core.slice(core.indexOf('function progressCalendarToday'), core.indexOf('function rememberProgressMonthScroll'));
const date = '2026-11-11';
const october = '2026-10';
const november = '2026-11';
const december = '2026-12';
const legacy = {
  id: 'site', name: '驗證工地', status: 'done', siteNote: '原始共用備註',
  schedule: [{ date: '2026-10-15', note: '十月工地紀錄', label: '木作' }, { date, note: '十一月工地紀錄' }],
  stageHistory: { version: 1, revision: 2, segments: [{ status: 'prog', start: '2026-09-01', end: date }, { status: 'done', start: date, end: null }] }
};

function load(extra = {}, source = '') {
  return new Function(...Object.keys(extra), dates + dataSource + source +
    '\nreturn { progressLegacyClosedOn, progressRosterAt, progressProjectWrite, progressProjectVisible, progressCanEditDate, progressMonthSchedule, progressAllSchedule, progressMonthNote, writeProgressLegacyClosedMonth, writeProgressMonths, writeProgressOrder, writeProgressCheckItems, progressCheckItems, ...(typeof renderWeekView === "function" ? {renderWeekView} : {}) };')(...Object.values(extra));
}

const model = load();
assert.equal(model.progressLegacyClosedOn(legacy), date);
for (const month of ['2026-09', october, november]) assert.equal(model.progressProjectVisible(legacy, month), true);
assert.equal(model.progressProjectVisible(legacy, december), false);
assert.equal(model.progressProjectVisible({ ...legacy, progressCompletedOn: '2026-10-31' }, november), true);
assert.equal(model.progressProjectVisible({ ...legacy, status: 'prog' }, december), true);
assert.equal(model.progressProjectVisible({ ...legacy, stageHistory: null, contractEnd: '2026-09-01' }, december), true);
assert.equal(model.progressLegacyClosedOn({ ...legacy, stageHistory: { version:1,partial: true, segments: [legacy.stageHistory.segments[1]] } }), '');
assert.equal(model.progressLegacyClosedOn({ ...legacy, stageHistory: { ...legacy.stageHistory, revision: 4 } }), '');
const backfilled={...legacy,stageHistory:null,progressLegacyClosedMonth:november};
for(let month=1;month<=11;month++)assert.equal(model.progressProjectVisible(backfilled,`2026-${String(month).padStart(2,'0')}`),true);
assert.equal(model.progressProjectVisible(backfilled,december),false);
assert.equal(model.progressProjectVisible(backfilled,'2027-01'),false);
const journal = load({serverTimestamp:()=> '2026-11-11T04:00:00Z'});
const legacyWithNoRows={name:'只有完工類型的舊工程案',status:'done',completionTypes:['工程完成'],progressLegacyClosedMonth:november};
const reopenedLegacy={...legacyWithNoRows,...journal.progressProjectWrite(legacyWithNoRows,{
  status:'prog',stageHistory:{segments:[{status:'prog',start:'2026-12-11'}]}
},december)};
assert.equal(journal.progressProjectVisible(reopenedLegacy,november),true);
const designOnly={name:'設計結案',status:'design'};
const designHistory={version:1,revision:2,segments:[{status:'design',start:'2026-10-01',end:date},{status:'done',start:date,end:null}]};
for(const type of ['未簽約','設計終止','設計完成','工程完成']){
  const closedDesign={...designOnly,...journal.progressProjectWrite(designOnly,{status:'done',stageHistory:designHistory,completionTypes:[type]},november)};
  assert.equal(journal.progressProjectVisible(closedDesign,november),false);
}
assert.equal(model.progressProjectVisible({name:'舊設計結案',status:'done',completionTypes:['設計完成']},november),false);
assert.equal(model.progressProjectVisible({name:'舊工程結案',status:'done',completionTypes:['工程完成']},november),true);
const designThenConstruction={...designOnly,...journal.progressProjectWrite(designOnly,{status:'prog'},november)};
const closedSameMonth={...designThenConstruction,...journal.progressProjectWrite(designThenConstruction,{
  status:'done',stageHistory:{firstConstructionDay:'2026-11-05',segments:designHistory.segments}
},november)};
assert.equal(journal.progressProjectVisible(closedSameMonth,october),false);
assert.equal(journal.progressProjectVisible(closedSameMonth,november),true);
assert.equal(journal.progressProjectVisible(closedSameMonth,december),false);
const opening = {name:'十一月原名',status:'prog',initialInspectionDate:'2026-09-15'};
const closing = {...opening,...journal.progressProjectWrite(opening,{status:'done'},november)};
const renamed = {...closing,...journal.progressProjectWrite(closing,{status:'prog',name:'十二月新名'},december)};
assert.equal(journal.progressRosterAt(renamed,november).name,'十一月原名');
assert.equal(journal.progressRosterAt(renamed,november).status,'done');
assert.equal(journal.progressRosterAt(renamed,december).name,'十二月新名');
assert.equal(journal.progressProjectVisible(closing,december),false);
assert.equal(journal.progressProjectVisible(renamed,december),true);
assert.equal(journal.progressProjectVisible({...opening,...journal.progressProjectWrite(null,opening,november)},october),false);
const now = new Date('2026-11-11T04:00:00Z');
for (const role of ['admin', 'manager', 'staff', 'supervisor']) {
  assert.equal(model.progressCanEditDate(october, role, now), ['admin', 'manager'].includes(role));
  assert.equal(model.progressCanEditDate(november, role, now), true);
  assert.equal(model.progressCanEditDate(december, role, now), true);
}
assert.equal(model.progressCanEditDate(november, 'staff', new Date('2026-11-30T15:59:59Z')), true);
assert.equal(model.progressCanEditDate(november, 'staff', new Date('2026-11-30T16:00:00Z')), false);
const updated = { ...legacy, progressMonths: { [october]: { schedule: [], siteNote: '' }, [november]: { siteNote: '只改十一月' } } };
assert.equal(model.progressMonthSchedule(updated, october).length, 0);
assert.equal(model.progressMonthSchedule(updated, november).length, 1);
assert.equal(model.progressAllSchedule(updated).length, 1);
assert.equal(model.progressMonthNote(updated, october), '');
assert.equal(model.progressMonthNote(updated, november), '只改十一月');
assert.equal(model.progressMonthNote(updated, december), legacy.siteNote);
const falseDate = { ...legacy, progressMonths: { [december]: { schedule: [legacy.schedule[0]] } } };
assert.equal(model.progressAllSchedule(falseDate).length, 2);

const progress = await read('app/features/construction-progress/index.js');
function renderMonth(role, month, day) {
  const viewing = new Date(day + 'T12:00:00');
  const fixture = load({
    currentRole: role, Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } },
    designProjectOrder: [], S: { projects: [legacy], progressArchivedProjects:[],progressWorkOrders:{},progressDesignOrders:{},dateColors: {}, members: [], meetingLogs: {
      ['meet1_' + day]: { items: [{ text: '歷史會議紀錄', mentions: [] }] }
    } },
    getWeekDates: () => [viewing], today: () => now, fmtDay: () => day, isSameDay: () => false,
    sortDesignProjs: x => x, selectedTag: null, openPicker: null, tc: () => '', sc: () => '',
    resolveBibleStage: x => x, pendingCount: () => 0, scheduleCellIsSelected: () => false,
    scheduleCellIsEditing: () => false, displayStageName: x => x, escAttr: x => x, pendBadge: () => '',
    MEETING_ROWS: [{ id: 'meet1', name: '客戶會議' }], meetingSelected: {}, meetingEditing: null,
    normalizeLinkedItem: x => x, markableMembersList: () => [], renderItemText: x => x.text,
    isAdmin: () => ['admin', 'manager'].includes(role)
  }, calendar + progress.slice(progress.indexOf('function renderWeekView(')));
  return fixture.renderWeekView(month);
}
for (const role of ['staff', 'supervisor']) {
  const html = renderMonth(role, october, '2026-10-15');
  assert.match(html, /歷史月份唯讀/);
  assert.match(html, /驗證工地.*原始共用備註/s);
  assert.match(html, /十月工地紀錄/);
  assert.match(html, /歷史會議紀錄/);
  assert.doesNotMatch(html, /ondrop=|onblur="saveProgressSiteNote|onclick="event.stopPropagation\(\);removeEv/);
  assert.match(renderMonth(role, november, date), /saveProgressSiteNote/);
}
const adminHtml = renderMonth('admin', october, '2026-10-15');
assert.match(adminHtml, /saveProgressSiteNote/);
assert.match(adminHtml, /removeEv/);
assert.match(adminHtml, /mDrop/);
assert.doesNotMatch(renderMonth('admin', december, '2026-12-01'), /驗證工地/);
console.log('PASS: completion visibility, missing dates, Taipei month rollover, historical desktop/mobile markup, legacy schedule and report.');

if (!process.argv.includes('--emulator')) process.exit(0);

const require = createRequire(new URL('./ai-database/package.json', import.meta.url));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, writeBatch, serverTimestamp } = require('firebase/firestore');
const rules = await read('firestore.rules');
const projectId = 'demo-haven-ai-review';
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: '127.0.0.1', port: 8281, rules }
});
const roles = ['admin', 'manager', 'supervisor', 'staff'];
const accounts = new Map();
const apps = [];
let checks = 0;
const allow = async action => { const result = await assertSucceeds(action); checks++; return result; };
const deny = async action => { await assertFails(action); checks++; };
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', dateStyle: 'short' }).format(new Date());
assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
const thisMonth = today.slice(0, 7);
const futureMonth = '2099-12';
const pastMonth = '2020-10';
const pastDate = pastMonth + '-02';
const meeting = (day, text) => ({ rowId: 'meet1', date: day, items: [{ text }] });
try {
  for (const role of roles) {
    const app = initializeApp({ projectId, apiKey: 'emulator-only' }, 'progress-' + role);
    apps.push(app);
    const auth = getAuth(app), db = getFirestore(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9499', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8281);
    const { user } = await createUserWithEmailAndPassword(auth, 'progress-' + role + '@review.test', 'LocalReviewOnly123!');
    accounts.set(role, { db, uid: user.uid });
  }
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all(roles.map(role => setDoc(doc(db, 'members', accounts.get(role).uid), { role, status: 'active' })));
    await setDoc(doc(db, 'projects', 'progress-site'), {
      name: '保留案件', status: 'prog', siteNote: '舊備註',
      schedule: [{ date: pastDate, note: '舊排程' }],
      progressMonths: { [pastMonth]: { siteNote: '歷史月備註' } },
      stageHistory: { version: 1, revision: 1, partial: true, firstConstructionDay: pastDate,
        segments: [{ status: 'prog', start: pastDate, end: null }] }
    });
    await setDoc(doc(db, 'meetingLogs', 'meet1_' + pastDate), meeting(pastDate, '舊會議'));
  });
  for (const role of roles) {
    const { db, uid } = accounts.get(role);
    const historical = doc(db, 'meetingLogs', 'meet1_' + pastDate);
    const current = doc(db, 'meetingLogs', 'meet1_' + today);
    const project = doc(db, 'projects', 'progress-site');
    const admin = role === 'admin' || role === 'manager';
    await allow(getDoc(historical));
    await allow(getDoc(project));
    await (admin ? allow : deny)(updateDoc(historical, { items: [{ text: role }] }));
    if (!admin) {
      await deny(setDoc(doc(db, 'meetingLogs', 'meet1_' + pastMonth + '-03'), meeting(pastMonth + '-03', '新增')));
      await deny(deleteDoc(historical));
      await deny(setDoc(historical, meeting(today, '日期偽造')));
      const batch = writeBatch(db);
      batch.set(current, meeting(today, '移出'));
      batch.delete(historical);
      await deny(batch.commit());
      await deny(updateDoc(project, { schedule: [] }));
      await deny(updateDoc(project, { siteNote: '覆蓋歷史備註' }));
      await deny(updateDoc(project, { progressMonths: {}, progressWriteMonths: [thisMonth] }));
      await deny(updateDoc(project, { ['progressMonths.' + pastMonth + '.siteNote']: '偽造', progressWriteMonths: [pastMonth, thisMonth] }));
      await deny(updateDoc(project, { progressCompletedOn: pastDate }));
      await deny(deleteDoc(project));
    }
    await allow(setDoc(current, meeting(today, role)));
    await allow(deleteDoc(current));
    await allow(setDoc(doc(db, 'dailyLogs', uid + '_' + pastDate), { uid, date: pastDate, text: '自己的歷史日誌' }));
    await allow(setDoc(doc(db, 'privateNotes', uid), { work: { [pastDate]: [{ text: '自己的歷史記事' }] } }));
    await allow(updateDoc(project, { photos: [{ id: role }], name: '保留案件', designProgress: { phase: '設計資料' } }));
    const unrelatedRefs = [
      doc(db, 'checks', 'shared-stage'), doc(db, 'settings', 'designCols'),
      doc(db, 'b1fStores', 'fixture'), doc(db, 'tradeVendors', 'fixture'),
      doc(db, 'homeNotes', 'fixture'), doc(db, 'bible', 'fixture'),
    ];
    for (const ref of unrelatedRefs) {
      await allow(setDoc(ref, { test: role }));
      assert.equal((await allow(getDoc(ref))).data().test, role);
    }
    const app = load({ currentRole: role, localTestMode: false, db, doc, fbRunTransaction: runTransaction });
    const readProject = async () => (await getDoc(project)).data();
    const saveNote = async (month, after) => app.writeProgressMonths([{
      projectId: 'progress-site', month, field: 'siteNote', before: app.progressMonthNote(await readProject(), month), after
    }]);
    await allow(saveNote(thisMonth, role + '當月'));
    await allow(saveNote(futureMonth, role + '未來'));
    const original = await readProject();
    const currentSchedule = app.progressMonthSchedule(original, thisMonth);
    const futureSchedule = app.progressMonthSchedule(original, futureMonth);
    await allow(app.writeProgressMonths([
      { projectId: 'progress-site', month: thisMonth, field: 'schedule', before: currentSchedule, after: [{ date: today, note: role }] },
      { projectId: 'progress-site', month: futureMonth, field: 'schedule', before: futureSchedule, after: [] }
    ]));
    assert.deepEqual((await readProject()).progressMonths[pastMonth], original.progressMonths[pastMonth]);
    if (admin) {
      await allow(saveNote(pastMonth, role + '歷史'));
      await allow(app.writeProgressMonths([{
        projectId: 'progress-site', month: pastMonth, field: 'schedule',
        before: app.progressMonthSchedule(await readProject(), pastMonth), after: []
      }]));
      const saved = await readProject();
      assert.equal(saved.progressMonths[thisMonth].siteNote, role + '當月');
      assert.equal(saved.progressMonths[futureMonth].siteNote, role + '未來');
      assert.equal(saved.schedule[0].note, '舊排程');
      assert.equal(app.progressMonthSchedule(saved, pastMonth).length, 0);
    }
    await assert.rejects(app.writeProgressMonths([{
      projectId: 'progress-site', month: thisMonth, field: 'siteNote', before: '過期內容', after: '覆蓋'
    }]), /已被更新/);
  }
  const staff = accounts.get('staff').db, admin = accounts.get('admin').db;
  const project = doc(staff, 'projects', 'progress-site'), adminProject=doc(admin,'projects','progress-site');
  const sdkFor = (db,role) => load({db,doc,getDoc,serverTimestamp,fbRunTransaction:runTransaction,localTestMode:false,
    isAdmin:()=>role==='admin',currentRole:role});
  const staffApp=sdkFor(staff,'staff'),adminApp=sdkFor(admin,'admin');
  const snapshot=(await getDoc(adminProject)).data();
  await deny(updateDoc(adminProject,{progressLegacyClosedMonth:thisMonth}));
  const legacyRef=doc(admin,'projects','legacy-completed');
  const oldProject={name:'河南路住宅案',status:'done',schedule:[{date:pastDate,note:'保留施工歷史'}],initialInspectionDate:pastDate};
  await env.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),'projects','legacy-completed'),oldProject));
  for(const role of ['staff','supervisor']){
    await deny(updateDoc(doc(accounts.get(role).db,'projects','legacy-completed'),{progressLegacyClosedMonth:thisMonth}));
  }
  await deny(updateDoc(legacyRef,{progressLegacyClosedMonth:futureMonth}));
  await deny(updateDoc(legacyRef,{progressLegacyClosedMonth:thisMonth,initialInspectionDate:today}));
  await allow(adminApp.writeProgressLegacyClosedMonth({...oldProject,id:'legacy-completed'},thisMonth));
  assert.deepEqual((await getDoc(legacyRef)).data(),{...oldProject,progressLegacyClosedMonth:thisMonth});
  await allow(updateDoc(doc(accounts.get('manager').db,'projects','legacy-completed'),{progressLegacyClosedMonth:pastMonth}));
  await deny(updateDoc(project,{status:'done',progressCompletedOn:pastDate}));
  await deny(updateDoc(project,staffApp.progressProjectWrite(snapshot,{status:'done'})));
  await deny(updateDoc(adminProject,{status:'done',progressClosedAt:new Date('2020-01-01')}));

  const stageWriter = new Function('db','doc','serverTimestamp','fbRunTransaction','localTestMode',
    'const window = {};\n' + dataSource + projects.slice(0, projects.indexOf('let projectStageRenderedDay')) +
    '\nreturn {writeProjectStageChange,projectStageTransition,projectStageAdjust};');
  const manager = accounts.get('manager');
  const managerRef = doc(manager.db,'projects','progress-site');
  const managerWriter = stageWriter(manager.db,doc,serverTimestamp,runTransaction,false);
  const adminWriter = stageWriter(admin,doc,serverTimestamp,runTransaction,false);
  const oldView = { ...snapshot, id: 'progress-site' };
  const finish = { status: 'done', completionTypes: ['工程完成'], initialInspectionDate: pastDate };
  let attempts = 0;
  const racingWriter = stageWriter(admin,doc,serverTimestamp,(db,save)=>runTransaction(db,transaction=>{
    attempts++;
    return save({
      async get(ref) {
        const before = await transaction.get(ref);
        if (attempts === 1) {
          const managerView = { ...(await getDoc(managerRef)).data(), id: oldView.id };
          const revised = managerWriter.projectStageAdjust(managerView, 368, manager.uid, today);
          await allow(managerWriter.writeProjectStageChange(managerView,{},revised));
        }
        return before;
      },
      update(ref, patch) { return transaction.update(ref,patch); }
    });
  }),false);
  await assert.rejects(racingWriter.writeProjectStageChange(oldView,finish,
    adminWriter.projectStageTransition(oldView,'done','keep',today)),/已被更新/);
  assert(attempts>1);
  const latest = (await getDoc(adminProject)).data();
  assert.equal(latest.status,'prog');
  assert.equal(latest.stageHistory.revision,snapshot.stageHistory.revision+1);
  assert.equal(latest.stageHistory.segments[0].adjustments[0].by,manager.uid);
  assert.equal(latest.completionTypes,undefined);

  const reorderedHistory = Object.fromEntries(Object.entries(latest.stageHistory).reverse());
  assert.notEqual(JSON.stringify(reorderedHistory),JSON.stringify(latest.stageHistory));
  const refreshedView = { ...latest, id: oldView.id, stageHistory: reorderedHistory };
  const closureHistory = adminWriter.projectStageTransition(refreshedView,'done','keep',today);
  await allow(adminWriter.writeProjectStageChange(refreshedView,finish,closureHistory));
  const saved=(await getDoc(adminProject)).data();
  assert.equal(saved.status,'done');
  assert.deepEqual(saved.completionTypes,['工程完成']);
  assert.deepEqual((await getDoc(managerRef)).data().stageHistory,closureHistory);
  assert(saved.progressClosedAt.toDate() instanceof Date);
  assert.equal(saved.progressRoster.months[thisMonth].closedAt.toMillis(),saved.progressClosedAt.toMillis());
  assert.equal(saved.initialInspectionDate,pastDate);
  assert.deepEqual(saved.stageHistory,closureHistory);
  console.log('PASS: two authenticated clients, transaction retry rejects a stale closure, reordered fields save after re-reading.');
  await deny(updateDoc(adminProject,{progressLegacyClosedMonth:pastMonth}));
  await deny(updateDoc(project,{status:'prog'}));
  await deny(updateDoc(adminProject,{progressClosedAt:new Date('2020-01-01')}));
  await deny(updateDoc(adminProject,{'progressRoster.baseline.name':'覆蓋歷史'}));
  await deny(updateDoc(adminProject,{schedule:[]}));
  await deny(updateDoc(adminProject,{progressMonths:{},progressWriteMonths:[pastMonth,thisMonth,futureMonth]}));
  await deny(updateDoc(adminProject,{['progressMonths.'+pastMonth+'.siteNote']:'覆蓋其他月',progressWriteMonths:[thisMonth]}));
  await deny(deleteDoc(adminProject));
  await allow(updateDoc(adminProject,{completionTypes:['工程完成'],initialInspectionDate:'2021-02-02'}));
  assert.equal((await getDoc(adminProject)).data().progressClosedAt.toMillis(),saved.progressClosedAt.toMillis());
  const order=doc(admin,'settings','designProjectOrder');
  await allow(adminApp.writeProgressOrder(['b','a']));
  await allow(adminApp.writeProgressOrder(['a','b'],pastMonth));
  await deny(updateDoc(doc(staff,'settings','designProjectOrder'),{['workOrderMonths.'+pastMonth]:['b','a'],workOrderWriteMonth:pastMonth}));
  await deny(updateDoc(order,{order:['a','b']}));
  assert.deepEqual((await getDoc(order)).data().order,['b','a']);
  const checkKey='monthly-check';
  await allow(staffApp.writeProgressCheckItems(checkKey,[{done:false}]));
  await allow(adminApp.writeProgressCheckItems(checkKey,[{done:true}],pastMonth));
  await deny(updateDoc(doc(staff,'checks',checkKey),{['progressCheckEdits.'+pastMonth]:[{done:false}],progressCheckWriteMonth:pastMonth}));
  await allow(staffApp.writeProgressCheckItems(checkKey,[{done:true,amount:'100'}]));
  const record=(await getDoc(doc(admin,'checks',checkKey))).data();
  assert.deepEqual(adminApp.progressCheckItems(checkKey,pastMonth,record),[{done:true}]);
  assert.deepEqual(record.items,[{done:true,amount:'100'}]);
  await allow(setDoc(doc(admin, 'meetingLogs', 'meet1_' + pastMonth + '-03'), meeting(pastMonth + '-03', '歷史新增')));
  await allow(deleteDoc(doc(admin, 'meetingLogs', 'meet1_' + pastMonth + '-03')));
  console.log('PASS: ' + checks + ' Firestore emulator permission operations and month isolation.');
} finally {
  await Promise.all(apps.map(deleteApp));
  await env.cleanup();
}
