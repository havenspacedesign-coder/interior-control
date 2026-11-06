# AI 資料庫第一階段：隔離測試版

尚未部署，正式入口、正式導覽、既有 `projects` 與右下角助理均未變更。唯一共用修改為 `app/loader.js` 的測試專用載入分支。測試入口維持 `/test/index.html` 單頁切換。

## 檔案清單

修改：`app/loader.js`（測試功能辨識及測試專用模組載入，共三行新增、一行調整）。

新增 `app/features/ai-database/`：

| 檔案 | 職責 |
| --- | --- |
| `test-integration.js` | 測試導覽、路由與權限接入 |
| `index.js` | 事件、表單流程、畫面狀態與同步 |
| `navigation.js` | 分類及案件導覽 |
| `case-editor.js` | 案件基本資料、檔案與 AI 預留區塊 |
| `file-view.js` | 檔案卡片及照片備註 |
| `files.js` | 原始檔驗證、上傳、替換、預覽下載與清理 |
| `model.js` | 資料結構、欄位驗證、分類／案件操作與排序 |
| `store.js` | 獨立 IndexedDB 本機持久保存 |
| `firebase-store.js` | 隔離 Firestore／Storage／Authentication 讀寫 |
| `module-registry.js` | 分類內容模組登錄 |
| `learning-schema.js` | 未來分析、問答、修改紀錄及知識結構 |
| `ui-utils.js` | 顯示格式與文字跳脫 |
| `ai-database.css` | 沿用 APP 色彩的功能專屬樣式 |

新增 `test/ai-database/`：本 README、`.gitignore`、`firebase.json`、`firestore.rules`、`storage.rules`、`package.json`、`package-lock.json`、`start-emulators.ps1`、`seed.mjs`、`fixtures.mjs`、`model.test.mjs`、`rules.test.mjs`、`firebase-store.test.mjs`。執行時的套件、Java 工具、測試原始檔、模擬器資料及日誌皆忽略版控。

本次為確認接入而讀取既有 `app/loader.js`、`test/mobile-preview.js`、共用 `base.css`／`common.css` 與專案工作規則；未修改其他功能。

## 開啟操作畫面

本機網站使用原有啟動方式（已啟動則不用重啟）：

```powershell
node scripts/serve-local.mjs 4180
```

- 本機瀏覽器持久預覽：`http://127.0.0.1:4180/test/index.html#ai-database`
- Firebase 隔離共用測試：`http://127.0.0.1:4180/test/index.html?aiStore=emulator#ai-database`
- 第二位測試管理員：在另一個分頁開啟 `http://127.0.0.1:4180/test/index.html?aiStore=emulator&aiTestUser=admin-b#ai-database`
- 後端員工拒絕測試：將 `aiTestUser` 改為 `staff`；離職管理員改為 `resigned`。未通過後端檢查時清空案件畫面並隱藏 AI 導覽。

一般開啟測試頁後，管理員可點上方「AI 資料庫」。本機模式使用獨立 IndexedDB 保存 metadata 及原始 Blob，支援重新整理、同瀏覽器分頁同步；不等於跨裝置同步。Firebase 模式使用真正的 Firebase SDK 連到隔離模擬器，無法連線時顯示錯誤，絕不改連正式資料庫。

## Firebase 模擬器

需求：Node、npm、Java 21。套件只安裝在本目錄，沒有改變正式 APP 的相依套件。

```powershell
cd test/ai-database
npm ci --ignore-scripts
.\start-emulators.ps1
```

另開終端機，在同一個目錄執行一次 `node seed.mjs`，建立四個測試帳號。不會清空已存在的案件或檔案。`admin-a`、`admin-b` 使用 manager/admin 角色；其餘是 staff 與 resigned。帳密僅屬於 demo 模擬器，不能用於正式登入。

服務全部綁定 127.0.0.1：Authentication 9199、Firestore 8181、Storage 9299、管理畫面 4401。專案 ID 固定 `demo-haven-ai`，不接受正式專案設定。若電腦已具備本次建立的 `.runtime/java21`，啟動腳本會只在該程序使用它，不修改系統 Java。

正常按 Ctrl+C 關閉模擬器時，資料匯出至忽略版控的 `emulator-data/`；下次用啟動腳本會匯入。不會自動清空資料。需要額外保存時：

```powershell
node node_modules/firebase-tools/lib/bin/firebase.js emulators:export emulator-data --project demo-haven-ai --config firebase.json --force
```

## 資料分離

Firestore：`aiDbTestCategories`、`aiDbTestCases`、`aiDbTestFiles`、`aiDbTestMeta`。未來 AI 結構預留 `aiDbTestAnalysisRuns`、`aiDbTestQuestions`、`aiDbTestAnswerRevisions`、`aiDbTestKnowledge`；本階段禁止客戶端捏造 AI 學習內容。

Storage：`aiDatabaseTest/cases/{caseId}/{fileId}`。PDF 三種類型各一份有效原始檔，替換會使用新的 fileId；照片可多張，每張獨立備註及替換。Firestore 保存原檔名稱、種類、大小、MIME、path、上傳時間與人員。伺服器另存 `serverUpdatedAt`。原始檔不使用公開 download token URL，預覽／下載透過通過權限檢查的 Blob。

表單及檔案更新增加 `contentRevision`。`learning-schema.js` 定義來源版本、推測／確認狀態、批次、統一主要答案、回答者、修改紀錄與來源刪除標示。此階段不呼叫 GPT、不解析 PDF、不產生任何假 AI 問答。

分類的 `moduleType` 使用 `module-registry.js` 決定 editor；自訂新分類預設 `blank`，不會自動生成案件表單。分類與案件可拖曳排序，或用 Alt＋上下鍵輔助。排序以穩定 ID 與 sortOrder 保存。讀寫使用 revision 檢查，衝突會拒絕並要求重新載入，避免覆蓋另一位管理員的修改。

刪除案件／分類需再次輸入「刪除」，說明原始檔與相關知識影響範圍。模型支援保留已確認、經管理員檢查不含應刪個資的公司通用知識，並清除可驗證原檔參照與案件名稱、標示原案件已刪除。真正的 AI 知識尚未啟用，因此本階段沒有此類正式資料。第二階段需由受控後端處理知識寫入／保留／稽核，不能直接解除目前的 client write 禁止規則。

檔案替換及刪除先提交 metadata，保存待清理路徑，之後清理原始檔。失敗的路徑持久保留，可按「重試檔案清理」。上傳後 metadata 寫入失敗會嘗試移除未掛載檔案，清理失敗明確回報路徑；生產接入前仍需設置伺服器孤立檔案清理作業，涵蓋上傳途中斷電或關閉瀏覽器。

## 測試

```powershell
node model.test.mjs
node rules.test.mjs
node firebase-store.test.mjs
node acceptance.test.mjs
```

第一項測試純邏輯及真實 IndexedDB 介面的 fake-indexeddb。後兩項需模擬器已啟動且已 seed；測試使用同個 demo 專案的唯一測試 ID，僅清理自己建立的測試案件，不清空操作畫面資料。覆蓋角色權限、Blob、兩管理員共用、衝突拒絕、替換清理、案件及知識刪除政策。`node fixtures.mjs` 可產生供 UI 測試使用的 PDF／PNG。

`acceptance.test.mjs` 另執行完整四類檔案、替換失敗、並行交易及原有資料前後比對，產生 `acceptance-results.json`。本階段完整驗收結果、修正與正式環境待辦見 [ACCEPTANCE.md](./ACCEPTANCE.md)。規則測試的 revision 防護另使用隔離的 Firestore-only demo namespace，不會對操作畫面的協調文件嘗試刪除。

2026-11-06 本次驗證結果：上述三組測試均通過。畫面實測分類新增／改名／空白模組、分類及案件滑鼠拖曳、鍵盤排序、案件新增及修改、欄位保存、PDF 上傳及下載、照片上傳／備註／重新載入後顯示、第二位管理員讀取相同案件與排序、員工拒絕畫面、刪除提醒視窗（取消後保留測試資料）、既有 B1F 切換。PDF 新視窗預覽受內建瀏覽器安全政策阻擋，未繞過限制，需使用者手動驗收；原始 PDF 下載及儲存位元組檢查已通過。沒有進行正式 Firebase 或正式多裝置雲端驗收。

## 正式接入前仍須設定

1. 取得現有 Firestore／Storage 線上規則並合併審查。此處規則是獨立 demo 規則，不能直接覆蓋正式規則。
2. 確認 members 的 role/status 只能由受信任管理流程修改；員工不可自行升權。
3. 確認 Storage 透過 Firestore 查權限所需的跨服務授權，以及檔案容量、CORS、保留與備份政策。
4. 確認沒有其他寬鬆 allow 規則同時放行 AI 資料與檔案。
5. 另行驗收真正雲端測試環境的跨裝置存取、角色撤銷、網路中斷及檔案預覽。模擬器成功不代表正式設定已完成。
6. 經使用者確認後，才規劃正式入口與正式資料集合；不得把本次測試帳號、模擬器配置或資料直接當正式部署。
