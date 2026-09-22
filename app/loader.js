import { mountAppShell } from './shared/shell.js';
import { MODULE_ORDER, FEATURE_MODULES, SHARED_MODULES } from './module-manifest.js';

const feature = document.documentElement.dataset.appFeature || '';
window.__APP_FEATURE_TEST__ = feature;
mountAppShell(feature);

// Every production and focused-test page resolves shared data assets from the
// application root, regardless of the page's own directory.
const base = new URL('../', import.meta.url);
window.__APP_BASE_URL__ = base.href;

const [firebaseApp, firestore, firebaseAuth, firebaseStorage] = await Promise.all([
  import('https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js'),
  import('https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/11.9.0/firebase-storage.js')
]);

const requested = feature ? new Set([...SHARED_MODULES, ...(FEATURE_MODULES[feature] || [])]) : new Set(MODULE_ORDER);
const modulePaths = MODULE_ORDER.filter(path => requested.has(path));
if (feature) modulePaths.push('app/test-bootstrap.js');

const sources = await Promise.all(modulePaths.map(async path => {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw new Error('無法載入模組：' + path);
  return '\n// # source: ' + path + '\n' + await response.text() + '\n';
}));

const bindings = {
  initializeApp:firebaseApp.initializeApp,
  getFirestore:firestore.getFirestore, collection:firestore.collection, doc:firestore.doc,
  fbAddDoc:firestore.addDoc, fbUpdateDoc:firestore.updateDoc, fbDeleteDoc:firestore.deleteDoc,
  fbSetDoc:firestore.setDoc, fbGetDoc:firestore.getDoc, onSnapshot:firestore.onSnapshot,
  serverTimestamp:firestore.serverTimestamp, fbGetDocs:firestore.getDocs, fbWriteBatch:firestore.writeBatch,
  fbRunTransaction:firestore.runTransaction, query:firestore.query, where:firestore.where,
  getAuth:firebaseAuth.getAuth, GoogleAuthProvider:firebaseAuth.GoogleAuthProvider,
  signInWithPopup:firebaseAuth.signInWithPopup, signInWithRedirect:firebaseAuth.signInWithRedirect,
  getRedirectResult:firebaseAuth.getRedirectResult, fbSignOut:firebaseAuth.signOut,
  onAuthStateChanged:firebaseAuth.onAuthStateChanged,
  getStorage:firebaseStorage.getStorage, storageRef:firebaseStorage.ref,
  uploadBytes:firebaseStorage.uploadBytes, getDownloadURL:firebaseStorage.getDownloadURL,
  deleteObject:firebaseStorage.deleteObject
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
try {
  await new AsyncFunction(...Object.keys(bindings), sources.join('\n'))(...Object.values(bindings));
  document.documentElement.dataset.appReady = 'true';
} catch (error) {
  console.error('APP 模組載入失敗', error);
  document.body.innerHTML = '<main style="padding:24px;font-family:sans-serif"><h1>APP 載入失敗</h1><p>請查看瀏覽器 Console 取得詳細資訊。</p></main>';
}

if (!feature && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => console.error('Service worker registration failed:', error)));
}
