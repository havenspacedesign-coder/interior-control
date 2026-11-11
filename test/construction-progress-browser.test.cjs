// Use an isolated headless browser context and the real local test app.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const origin = 'http://127.0.0.1:4180';
const dates = { september: '2026-09-02', october: '2026-10-02', next: '2026-10-03', november: '2026-11-02', novemberNext: '2026-11-03' };
const stage = '測試木作';
const fixture = `
window.progressTestFixture = {
  role(role){
    currentRole=role;
    currentUser={uid:'qa-'+role,displayName:'測試 '+role};
    renderActive();
  },
  seed(role,dates,stage){
    this.role(role);
    S.members=['manager','admin','staff','supervisor'].map(role=>({uid:'qa-'+role,name:'測試 '+role,role,status:'active'}));
    S.projects=[{id:'qa-site',name:'月份驗收案件',status:'prog',createdAt:'2026-09-01',siteNote:'舊版工地備註',
      schedule:Object.entries(dates).filter(([key])=>['september','october','november'].includes(key))
        .map(([key,date])=>({date,stage,label:stage,note:'原始排程 '+key}))}];
    S.meetingLogs=Object.fromEntries(Object.entries(dates).filter(([key])=>['september','october','november'].includes(key))
      .map(([key,date])=>['meet1_'+date,{rowId:'meet1',date,items:[{text:'原始會議 '+key,mentions:[]}]}]));
    S.dailyLogs=Object.fromEntries(S.members.map(member=>[member.uid+'_'+dates.october,{uid:member.uid,date:dates.october,text:'原始施工日誌'}]));
    S.privateNotes={work:{},personal:{[dates.october]:[{text:'原始個人記事'}]}};
    S.checks={}; S.tradeCategories=[{id:'qa-trade',name:'測試工班'}];
    S.projectTradeSelections={'qa-site':{'qa-trade':{none:true}}};
    S.bibleOrder=[...Array.from({length:16},(_,i)=>'測試設計 '+i),stage];
    S.bible={[stage]:{before:['確認歷史檢核'],during:[],after:[]}};
    renderActive(); saveLocalPreviewState();
  },
  read(){
    return structuredClone({project:S.projects.find(p=>p.id==='qa-site'),meetings:S.meetingLogs,
      logs:S.dailyLogs,notes:S.privateNotes,checks:S.checks});
  }
};`;

async function open(browser, role, mobile = false) {
  const context = await browser.newContext({ timezoneId: 'Asia/Taipei', viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 950 } });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname !== '/app/test-bootstrap.js') return route.continue();
    const response = await route.fetch({ maxRedirects: 0 });
    await route.fulfill({ response, body: (await response.text()) + fixture });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00+08:00'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.type() === 'confirm' ? dialog.accept() : (errors.push(dialog.message()), dialog.dismiss()));
  await page.goto(origin + '/test/index.html#progress');
  await page.locator('html[data-app-ready="true"]').waitFor({ state: 'attached' });
  await page.locator('#local-test-btn').click();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('interiorFocusedTestSession')), '1');
  await goToProgress(page);
  await page.evaluate(({ role, dates, stage }) => window.progressTestFixture.seed(role, dates, stage), { role, dates, stage });
  return { page, context, errors };
}

const read = page => page.evaluate(() => window.progressTestFixture.read());
const siteRow = page => page.locator('#panel-progress tr').filter({ has: page.locator('td.site-hd', { hasText: '月份驗收案件' }) });
const meet = (page, date, row = 'meet1') => page.locator('[data-meeting-cell="' + row + '|' + date + '"]');
const work = (page, date) => siteRow(page).locator('.ev-cell').nth(Number(date.slice(-2)) - 1);
const visible = locator => locator.waitFor({ state: 'visible' });
async function goToProgress(page) {
  await visible(page.locator('#app-screen'));
  if (await page.locator('.wk-lbl').isVisible()) return;
  const menu = page.locator('#mobile-menu-toggle');
  if (await menu.isVisible()) await menu.click();
  await page.locator('[data-tab="progress"]').click();
  await visible(page.locator('.wk-lbl'));
}
async function month(page, direction, target) {
  await page.locator('.nav-btn').nth(direction === -1 ? 0 : 1).click();
  await visible(page.locator('.wk-lbl').filter({ hasText: '2026年 ' + target + '月' }));
}
async function edit(locator, text) {
  await locator.fill(text);
  await locator.evaluate(element => element.blur());
}
async function move(page, from, to, payload) {
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  const source = await from.elementHandle();
  await source.dispatchEvent('dragstart', { dataTransfer: transfer });
  await transfer.evaluate((data, text) => { if (!data.getData('text/plain')) data.setData('text/plain', text); }, payload);
  await to.dispatchEvent('drop', { dataTransfer: transfer });
  await source.dispatchEvent('dragend', { dataTransfer: transfer });
  await source.dispose();
  await transfer.dispose();
}
async function check(page, predicate) {
  await page.waitForFunction(predicate, undefined, { timeout: 5000 });
}
async function editMeeting(page, date, text) {
  await meet(page, date).locator('.meet-chip').dblclick();
  await edit(meet(page, date).locator('input.meet-chip'), text);
  await visible(meet(page, date).getByText(text, { exact: true }));
}
async function editSchedule(page, date, text) {
  const field = work(page, date).locator('.ev-field');
  await field.dblclick();
  await edit(field, text);
  await visible(work(page, date).getByText(text, { exact: true }));
}
async function openChecklist(page, date) {
  await work(page, date).locator('.ev-chip').click();
  await visible(page.locator('#mo-content').getByText('確認歷史檢核', { exact: true }));
}
async function closeModal(page) {
  await page.locator('#mo-content').getByRole('button', { name: '關閉', exact: true }).click();
}

async function completion(browser) {
  const { page, context, errors } = await open(browser, 'manager');
  try {
    await page.locator('[data-tab="overview"]').click();
    const status = page.locator('#panel-overview tr').filter({ hasText: '月份驗收案件' }).locator('select.status-sel');
    await status.selectOption('done');
    await page.locator('#ct-3').check();
    await page.locator('#mo-content').getByRole('button', { name: '確定', exact: true }).click();
    await check(page, () => window.progressTestFixture.read().project.progressCompletedOn === '2026-11-11');
    await page.locator('[data-tab="progress"]').click();
    await visible(siteRow(page).getByText('完工', { exact: true }));
    assert.doesNotMatch(await siteRow(page).innerText(), /完工日期|2026-11-11/);
    await month(page, 1, 12);
    assert.equal(await siteRow(page).count(), 0);
    await month(page, -1, 11);
    await month(page, -1, 10);
    await visible(work(page, dates.october).getByText('原始排程 october'));
    await visible(meet(page, dates.october).getByText('原始會議 october'));
    await openChecklist(page, dates.october);
    assert.equal(await page.locator('#mo-content .ck-btn:enabled').count(), 2);
    await closeModal(page);
    await month(page, -1, 9);
    await visible(work(page, dates.september).getByText('原始排程 september'));
    await visible(meet(page, dates.september).getByText('原始會議 september'));
    await page.locator('[data-tab="overview"]').click();
    await page.locator('#panel-overview .stat[onclick*="toggleOverviewCompletedMode"]').click();
    await page.locator('#panel-overview [onclick*="showSiteReport"]').getByText('月份驗收案件').click();
    await visible(page.getByText(/實際完工日：2026-11-11/));
    await page.evaluate(() => window.progressTestFixture.role('staff'));
    assert.equal(await page.getByText('更改完工日期', { exact: true }).count(), 0);
    await page.evaluate(() => window.progressTestFixture.role('manager'));
    await page.getByText('更改完工日期', { exact: true }).click();
    await page.locator('#overview-completion-date').fill('2026-10-31');
    await page.getByRole('button', { name: '儲存完工日期', exact: true }).click();
    await visible(page.getByText(/實際完工日：2026-10-31/));
    await page.getByRole('button', { name: /返回案件總覽/ }).click();
    await page.locator('[data-tab="progress"]').click();
    await visible(page.locator('.wk-lbl').filter({ hasText: '2026年 11月' }));
    assert.equal(await siteRow(page).count(), 0);
    await month(page, -1, 10);
    await visible(siteRow(page).getByText('完工', { exact: true }));
    await visible(work(page, dates.october).getByText('原始排程 october'));
    await page.locator('[data-tab="overview"]').click();
    await status.selectOption('prog');
    const keep = page.getByRole('button', { name: '保留紀錄', exact: true });
    if (await keep.isVisible()) await keep.click();
    await check(page, () => window.progressTestFixture.read().project.status === 'prog');
    await page.locator('[data-tab="progress"]').click();
    await visible(siteRow(page));
    await month(page, 1, 12);
    await visible(siteRow(page));
    assert.equal((await read(page)).project.schedule.length, 3);
    assert.deepEqual(errors, []);
    console.log('PASS browser: complete on Nov 11, hide in December, September/October history, date correction, reopen.');
  } finally { await context.close(); }
}

async function employee(browser, role, mobile) {
  const { page, context, errors } = await open(browser, role, mobile);
  try {
    await editMeeting(page, dates.november, '當月可修改會議');
    await editSchedule(page, dates.november, '當月可修改排程');
    await move(page, work(page, dates.november).locator('.ev-chip'), work(page, dates.novemberNext), 'ev|qa-site|' + dates.november + '|0');
    await visible(work(page, dates.novemberNext).getByText('當月可修改排程'));
    await work(page, dates.november).locator('.add-ev-btn').dispatchEvent('click');
    await page.locator('.stage-search-item').filter({ hasText: stage }).dispatchEvent('click');
    await visible(work(page, dates.november).locator('.ev-chip'));
    await work(page, dates.november).locator('.ev-del').dispatchEvent('click');
    await work(page, dates.november).locator('.ev-chip').waitFor({ state: 'hidden' });
    await month(page, -1, 10);
    const historical = await read(page);
    await visible(page.getByText('歷史月份唯讀', { exact: true }));
    await visible(meet(page, dates.october).getByText('原始會議 october'));
    await visible(work(page, dates.october).getByText('原始排程 october'));
    assert.equal(await meet(page, dates.october).locator('[draggable], [ondblclick], input').count(), 0);
    assert.equal(await work(page, dates.october).locator('[draggable], .add-ev-btn, .ev-del').count(), 0);
    assert.equal(await siteRow(page).locator('textarea[readonly]').count(), 1);
    await page.evaluate(async ({ dates, stage }) => {
      const drop = text => {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData('text/plain', text);
        return new DragEvent('drop', { dataTransfer });
      };
      await window.mAdd('meet2', dates.october);
      await window.mSetCellText('meet1', dates.october, '被擋下');
      await window.mDelete('meet1', dates.october, 0);
      await window.mDrop(drop('meet|meet1|' + dates.october + '|0'), 'meet2', dates.november);
      await window.addEvFromStage('qa-site', dates.october, stage);
      await window.scheduleToggleStrike('qa-site', dates.october, 0);
      await window.removeEv('qa-site', dates.october, 0);
      await window.evDrop(drop('ev|qa-site|' + dates.october + '|0'), 'qa-site', dates.november);
      await window.saveProgressSiteNote('qa-site', '2026-10', '被擋下');
    }, { dates, stage });
    assert.deepEqual(await read(page), historical);
    await openChecklist(page, dates.october);
    assert.equal(await page.locator('#mo-content .ck-btn:disabled').count(), 2);
    await closeModal(page);
    const ownLog = page.locator('textarea.log-textarea[onblur*="qa-' + role + '"][onblur*="' + dates.october + '"]');
    assert.equal(await ownLog.count(), 1, role + ' should have an editable historical daily log');
    await edit(ownLog, '自己的歷史日誌已更新');
    assert.equal((await read(page)).logs['qa-' + role + '_' + dates.october].text, '自己的歷史日誌已更新');
    const privateCell = page.locator('[data-pn-cell="personal|' + dates.october + '"]');
    await privateCell.getByText('原始個人記事').dblclick();
    const note = privateCell.locator('input');
    await visible(privateCell.locator('input:focus'));
    await note.fill('自己的歷史記事已更新');
    await note.press('Enter');
    await visible(privateCell.getByText('自己的歷史記事已更新', { exact: true }));
    await month(page, -1, 9);
    await visible(work(page, dates.september).getByText('原始排程 september'));
    await visible(page.getByText('歷史月份唯讀', { exact: true }));
    await page.reload();
    await page.locator('html[data-app-ready="true"]').waitFor({ state: 'attached' });
    await goToProgress(page);
    await page.evaluate(role => window.progressTestFixture.role(role), role);
    const saved = await read(page);
    assert.equal(saved.logs['qa-' + role + '_' + dates.october].text, '自己的歷史日誌已更新');
    assert.equal(saved.notes.personal[dates.october][0].text, '自己的歷史記事已更新');
    assert.deepEqual(errors, []);
    console.log('PASS browser: ' + role + (mobile ? ' mobile' : ' desktop') + ', current editing, historical protections, own historical logs and notes.');
  } finally { await context.close(); }
}

async function administrator(browser) {
  const { page, context, errors } = await open(browser, 'admin');
  try {
    const before = await read(page);
    await month(page, -1, 10);
    await editMeeting(page, dates.october, '管理員歷史會議');
    await move(page, meet(page, dates.october).locator('.meet-chip'), meet(page, dates.next), 'meet|meet1|' + dates.october + '|0');
    await visible(meet(page, dates.next).getByText('管理員歷史會議'));
    await editMeeting(page, dates.october, '管理員新增歷史會議');
    const chip = meet(page, dates.october).getByText('管理員新增歷史會議');
    await chip.click();
    await page.keyboard.press('Delete');
    await chip.waitFor({ state: 'hidden' });
    await editSchedule(page, dates.october, '管理員歷史排程');
    await openChecklist(page, dates.october);
    await page.locator('#mo-content .ck-btn[title="完成"]').click();
    await check(page, () => window.progressTestFixture.read().checks['qa-site_測試木作']?.[0]?.done);
    await closeModal(page);
    await work(page, dates.next).locator('.add-ev-btn').click();
    await page.locator('.stage-search-item').filter({ hasText: stage }).click();
    await visible(work(page, dates.next).locator('.ev-chip'));
    await work(page, dates.next).locator('.ev-del').dispatchEvent('click');
    await work(page, dates.next).locator('.ev-chip').waitFor({ state: 'hidden' });
    await edit(siteRow(page).locator('textarea'), '只修改十月備註');
    await check(page, () => window.progressTestFixture.read().project.progressMonths['2026-10'].siteNote === '只修改十月備註');
    await month(page, -1, 9);
    await visible(meet(page, dates.september).getByText('原始會議 september'));
    await visible(work(page, dates.september).getByText('原始排程 september'));
    assert.equal(await siteRow(page).locator('textarea').inputValue(), '舊版工地備註');
    await month(page, 1, 10);
    await visible(work(page, dates.october).getByText('管理員歷史排程'));
    await month(page, 1, 11);
    await visible(meet(page, dates.november).getByText('原始會議 november'));
    await visible(work(page, dates.november).getByText('原始排程 november'));
    const after = await read(page);
    assert.deepEqual(after.project.schedule, before.project.schedule);
    assert.deepEqual(after.logs, before.logs);
    assert.deepEqual(errors, []);
    console.log('PASS browser: administrator historical create, edit, move, delete, checklist access, independent months and legacy records.');
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [label, test] of [
      ['completion', completion], ['staff desktop', b => employee(b, 'staff', false)],
      ['staff mobile', b => employee(b, 'staff', true)],
      ['supervisor desktop', b => employee(b, 'supervisor', false)],
      ['supervisor mobile', b => employee(b, 'supervisor', true)], ['administrator', administrator]
    ]) {
      try{await test(browser);}
      catch(error){console.error(label, error);process.exitCode=1;}
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
