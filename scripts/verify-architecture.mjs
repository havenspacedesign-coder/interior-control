import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { MODULE_ORDER as moduleOrder, FEATURE_MODULES as features, SHARED_MODULES as shared } from '../app/module-manifest.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(root, path), 'utf8');
const bindingNames = ['initializeApp','getFirestore','collection','doc','fbAddDoc','fbUpdateDoc','fbDeleteDoc','fbSetDoc','fbGetDoc','onSnapshot','serverTimestamp','fbGetDocs','fbWriteBatch','fbRunTransaction','query','where','getAuth','GoogleAuthProvider','signInWithPopup','signInWithRedirect','getRedirectResult','fbSignOut','onAuthStateChanged','getStorage','storageRef','uploadBytes','getDownloadURL','deleteObject'];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function compile(label, paths, includeTestBootstrap = false) {
  const ordered = moduleOrder.filter(path => new Set(paths).has(path));
  const source = ordered.map(read).join('\n') + (includeTestBootstrap ? '\n' + read('app/test-bootstrap.js') : '');
  new AsyncFunction(...bindingNames, source);
  console.log(`syntax ok: ${label} (${ordered.length} modules)`);
  return source;
}

const productionSource = compile('production', moduleOrder);
for (const [feature, paths] of Object.entries(features)) {
  compile(`test/${feature}`, [...shared, ...paths], true);
}

const index = read('index.html');
if (index.length > 5000) throw new Error('index.html is no longer a thin entry document');
if (/<style\b/i.test(index) || /onclick=/i.test(index)) throw new Error('index.html still contains feature CSS or event logic');
if (!index.includes('./app/loader.js')) throw new Error('index.html does not load the modular entry');

const testFiles = ['home.html','project-overview.html','design-progress.html','construction-progress.html','construction-guide.html','vendors.html','members.html','b1f.html'];
for (const file of testFiles) {
  const content = read(`test/${file}`);
  if (!content.includes('../app/loader.js')) throw new Error(`${file} does not use the shared loader`);
  if (content.length > 4000) throw new Error(`${file} contains a copied application document`);
  for (const match of content.matchAll(/(?:href|src)="([^"?#]+)"/g)) {
    const target = join(root, 'test', match[1]);
    if (!existsSync(target)) throw new Error(`${file} references missing asset: ${match[1]}`);
  }
}

const testIndex = read('test/index.html');
if (/app\/loader\.js|app\/features\//.test(testIndex)) throw new Error('test/index.html must remain a navigation-only page');
if (!testIndex.includes('./home.html')) throw new Error('test/index.html must direct users to test/home.html');
const shellSource = read('app/shared/shell.js');
for (const file of testFiles) {
  if (!shellSource.includes(`'${file}'`)) throw new Error(`shared test navigation is missing ${file}`);
}

if (!productionSource.includes("const LOCAL_PREVIEW_STATE_KEY='localPreviewStateV1'")) throw new Error('local preview storage key missing');
if (!productionSource.includes("doc(db,'b1fStores',B1F_SHARED_DOC)")) throw new Error('B1F shared Firebase document path changed');
if (!productionSource.includes("collection(db,'projects')")) throw new Error('projects collection path missing');

const indexHistory = execFileSync('git', ['rev-list', 'HEAD', '--', 'index.html'], {cwd:root, encoding:'utf8'}).trim().split(/\s+/);
let legacyIndex = '';
for (const commit of indexHistory.slice(1)) {
  const candidate = execFileSync('git', ['show', `${commit}:index.html`], {cwd:root, encoding:'utf8'});
  if (candidate.length > 100000) {
    legacyIndex = candidate;
    break;
  }
}
if (!legacyIndex) throw new Error('legacy monolithic index.html was not found in Git history');
const collectLiteralValues = (source, pattern) => [...source.matchAll(pattern)].map(match => match[2]).sort();
const compareLiteralSets = (label, pattern) => {
  const before = [...new Set(collectLiteralValues(legacyIndex, pattern))];
  const after = [...new Set(collectLiteralValues(productionSource, pattern))];
  if (before.join('\n') !== after.join('\n')) {
    throw new Error(`${label} changed during modularization\nbefore: ${before.join(', ')}\nafter: ${after.join(', ')}`);
  }
};
compareLiteralSets('localStorage literal keys', /localStorage\.(?:getItem|setItem|removeItem)\(\s*(['"`])([^'"`]+)\1/g);
compareLiteralSets('Firebase collection/document roots', /(?:collection|doc)\(\s*db\s*,\s*(['"])([^'"]+)\1/g);

const serviceWorker = read('service-worker.js');
for (const path of moduleOrder) {
  if (!serviceWorker.includes(`./${path}`)) throw new Error(`service worker is missing modular asset: ${path}`);
}
for (const match of serviceWorker.matchAll(/'\.\/([^']*)'/g)) {
  if (match[1] && !existsSync(join(root, match[1]))) throw new Error(`service worker references missing asset: ${match[1]}`);
}

console.log('architecture verification ok');
