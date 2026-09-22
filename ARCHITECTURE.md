# APP 模組化架構

正式入口仍為 `index.html`。它只保留 PWA／樣式連結與 `app/loader.js`，不再存放完整功能。`app/module-manifest.js` 明確列出正式版載入順序、八個測試頁所需模組及必要的跨模組依賴；`app/shared/shell.js` 建立原有登入、導覽、頁面容器、Modal 與 AI 面板。

## 八大功能與測試頁

`test/index.html` 是輕量入口，會直接導向 `test/home.html`。八個獨立測試頁共用正式 APP 的 shell 與完整導覽列；點擊導覽項目時會前往另一個獨立測試頁，每頁仍只載入當前功能與必要共用模組。

| 功能 | 正式功能程式 | 獨立測試頁 |
| --- | --- | --- |
| 首頁 | `app/features/home/` | `test/home.html` |
| 案件總覽 | `app/features/project-overview/` | `test/project-overview.html` |
| 設計進度 | `app/features/design-progress/` | `test/design-progress.html` |
| 工程進度＆日誌 | `app/features/construction-progress/` | `test/construction-progress.html` |
| 施工寶典 | `app/features/construction-guide/` | `test/construction-guide.html` |
| 廠商資訊 | `app/features/vendors/` | `test/vendors.html` |
| 成員管理 | `app/features/members/` | `test/members.html` |
| B1F 商城 | `app/features/b1f/` | `test/b1f.html` |

`feature/b1f-wip` 另載入 `app/features/b1f/site-materials.js`，保存尚未完成的工地用料單、系統五金預估與其他叫料流程；`test/b1f.html` 與正式入口共用這個 B1F 模組，沒有測試版副本。

## 首頁子模組

- `index.js`：首頁網格、模組管理與主要渲染。
- `growth-list.js`：計畫性成長清單。
- `recommendations.js`：推薦分享。
- `message-board.js`：留言板。
- `announcements.js`：公司公告。
- `company-duty.js`：公司值日／掃地。
- `daily-joke.js`：每日笑話。
- `daily-quiz.js`、`quiz-bank.js`：每日猜題與題庫。
- `daily-nonsense.js`：每日一句廢話。
- `haven-news.js`：有隅特報與新聞版面。
- `home.css`、`home-widgets.css`、`haven-news.css`：首頁專用樣式。

## 工程進度＆日誌子模組

- `index.js`：工程進度主畫面、月份／週視圖與記事本。
- `daily-logs.js`：每日施工日誌。
- `meeting-logs.js`：會議與其他事項。
- `todos.js`：各工地待辦與自動排程。
- `private-notes.js`：個人專區與私人記事。
- `schedule-grid.js`：工地排程、表格互動、水平捲動及日期操作。

## B1F 商城子模組

- `index.js`：B1F 基礎狀態、共用格式與相容資料工具。
- `local-workflows.js`：既有入庫／領用／退回流程的相容層。
- `shared-store.js`：Firebase 公司共用庫存、商品、購物車、訂單、退貨、待結案、紀錄與工地用料單串接。
- `product-management.js`：商品分類、搜尋、重複防呆、庫存調整與商品管理。
- `b1f-overrides.css`、`b1f-mobile.css`：B1F 桌機與手機樣式。

## Shared / Common

- `firebase-config.js`：沿用原有 Firebase 設定。
- `core.js`：共用狀態、權限、角色、Storage 相容層、日期、Modal、Toast、共用資料工具。
- `auth-shell.js`：登入、使用者資料、同步訂閱與正式／本機測試模式。
- `projects.js`：案件共用 CRUD、案件詳情、照片與跨功能案件資料。
- `render-router.js`：八大功能導覽與渲染路由。
- `shell.js`：APP 共用 HTML 殼層。
- `styles/`：全站基礎、共用、Modal／案件詳情、響應式與外觀樣式。

既有 Firebase collection／document、localStorage key、IndexedDB／資料格式與 API 路徑均未更名。測試頁與正式入口共用同一批 `app/features/` 程式；測試頁不是 `index.html` 的副本，只載入該功能、共用程式及必要跨模組依賴。

## 維護與驗證

- 修改單一功能時，直接進入對應 `app/features/<功能>/` 與 `test/<功能>.html`。
- `node scripts/verify-architecture.mjs` 會檢查所有正式／測試模組能否組合、入口是否維持精簡、測試頁沒有複製完整 APP，以及 Storage／Firebase 字面路徑是否與重構前一致。
- `node scripts/serve-local.mjs` 可啟動本機測試伺服器。
