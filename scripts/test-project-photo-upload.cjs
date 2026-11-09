const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'app/shared', name), 'utf8');
const projects = read('projects.js');
const core = read('core.js');
const elements = {
  modal: { style: { display: 'none' } },
  'mo-content': { classList: new Set(), innerHTML: '' },
};
elements['mo-content'].classList.remove = elements['mo-content'].classList.delete;
elements['mo-content'].classList.contains = elements['mo-content'].classList.has;
const calls = { uploads: [], writes: [], alerts: [], deletes: [] };
const existing = { id: 'older-photo', url: 'https://example.test/older.png' };
const concurrent = { id: 'concurrent-photo', url: 'https://example.test/concurrent.png' };
const context = {
  console, setInterval: () => 0, document: { addEventListener() {} },
  currentUser: { uid: 'member-1' }, currentRole: 'staff',
  selectedProjectDetailId: '', selectedProjectDetailPhotoId: '', selectedProjectDetailPhotoBlob: null,
  localTestMode: false, db: {}, storage: {},
  S: { projects: [], members: [], projectTradeSelections: {}, tradeCategories: [] },
  $: id => elements[id],
  statusInfo: () => ({ l: '施工中' }), escAttr: String,
  setSyncing() {}, setSynced() {}, setOffline() {},
  alert: message => calls.alerts.push(message),
  doc: (_db, collection, id) => ({ collection, id }),
  storageRef: (_storage, name) => name,
  uploadBytes: async (name, file, metadata) => calls.uploads.push({ name, file, metadata }),
  getDownloadURL: async name => 'https://example.test/' + name,
  deleteObject: async name => calls.deletes.push(name),
  fbRunTransaction: async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => ({ photos: [existing, concurrent] }) }),
    update: (ref, data) => calls.writes.push({ ref, data }),
  }),
};
context.window = context;
vm.createContext(context);
vm.runInContext(core.match(/^function (?:isAdmin|canEditProjects)\(.*$/gm).join('\n'), context);
vm.runInContext(projects, context);
context.renderProjectDesignReadOnly = () => '';

function setMember(role, status = 'active') {
  context.currentRole = role;
  context.S.members = [{ id: 'member-1', role, status }];
  context.S.projects = [{ id: 'case-1', status: 'prog', photos: [existing] }];
  calls.uploads.length = calls.writes.length = calls.alerts.length = 0;
}

async function main() {
  const photo = { name: 'site photo.jpg', type: 'image/jpeg', size: 1024 };
  const paths = new Set();
  for (const role of ['admin', 'manager', 'supervisor', 'staff']) {
    setMember(role);
    await context.uploadProjectPhotos('case-1', [photo], false);
    assert.equal(calls.uploads.length, 1, role);
    const upload = calls.uploads[0];
    assert.match(upload.name, /^projectPhotos\/case-1\/photo-\d+-[a-z0-9]+-site_photo\.jpg$/);
    assert.equal(upload.metadata.contentType, 'image/jpeg');
    paths.add(upload.name);
    assert.equal(calls.writes.length, 1);
    assert.deepEqual(calls.writes[0].ref, { collection: 'projects', id: 'case-1' });
    const { data } = calls.writes[0];
    assert.deepEqual(Object.keys(data), ['photos']);
    assert.deepEqual(Array.from(data.photos.slice(0, 2), item => item.id), [existing.id, concurrent.id]);
    assert.equal(data.photos[2].uploadedBy, 'member-1');
  }
  assert.equal(paths.size, 4);

  for (const [role, status] of [['staff', 'resigned'], ['admin', 'resigned'], ['pending', 'active']]) {
    setMember(role, status);
    await context.uploadProjectPhotos('case-1', [photo], false);
    assert.equal(calls.uploads.length, 0);
    assert.equal(calls.writes.length, 0);
  }
  setMember('staff');
  context.S.members = [];
  await context.uploadProjectPhotos('case-1', [photo], false);
  assert.equal(calls.uploads.length, 0);
  setMember('staff');
  context.currentUser = null;
  await context.uploadProjectPhotos('case-1', [photo], false);
  assert.equal(calls.uploads.length, 0);
  context.currentUser = { uid: 'member-1' };

  setMember('staff');
  for (const invalid of [{ ...photo, size: 10 * 1024 * 1024 }, { ...photo, type: 'application/pdf' }]) {
    await context.uploadProjectPhotos('case-1', [invalid], false);
  }
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.alerts.length, 2);
  await context.deleteProjectPhoto('case-1', existing.id);
  assert.equal(calls.deletes.length, 0);

  setMember('supervisor');
  context.showProjectDetail('case-1');
  const uploadHandler = elements['mo-content'].innerHTML.match(/onchange="(uploadProjectPhotos\([^"]+)"/)[1];
  assert.match(uploadHandler, /uploadProjectPhotos\(&quot;case-1&quot;,this.files,false\)/);
  assert.doesNotMatch(elements['mo-content'].innerHTML, /showEditProject\(/);
  const input = { files: [photo], value: 'site photo.jpg' };
  let uploadFinished;
  new Function('uploadProjectPhotos', uploadHandler.replace(/&quot;/g, '"'))
    .call(input, (...args) => { uploadFinished = context.uploadProjectPhotos(...args); });
  await uploadFinished;
  assert.equal(input.value, '');
  assert.match(elements['mo-content'].innerHTML, /site photo\.jpg/);
  setMember('supervisor', 'resigned');
  context.showProjectDetail('case-1');
  assert.doesNotMatch(elements['mo-content'].innerHTML, /uploadProjectPhotos\(/);

  console.log('PASS: four active roles, denied roles, upload format and path, photo-only write, concurrent photo preservation, supervisor entry, existing delete gate.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
