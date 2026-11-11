import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const projects = await read('app/shared/projects.js');
const dataSource = await read('app/shared/project-progress.js');
const dates = projects.slice(projects.indexOf('function projectStageToday'), projects.indexOf('function projectStageInitial'));
const date = '2026-11-11';
const october = '2026-10';
const november = '2026-11';
const december = '2026-12';
const legacy = {
  id: 'site', name: '驗證工地', status: 'done', siteNote: '原始共用備註',
  schedule: [{ date: '2026-10-15', note: '十月工地紀錄', label: '木作' }, { date, note: '十一月工地紀錄' }],
  stageHistory: { segments: [{ status: 'prog', start: '2026-09-01', end: date }, { status: 'done', start: date, end: null }] }
};

function load(extra = {}, source = '') {
  return new Function(...Object.keys(extra), dates + dataSource + source +
    '\nreturn { progressCompletedOn, progressProjectVisible, progressCanEditDate, progressMonthSchedule, progressAllSchedule, progressMonthNote, writeProgressMonths, ...(typeof renderWeekView === "function" ? {renderWeekView} : {}) };')(...Object.values(extra));
}

const model = load();
assert.equal(model.progressCompletedOn(legacy), date);
for (const month of ['2026-09', october, november]) assert.equal(model.progressProjectVisible(legacy, month), true);
assert.equal(model.progressProjectVisible(legacy, december), false);
assert.equal(model.progressProjectVisible({ ...legacy, progressCompletedOn: '2026-10-31' }, november), false);
assert.equal(model.progressProjectVisible({ ...legacy, status: 'prog' }, december), true);
assert.equal(model.progressProjectVisible({ ...legacy, stageHistory: null, contractEnd: '2026-09-01' }, december), true);
assert.equal(model.progressCompletedOn({ ...legacy, stageHistory: { partial: true, segments: [legacy.stageHistory.segments[1]] } }), '');
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
    S: { projects: [legacy], dateColors: {}, members: [], meetingLogs: {
      ['meet1_' + day]: { items: [{ text: '歷史會議紀錄', mentions: [] }] }
    } },
    getWeekDates: () => [viewing], today: () => now, fmtDay: () => day, isSameDay: () => false,
    sortDesignProjs: x => x, selectedTag: null, openPicker: null, tc: () => '', sc: () => '',
    resolveBibleStage: x => x, pendingCount: () => 0, scheduleCellIsSelected: () => false,
    scheduleCellIsEditing: () => false, displayStageName: x => x, escAttr: x => x, pendBadge: () => '',
    MEETING_ROWS: [{ id: 'meet1', name: '客戶會議' }], meetingSelected: {}, meetingEditing: null,
    normalizeLinkedItem: x => x, markableMembersList: () => [], renderItemText: x => x.text,
    isAdmin: () => ['admin', 'manager'].includes(role)
  }, progress.slice(progress.indexOf('function renderWeekView(')));
  return fixture.renderWeekView(project => fixture.progressProjectVisible(project, month), month);
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
const { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, writeBatch } = require('firebase/firestore');
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
      progressMonths: { [pastMonth]: { siteNote: '歷史月備註' } }
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
  const staff = accounts.get('staff').db;
  const project = doc(staff, 'projects', 'progress-site');
  await deny(updateDoc(project, { status: 'done', progressCompletedOn: pastDate }));
  await allow(updateDoc(project, { status: 'done', progressCompletedOn: today }));
  await deny(updateDoc(project, { status: 'prog' }));
  const admin = accounts.get('admin').db;
  await allow(updateDoc(doc(admin, 'projects', 'progress-site'), { progressCompletedOn: pastDate }));
  await allow(setDoc(doc(admin, 'meetingLogs', 'meet1_' + pastMonth + '-03'), meeting(pastMonth + '-03', '歷史新增')));
  await allow(deleteDoc(doc(admin, 'meetingLogs', 'meet1_' + pastMonth + '-03')));
  console.log('PASS: ' + checks + ' Firestore emulator permission operations and month isolation.');
} finally {
  await Promise.all(apps.map(deleteApp));
  await env.cleanup();
}
