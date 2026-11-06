# AI 資料庫第一階段驗收（2026-11-06，Asia/Taipei）

結論：本機 Firebase 模擬器可驗證的資料儲存與權限項目已通過；不能宣稱正式 Firebase、實際跨裝置雲端存取或 PDF 新視窗預覽已驗收完成。

沒有串接 GPT、沒有 Commit／Push／正式部署。資料連線固定至 localhost 的 `demo-haven-ai`，不是正式業務專案。原有操作畫面的分類、案件與檔案全部保留。

## 逐項結果

| 需求 | 結果與範圍 |
| --- | --- |
| 1. 分類新增、改名、刪除、展開收合及排序 | 資料層及 Firestore 新增／改名／刪除／排序通過；本次畫面展開收合通過。既有滑鼠拖曳已在上輪 UI 實測，本次重新整理及第二管理員讀回順序保持。刪除測試只處理程式另建的唯一 ID 驗收分類。 |
| 2. 案件新增、修改、刪除及排序 | 真實 Firebase repository 與模擬器通過；原有案件未刪。畫面確認提示已在前輪檢查並取消，沒有對既有資料按下確認刪除。 |
| 3. 全部基本資料保存 | 坪數小數、金額、年份、房型、複選範圍、網址及備註均讀回比對。另在現有畫面重新整理後確認原有案件資料不變。 |
| 4. 三種 PDF 與照片 | `quote`、`drawing`、`change`、`photo` 均通過上傳、metadata、跨管理員下載位元組比對、替換及刪除。照片備註及重新連線後原檔亦通過。照片縮圖已在 UI 驗證。三種 PDF 的新視窗預覽受內建瀏覽器政策阻擋，保留待手動驗收；不是通過。 |
| 5. 替換失敗保留舊版 | 格式錯誤、Storage 失敗、上傳後 metadata 失敗、版本衝突四種情境均保留原 metadata、path 與完整原始 bytes。新檔提交失敗會清理未掛載物件。 |
| 6. 兩位管理員同步及不互蓋 | admin-a、admin-b 可讀取同一案件與檔案；同 revision 真正並行送出兩筆交易，恰好一筆成功、一筆遭拒。另驗證舊畫面不能覆蓋第二位管理員的新內容。UI 亦確認 admin-b 讀到相同原有資料。 |
| 7. 一般員工限制 | UI 的 staff 直接網址顯示拒絕，AI 入口與案件欄位數均為 0。規則測試確認 staff／resigned／anonymous 不能讀、寫、改、刪案件及檔案，也不能列出 AI 集合或自行升權。 |
| 8. 與正式業務資料隔離 | Firebase adapter 固定 demo 專案及 loopback 主機。AI 資料集合與 Storage 路徑皆使用 Test 命名；嘗試寫入 `projects`、`projectPhotos` 及偽造檔案 path 被拒絕。沒有正式 Firebase 連線。 |
| 9. 安全規則 | 沒有公開 read/write。以 active 的 manager/admin 會員資料授權。MIME、路徑、原檔不可覆寫、未來 AI 寫入禁止、自行升權禁止及共用 revision 保護通過。此結論只適用已載入模擬器的規則。 |
| 10. 其他功能 | 靜態檢查確認 AI 模組只在 unifiedTestMode 載入，正式 manifest 沒有 AI 模組。唯讀 UI 切換首頁、案件總覽、施工寶典、廠商資訊皆有內容。未對正式線上環境做全面回歸，不能將此等同正式全站驗收。 |

## 這次發現與修正

1. **Storage 同路徑重傳**：實測只用 `allow create` 加 `allow update: false`，目前模擬器仍接受重傳。已在 create 規則額外要求 `resource == null`，重新測試確認拒絕，正常新路徑替換通過。
2. **共用協調文件保護**：原規則允許管理員刪除 revision 協調文件，且未強制逐次遞增。已禁止刪除、回退及跳號。此回歸測試使用另外的 `demo-haven-ai-meta-rules` Firestore namespace，避免測試失敗時影響操作畫面的協調文件。
3. **背景照片載入取消**：程式檢查發現，權限拒絕清空 state 後，尚未結束的照片載入可能繼續讀取清空狀態。已補上世代、權限與 state 檢查，丟棄過期讀取。一般畫面及重新整理已確認正常；延遲照片下載恰逢權限撤銷的瀏覽器競態仍屬專項待驗證。

Storage 規則的資源不存在條件參考：[Firebase 官方 Storage Rules Reference](https://firebase.google.com/docs/reference/security/storage)。模擬器的 create/update 分流差異也有 [Firebase 官方專案 issue](https://github.com/firebase/firebase-tools/issues/10302)；本報告以本次實測結果為準。

## 已執行的測試

- `node model.test.mjs`：本機持久保存、CRUD、排序、驗證、刪除政策、Blob、並行版本及正式入口隔離，通過。
- `node rules.test.mjs`：Firestore／Storage 角色與路徑規則，以及獨立 namespace 的 revision 保護，通過。測試中的 PERMISSION_DENIED 是預期的拒絕驗證，不是正式站錯誤。
- `node firebase-store.test.mjs`：真實 SDK／repository、雙管理員、檔案 bytes、替換清理及拒絕角色，通過。
- `node acceptance.test.mjs`：19 個資料、故障注入與原資料保護項目，全部通過。最新機器可讀結果見 `acceptance-results.json`。
- 語法與 diff whitespace 檢查通過。

驗收 runner 比對前後原有 `categories`、`cases`、`files`、`knowledge`、`analysisRuns`、`questions`、`answerRevisions`、`cleanupPaths` 逐欄一致；只有全域 revision 因正常驗收交易推進。驗收自建資料結束後清理，沒有清空原本資料。

## 正式 Firebase 啟用前仍需完成

1. 取得現有線上 Firestore／Storage 規則，確認沒有其他寬鬆規則同時放行新資料；這份 demo 規則不能直接覆蓋正式規則。
2. 確認正式 `members/{uid}` 的 role／status 來源可信、一般員工不能自行修改權限，並驗證停權與離職即時失效。
3. 規劃正式 AI 集合與 Storage 前綴、環境切換及正式管理員登入。不可以把固定測試帳號、demo 專案或本機模擬器連線當成正式啟用。
4. 設定 Storage 查詢 Firestore 權限所需跨服務授權，確認 bucket、CORS、容量及備份政策。
5. 在隔離的真實雲端測試環境，以兩位真實管理員、一般員工及不同裝置驗證同步、權限、下載、三種 PDF 預覽及照片開啟。
6. 真實網路中斷、上傳途中關閉瀏覽器、Storage 已上傳但 metadata 尚未提交時當機，需驗證並配置伺服器端孤立檔案清理。現在的故障注入不等於已實測這些硬中斷。
7. 檔案數量很大的分類／案件刪除，正式接入前需評估 Firestore 單次交易寫入限制，必要時改成可重試的分批刪除工作。
8. GPT／AI 知識本階段未啟用。第二階段的知識寫入、保留與稽核應由受控後端處理，不能直接解除目前的 client write 禁止。

## 本次檔案範圍

讀取／檢查：AI 模組的 `files.js`、`firebase-store.js`、`index.js`、`test-integration.js`，共用 loader 的既有 diff，以及 AI 安全規則、測試腳本。沒有閱讀其他功能業務程式。

本次修改：`app/features/ai-database/index.js`、`test/ai-database/firestore.rules`、`storage.rules`、`rules.test.mjs`；新增 `acceptance.test.mjs`、`acceptance-results.json` 與本報告，並補充 README 的驗收指令。前一階段的新模組仍維持未提交狀態；本次沒有再擴大共用 loader 的修改。
