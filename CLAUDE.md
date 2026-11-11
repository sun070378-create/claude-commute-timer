# CLAUDE.md

給 agent 的開發注意事項。專案介紹、功能、檔案說明、架設步驟都在 `README.md`（後半的「給開發者」），這裡只補 README 沒寫、改程式時容易踩到的地方。

> **跨專案的共通慣例、待辦和工作環境說明**在私人 repo [`sun070378-create/control-claude-projects`](https://github.com/sun070378-create/control-claude-projects) 的 `CLAUDE.md`（總索引）。如果它還不在工作環境裡，開始工作前先把它加進來讀；這份只寫這個專案自己的事。

## app.js 重點函式

- 碼表：`startTrip`、`press`（切換階段）、`actionsFor`、`currentPhase`、`segmentsOf`、`tick`
- 段落類型：`entry`、`wait`、`board`（上車了但車還沒開，在車上等發車）、`ride`、`transfer`、`exit`，本機另有 `access`、`egress`。`board` 計入 `wait_sec`（前端 `buildRecord` 和 trigger 兩邊都是），所以 `ride_sec` 只有行駛時間
- 紀錄：`buildRecord`、`toUpload`（上傳最小化）、`insertTrip`（失敗丟 `UploadError`，`retry` = 之後重送就好）
- 補送：送出時先存進 history，`r.pending` = 待上傳內容，被拒絕則改記 `r.uploadError`。`flushPending`（一次一筆，最舊的先送，間隔 61 秒，配合每分鐘一筆的頻率限制）、`upload`（超過 47 小時不送）、`renderPending`（上方橫幅）；`online`、`visibilitychange`、啟動時觸發
- Turnstile（`config.js` 的 `TURNSTILE_SITE_KEY` 有填才啟用）：`insertTrip` 改送 `api/trips`（`functions/api/trips.js`，Cloudflare Pages Function），每筆都用 `turnstileToken()` 重新驗證（結果只能用一次）；`loadTurnstile` 要送出時才載入腳本。驗證方塊的 id 是 `turnstile-box`，**不能叫 `turnstile`**（有 id 的元素會變成同名全域變數，蓋掉 `window.turnstile`）
- 搬家模式 `MOVED`：`MOVED_TO` 有填且網址是 `*.github.io` 時，顯示搬家通知、不能開始新的一趟、不補送，只能查看和匯出
- 備份：`download`、匯出按鈕（history、savedRoutes、lastTransfers、clientId）、`importBackup`（依 `started_at` 去重；這台沒有紀錄才沿用備份的 clientId）
- 統計：`fetchStats` / `loadStats`（呼叫 RPC `trip_stats`）、`computeStats`（本機模式）、`renderStats`、`lrtNote`
- 個人：`renderMyStats`（同起訖點依走法比較）、`variantOf`、`renderHistory`、`renderPrivacy`
- 選站／路線：`renderPicker`（先選路線再選站、搜尋、最近使用）、`renderSaved`（常用路線）、`reversed`（產生回程）
- `timeBand`：平日尖峰 7–9、17–19 點／平日離峰／假日（以刷卡進站時刻判定）

## 資料庫（Supabase）

- `public.trips`：access／egress 欄位還在（舊資料相容），但 trigger 會清空。
- 權限：anon 只能 INSERT，不能讀原始資料。`trips_before_insert` trigger 驗證站名、時刻取整到分鐘、移除到站／離站、依 `segments` 重算秒數、限制送出頻率。
- 唯一索引 `trips_client_started_key (client_id, started_at)`：自動重送時擋掉重複（PostgREST 回 409／23505，前端當作已送出）。
- `trip_stats()` RPC：**同路線同時段要有 5 個以上不同裝置才顯示**。
- `public.stations`：允許的站名，由 schema 裡 `-- stations:begin` / `-- stations:end` 區塊產生。
- 線上資料庫連不到時（例如雲端環境網路限制），用本機 PostgreSQL 跑 `schema.sql` 測試；從目前 `main` 的 schema 升級，確認可重複執行、舊資料保留。

## 常見任務

- **加或改車站**：改 `stations.js` → `node scripts/check-stations.js --write` → 提醒使用者到 Supabase SQL Editor 重新執行整份 `schema.sql`（push 不會改到線上資料庫）。
- **改隱私相關行為**：前端 `toUpload` 和資料庫 `trips_before_insert` 兩邊都要改，README 的〈隱私〉段和 `index.html` 的隱私頁也要同步。
- **新增、改名或刪除網頁用到的檔案**：同步改 `sw.js` 的 `FILES`（漏改時網站仍可用，但離線開啟會失效）。
- **改圖示**：改 `icons/icon.svg` → `node scripts/export-icons.js`（需要 Playwright）。maskable 版內容縮到 0.86 倍，Android 圓形裁切時不會切到。
- **改資料庫錯誤訊息**：`insertTrip` 用訊息裡的「太頻繁」「太多」判斷可以重送，改 `trips_before_insert` 的頻率限制訊息時要一起改。
- **localStorage**：和同網域的其他 GitHub Pages 專案共用（`sun070378-create.github.io`）。新增 key 前先看總索引的 key 清單避免撞名，新增後也要更新那份清單。

## 慣例

語言、PR 流程等共通慣例見總索引。這個專案另外要注意：

- 動到 `schema.sql` 的 PR，要在說明裡寫清楚「先執行 SQL 再合併」或「合併後再執行 SQL」。
