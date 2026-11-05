# CLAUDE.md — 通勤碼表（claude-commute-timer）

給 agent 的專案索引。先讀這份，需要細節再開對應檔案，不要整個 repo 掃描。

- 網站：https://sun070378-create.github.io/claude-commute-timer/ （GitHub Pages，main / root）
- 用途：使用者記錄淡海輕軌、安坑輕軌、台北捷運的「進站→等車→乘車→轉乘→出站」時間，集中統計真實通勤時間。
- 技術：純前端 HTML/CSS/JS（無 build、無套件），後端 Supabase（PostgREST，anon key 寫在 `config.js`）。未設定 Supabase 時為「本機模式」（localStorage）。
- 授權：程式碼 AGPL-3.0；統計資料 CC BY-SA 4.0；原始紀錄不公開、不在授權範圍。

## 檔案

| 檔案 | 內容 |
|---|---|
| `index.html` | 頁面骨架（各 view） |
| `app.js`（約 1260 行） | 碼表狀態機、送出與自動補送、統計、我的紀錄、備份、隱私頁 |
| `stations.js` | `LINES` 路線／車站清單（`lrt: true` = 輕軌，沒有閘門）；同名站自動視為轉乘站 |
| `config.js` | `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`CONTACT_EMAIL` |
| `style.css` | 顏色集中在 `:root`（暗色在 `prefers-color-scheme: dark`） |
| `sw.js` | service worker：打開首頁時整組下載 `FILES`，全部成功才換新版；3 秒內下載不完或沒網路就用快取；伺服器缺檔就清快取改走網路 |
| `manifest.webmanifest`、`icons/` | 加入主畫面用的名稱與圖示（碼表三色外圈＋軌道列車正面）；PNG 由 `scripts/export-icons.js` 從 `icons/icon.svg` 產生 |
| `supabase/schema.sql` | 資料表、權限、trigger、統計函式；可重複執行（冪等升級） |
| `scripts/check-stations.js` | 比對 `stations.js` 和 schema 內的車站清單；`--write` 自動同步 |

## app.js 重點函式

- 碼表：`startTrip`、`press`（切換階段）、`actionsFor`、`currentPhase`、`segmentsOf`、`tick`
- 紀錄：`buildRecord`、`toUpload`（上傳最小化）、`insertTrip`（失敗丟 `UploadError`，`retry` = 之後重送就好）
- 補送：送出時先存進 history，`r.pending` = 待上傳內容，被拒絕則改記 `r.uploadError`。`flushPending`（一次一筆，最舊的先送，間隔 61 秒，配合每分鐘一筆的頻率限制）、`upload`（超過 47 小時不送）、`renderPending`（上方橫幅）；`online`、`visibilitychange`、啟動時觸發
- 備份：`download`、匯出按鈕（history、savedRoutes、lastTransfers、clientId）、`importBackup`（依 `started_at` 去重；這台沒有紀錄才沿用備份的 clientId）
- 統計：`fetchStats` / `loadStats`（呼叫 RPC `trip_stats`）、`computeStats`（本機模式）、`renderStats`、`lrtNote`
- 個人：`renderMyStats`（同起訖點依走法比較）、`variantOf`、`renderHistory`、`renderPrivacy`
- 選站／路線：`renderPicker`（先選路線再選站、搜尋、最近使用）、`renderSaved`（常用路線）、`reversed`（產生回程）
- `timeBand`：平日尖峰 7–9、17–19 點／平日離峰／假日（以刷卡進站時刻判定）

## 資料庫（Supabase）

- `public.trips`：起訖站、`started_at`、`day_type`、`time_band`、`total/wait/ride/transfer/entry/exit_sec`、`transfers`、`segments`（jsonb）、`note`、`client_id`。access／egress 欄位存在，但伺服器端會移除。
- 權限：anon 只能 INSERT，不能讀原始資料。`trips_before_insert` trigger 驗證站名、時刻取整到分鐘、移除到站／離站、重算秒數、限制送出頻率。
- 唯一索引 `trips_client_started_key (client_id, started_at)`：自動重送時擋掉重複（PostgREST 回 409／23505，前端當作已送出）。
- `trip_stats()` RPC：回傳彙總統計（中位數、IQR），**同路線同時段要有 5 個以上不同裝置才顯示**。
- `public.stations`：允許的站名，由 schema 裡 `-- stations:begin` / `-- stations:end` 區塊產生。

## 功能

分層選站、常用路線（去回程自動對調）、到站／離站方式（只存本機）、轉乘站與標籤（用跑的／車剛開走，會記住並反向帶入）、復原上一步、「月台到月台」與「閘門到閘門」兩種統計、CSV 下載、離線開啟與送出後自動補送、匯出／匯入備份、可加入主畫面（PWA）、隱私說明與用裝置代碼申請刪除、輕軌無閘門說明。

## 常見任務

- **加或改車站**：改 `stations.js` → `node scripts/check-stations.js --write` → 提醒使用者到 Supabase SQL Editor 重新執行整份 `schema.sql`（push 不會改到線上資料庫）。
- **改隱私相關行為**：前端 `toUpload` 和資料庫 `trips_before_insert` 兩邊都要改，README 的〈隱私〉段和 `index.html` 的隱私頁也要同步。
- **新增、改名或刪除網頁用到的檔案**：同步改 `sw.js` 的 `FILES`（漏改時網站仍可用，但離線開啟會失效）。
- **改圖示**：改 `icons/icon.svg` → `node scripts/export-icons.js`（需要 Playwright）。maskable 版內容縮到 0.86 倍，Android 圓形裁切時不會切到。
- **改資料庫錯誤訊息**：`insertTrip` 用訊息裡的「太頻繁」「太多」判斷可以重送，改 `trips_before_insert` 的頻率限制訊息時要一起改。
- **localStorage**：和同網域的 claude-web-quest 共用（`sun070378-create.github.io`），新增 key 時避免撞名（網頁闖關用 `webquest-progress`、`note`、`theme`）。

## 慣例

- commit 訊息、文件、介面文字都用繁體中文。
- 開 feature branch，用 PR 合併到 main。

## 相關

- 姊妹專案：[claude-web-quest](https://github.com/sun070378-create/claude-web-quest)（Jason 的個人網頁和「網頁闖關」25 關教學；`works.js` 的作品清單可以放本站連結）。
