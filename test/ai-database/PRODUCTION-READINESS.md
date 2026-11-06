# AI 資料庫：正式 Firebase 啟用前檢查

檢查日期：2026-11-06。此文件區分程式設定、模擬器驗證與尚未取得的正式設定；不是正式環境驗收通過證明。

## 本次已確認

- 現有 APP 設定指向 Firebase 專案 `have000`、bucket `have000.firebasestorage.app`。設定中的名稱不代表已驗證 bucket、計費或線上規則。
- AI 資料庫仍位於 `app/features/ai-database/`，`app/loader.js` 僅在 `unifiedTestMode` 載入入口。正式 `index.html` 與正式功能 manifest 沒有新增 AI 入口。
- AI Firebase adapter 固定 `demo-haven-ai`、localhost 模擬器，無法改連正式 Firebase；一般本機模式另用 IndexedDB。雲端正式 adapter 尚未開放。
- 19 項資料驗收通過；角色規則另已驗證兩位管理員共用資料，staff、resigned、未登入者被拒絕。這些結果僅適用模擬器。
- GitHub 的既有 main commit 有 Vercel 成功部署狀態。本次改推 `feature/ai-database-phase1`，並以 `vercel.json` 停用該分支 Git 自動部署；不推 main、不執行 deploy。

## 無法確認的正式設定

本次唯讀開啟 Firebase Console 的 Firestore Rules 與 Storage 頁面，兩者都顯示「專案不存在，或是你沒有列出專案中應用程式的權限」。因此未取得現行發布規則、成員角色資料、安全 IAM、bucket CORS、計費狀態。不能判定這些設定缺少，也不能宣稱正式員工／管理員隔離通過。

## 下一步操作順序

1. **取得唯讀檢查資料**：用有 `have000` 專案權限的帳戶登入 Firebase Console。先匯出或複製現行 Firestore Rules、Storage Rules；確認實際 bucket、Storage 啟用／計費狀態。不要先按發布，不要直接以本目錄 demo rules 覆蓋正式規則。
2. **檢查角色來源**：確認正式 `members/{uid}` 的 role/status 實際欄位值；只有受信任的管理程序可授予 manager/admin，一般員工不可自行升權。確認離職／停權者也被後端拒絕。Firebase Console 專案管理權限與 APP 成員角色是兩種不同權限。
3. **準備隔離雲端驗證**：先選定獨立 Firebase 測試專案或經審核的隔離集合及檔案前綴；只放虛構資料。整合真實 Firebase Auth 身分後再測。固定的模擬器帳號不可沿用到正式登入。
4. **合併而非取代規則**：逐條審核新 AI 集合及檔案前綴的 read/list/create/update/delete。僅 active 管理員可存取；員工、未登入、離職帳戶一律拒絕；檢查既有遞迴萬用 allow 是否同時放行。保留原 APP 的既有規則，不改動業務集合。規則需先驗證後才由管理員在 Console 發布，或另行授權部署。
5. **Storage 跨服務權限**：若 Storage Rules 查詢 Firestore 的 members/cases，依 Console 提示完成必要的跨服務授權。確認檔案 MIME、大小、案件路徑及禁止原路徑覆寫；預覽和下載仍須授權，不應改成公開 bucket 或分享永久公開下載網址。
6. **CORS**：先讀取 bucket 現況，再按實際網站來源設定，不能推測已缺少 CORS。若採用 getBlob 跨來源讀檔，僅允許已核准的測試／正式 origin 與必要方法及標頭。通常使用 Google Cloud Shell／gcloud 管理 bucket CORS，並非在 Firebase Rules 加 allow 解決；CORS 不能取代驗證及權限規則。
7. **真實雲端驗收**：用虛構 PDF／照片測兩位管理員、一般員工、未登入、離職帳戶。驗證直接 Firebase 存取、無入口直接網址、跨裝置讀寫、角色撤銷、檔案替換失敗與下載；另以使用者手動方式驗證 PDF 預覽（內建瀏覽器的 Blob 新視窗預覽曾遭政策阻擋，尚未通過）。
8. **最後才啟用**：補上硬中斷孤立檔案清理、備份／保留與大量刪除處理方案。正式設定及角色驗收全部完成且經使用者確認後，才能另行開放正式 adapter／入口及上傳真實報價、施工圖、照片。本次不做此步。

## 參考

- [Vercel 分支部署開關](https://vercel.com/docs/project-configuration/git-configuration)
- [Firebase 規則管理與跨服務授權](https://firebase.google.com/docs/rules/manage-deploy)
- [Storage Rules 權限條件](https://firebase.google.com/docs/storage/security/rules-conditions)
- [Storage 原檔下載與 CORS](https://firebase.google.com/docs/storage/web/download-files)
- [Google Cloud Storage CORS 設定](https://docs.cloud.google.com/storage/docs/using-cors)

本次發布準備實際讀取：AGENTS.md、app/loader.js 的 diff、app/shared/firebase-config.js、vercel.json、AI firebase-store.js、兩份 demo rules、測試 .gitignore／驗收報告／結果，以及 GitHub main 狀態與相關 workflow 部署條件。目的為驗證環境隔離、角色規則及自動部署風險，沒有擴大讀取其他功能業務程式。

本次新增此文件，修改 vercel.json 的單一分支部署開關；提交其餘既有 AI 模組、loader 入口與驗收檔案。未修改正式 HTML、Firebase 正式設定或其他功能。
