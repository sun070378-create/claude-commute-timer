# 通勤碼表

記錄搭台北捷運、淡海輕軌、安坑輕軌時，**進站、等車、乘車、轉乘、出站**各花了多久，集中起來統計出乘客實際的通勤時間。

**👉 [打開通勤碼表](https://sun070378-create.github.io/claude-commute-timer/)**（手機瀏覽器直接開，不用下載 App）

本站不是臺北捷運公司、新北捷運公司或任何政府機關的官方網站。這個專案由 [Claude Code](https://claude.com/claude-code) 協助製作。

## 為什麼要做這個

路線規劃 App 算出來的時間，通常是表定的行車時間，不包含等車、轉乘走路，也看不出尖峰和離峰差多少。通勤碼表讓乘客自己按碼表實測，把每一段時間拆開記錄：

```
刷卡進站 → 走到月台 → 等車 → 乘車 →（轉乘：走路 → 等車 → 乘車）→ 走到出口 → 刷卡出站
```

累積多人的紀錄後，就能看出某條路線實際要花多久、時間主要花在哪一段，以及營運調整後有沒有變快。

## 怎麼使用

### 記錄一趟

1. 選起點站、終點站，按「準備出發」
2. 刷卡進站時按「刷卡進站了」，到月台按「開始等車」，車來了按「上車了」
3. 要轉乘時，下車按「要轉乘」，走到下一個月台按「開始等車」；車剛好停在月台就按「直接上車」
4. 到站後按「下車，走向出口」，刷卡出站時按「刷卡出站了」
5. 確認時間，按「送出」

中途關掉螢幕、切到別的 App 都沒關係，時間是用按下按鈕的時刻計算的。按錯了可以「復原上一步」。忘了按「刷卡進站」可以直接從「開始等車」開始，出站時也可以選「不記錄出站時間」。

### 好用的功能

- **常用路線**：每天走的路線存起來，之後一鍵出發，去程、回程都有
- **轉乘資訊**：送出前可以選在哪一站轉乘，並標記「用跑的」或「到月台時車剛好開走」。同一條路線下次會自動帶入
- **到站／離站方式**：在「更多選項」選走路、騎腳踏車、開車等，順便記錄出門到車站、出站到目的地的時間。這兩段只存在你的手機，不會上傳
- **沒有網路也能用**：打開過一次之後，沒有網路也能打開。在地下沒訊號時送出，紀錄會先存在手機，有訊號後自動補送

### 看統計

「統計」頁會依路線和時段（平日尖峰 7–9 點、17–19 點／平日離峰／假日）顯示**中位數**和「一半的紀錄落在幾分到幾分」。用中位數，是為了不被少數極端情況（例如遇到故障）拉歪。

- **月台到月台**：等車＋乘車＋轉乘
- **閘門到閘門**：再加上進站和出站，和悠遊卡進出站是同一個基準。淡海、安坑輕軌沒有閘門，輕軌站是從月台旁感應票卡處算起

為了保護隱私，同一條路線、同一時段要有 **5 人以上**記錄才會顯示。

### 我的紀錄

- **路線比較**：同一個起訖點，依到站方式和轉乘站分開比較，標出你最快的走法
- **備份**：紀錄存在手機的瀏覽器裡，清除瀏覽器資料或換手機就會不見。可以匯出備份檔，換手機時匯入，紀錄、常用路線和裝置代碼都會帶過去

## 加到手機主畫面

加到主畫面後，就能像 App 一樣從桌面打開。

### Android（Chrome）

右上角 **⋮** → **「安裝並建立捷徑」**，會出現兩個選項：

| 選項 | 桌面圖示 | 打開後 |
|---|---|---|
| **安裝應用程式**（推薦） | 只有通勤碼表的圖示 | 像 App 一樣全螢幕，沒有網址列；也會出現在應用程式清單裡 |
| **建立捷徑** | 圖示右下角有 Chrome 的小標誌 | 在 Chrome 的分頁裡打開，上面有網址列 |

兩種用的是同一份紀錄，選哪一個都可以。如果兩個都建立了，刪掉其中一個也不會影響紀錄。

### iPhone（Safari）

下方的**分享按鈕** → **「加入主畫面」**。

⚠ iPhone 上，主畫面的通勤碼表和 Safari 裡的紀錄是**分開的**，加入後主畫面那個會是空的。想把紀錄帶過去，先在 Safari 開通勤碼表，到「我的紀錄」按「匯出備份」，再從主畫面打開，按「匯入備份」。

## 隱私

網站上的〈隱私與使用說明〉有完整說明，重點如下：

- **只上傳統計需要的資料**：各段時長精確到秒，但時刻只保留到分鐘；到站／離站不上傳；備註只有勾選時才上傳
- **原始紀錄不公開**：大家只看得到彙總後的統計
- **5 人門檻**：同一條路線、同一時段要有 5 個以上不同的人記錄才會顯示，避免從統計反推出個人的通勤時間
- **可以申請刪除**：附上「我的紀錄」頁面顯示的裝置代碼，透過下方的聯絡方式申請

## 授權

這個專案希望讓大家方便比較通勤時間，也把結果提供給其他人參考。選擇下面的授權，是為了**防止專案或資料被圈起來，變成封閉的收費服務**，同時不妨礙新聞報導、研究引用或一般的商業使用。

- **程式碼**：[AGPL-3.0](LICENSE)。任何人都可以使用、修改，也可以商用；但修改後的版本必須同樣公開原始碼，架成網站提供服務也一樣。
- **統計資料**（統計頁、下載的 CSV）：[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.zh-hant)。任何人都可以使用，包括商業用途；使用時要標示來源「通勤碼表」，改作後的資料也要用同樣的授權公開。
- **原始紀錄不公開，也不在上述授權範圍內。**

## 相關專案

用乘客資料估算交通時間的服務不只這個，各自目的不同：

- **Transit**（GO 功能）、**Moovit** 等國外 App 也會用乘客分享的資料推估車輛位置或行車時間，主要目的是即時導航，或製作城市層級的大眾運輸報告。
- **官方 App**（例如台北捷運Go）的資訊來自營運系統，例如時刻表和列車位置，不是乘客實際花費的時間。

本專案的特點是：乘客自己實測、以閘門到閘門為基準、把等車和轉乘拆開計算，並公開彙總統計。之後如果使用交通部 TDX 等開放資料，會依其規定標示資料來源。

## 問題回報與聯絡

- 發現錯誤、想建議新功能：[GitHub Issues](https://github.com/sun070378-create/claude-commute-timer/issues)
- 申請刪除資料：GitHub Issues，或寄信到 sun070378@gmail.com（請附上裝置代碼）

---

## 給開發者

以下是架設和修改這個網站的說明，一般使用者不需要看。

### 技術架構

純 HTML／CSS／JavaScript，沒有建置步驟、沒有套件。網頁可以放在 GitHub Pages 或 Cloudflare Pages，資料存在 [Supabase](https://supabase.com)（PostgreSQL）。放在 Cloudflare Pages 時，可以加上 Cloudflare Turnstile 擋機器人（見下面「架設自己的版本」第 3 步）。

| 檔案 | 內容 |
|------|------|
| `index.html` | 網頁的骨架 |
| `style.css` | 外觀（顏色集中在最上面的 `:root`） |
| `app.js` | 碼表、送出與自動補送、統計、備份 |
| `stations.js` | 路線與車站清單 |
| `config.js` | 資料庫網址、公開金鑰、聯絡 email、Turnstile 的 Site key、搬家後的新網址 |
| `functions/api/trips.js` | 放在 Cloudflare Pages 時才會用到的伺服器程式：確認 Turnstile 驗證通過，再用私密金鑰把紀錄寫進資料庫 |
| `sw.js` | 讓網站沒有網路也能打開（service worker）。**新增、改名或刪除網頁用到的檔案時，要一起改裡面的 `FILES`** |
| `manifest.webmanifest`、`icons/` | 加到主畫面時的名稱和圖示（PNG 由 `icons/icon.svg` 產生） |
| `supabase/schema.sql` | 資料表、權限、資料檢查、統計函式 |
| `scripts/check-stations.js` | 檢查資料庫的車站清單和 `stations.js` 是否一致 |
| `scripts/export-icons.js` | 由 `icons/icon.svg` 產生各尺寸的 PNG 圖示（需要 Playwright） |
| `CLAUDE.md` | 給 AI agent 看的專案索引 |
| `LICENSE` | 程式碼授權（AGPL-3.0） |

### 在自己電腦執行

直接雙擊 `index.html` 就能用。`config.js` 的資料庫設定留空時是「本機模式」，紀錄只存在自己的瀏覽器裡。離線功能需要用網址打開（例如在資料夾裡執行 `python3 -m http.server`），直接雙擊時不會啟用。

### 架設自己的版本

**1. 建立資料庫（Supabase，免費方案即可）**

1. 到 <https://supabase.com> 建立新專案
2. 在 **SQL Editor** 貼上整份 `supabase/schema.sql`，按 **Run**
3. 在 **Project Settings → API** 複製 Project URL 和公開金鑰（publishable key 或 anon key），填進 `config.js`

公開金鑰本來就是設計給網頁使用的。資料表已設定成「任何人只能新增，不能讀取原始紀錄、修改或刪除」，並會擋掉不合理的資料（例如站名不存在、時間不合理、資料過大）。

`schema.sql` 可以重複執行：之後檔案有更新時，整段重新執行就會升級，既有資料會保留。**注意：把 `schema.sql` 推到 GitHub 不會改到線上的資料庫，一定要到 SQL Editor 重新執行才會生效。**

**2. 放上網路（GitHub Pages，免費）**

到 repo 的 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`。更新網站後，使用者下次在有網路時打開，就會自動換成新版。

**3. 擋機器人（Cloudflare Pages + Turnstile，免費，選用）**

只在網頁加驗證擋不住機器人：公開金鑰寫在網頁裡，機器人可以跳過網頁直接寫進資料庫。所以要改成「網頁 → 伺服器程式確認驗證 → 用私密金鑰寫進資料庫」，再收回公開金鑰的寫入權限。Cloudflare 後台的按鈕名稱偶爾會改，大致照這個順序找：

1. **建立 Cloudflare Pages 專案**
   1. 到 <https://dash.cloudflare.com> 註冊並登入
   2. 左邊選 **Workers & Pages** → **Create** → 選 **Pages** → **Connect to Git**，授權 GitHub 後選這個 repo
   3. 設定：Framework preset 選 **None**，Build command 留空，Build output directory 填 `/`
   4. 專案名稱會變成網址，例如填 `commute-timer` 就是 `commute-timer.pages.dev`（被用走了就換一個）
   5. 按 **Save and Deploy**，完成後打開網址，確認網站正常
2. **建立 Turnstile**
   1. 左邊選 **Turnstile** → **Add widget**
   2. Hostname 填上一步的網址，不含 `https://`，例如 `commute-timer.pages.dev`
   3. Widget Mode 選 **Managed**
   4. 建立後會看到兩把金鑰：**Site Key** 是公開的，填進 `config.js` 的 `TURNSTILE_SITE_KEY`；**Secret Key** 是私密的，只填在下一步，不要寫進任何檔案或貼給別人
3. **在 Pages 專案設定環境變數**（專案的 **Settings → Variables and Secrets**，Production 環境）
   - `SUPABASE_URL`：一般文字，填 Supabase 的 Project URL
   - `TURNSTILE_SECRET_KEY`：選 **Secret**（加密），填 Turnstile 的 Secret Key
   - `SUPABASE_SECRET_KEY`：選 **Secret**（加密），填 Supabase **Project Settings → API Keys** 裡的 Secret key（`sb_secret_` 開頭；舊式專案是 service_role key）。這把金鑰可以讀寫整個資料庫，只能放在這裡
   - 設定好之後，到 **Deployments** 重新部署一次，新的設定才會生效
4. **切換**：`config.js` 填好 `TURNSTILE_SITE_KEY`，在新網址實際送出一筆確認成功後，再收回資料庫公開金鑰的寫入權限（`schema.sql` 裡的 `revoke insert`）。順序不能反過來，否則中間這段時間大家都送不出資料
5. **舊網址**：`config.js` 的 `MOVED_TO` 填新網址，舊網址（GitHub Pages）就會顯示搬家通知，只能查看和匯出紀錄

在自己電腦測試 Turnstile，可以用 Cloudflare 提供的測試金鑰：Site key `1x00000000000000000000AA`、Secret key `1x0000000000000000000000000000000AA`（一定會通過）。

### 修改圖示

改 `icons/icon.svg`，再執行 `node scripts/export-icons.js` 產生各尺寸的 PNG。已經加到主畫面的圖示不一定會自動更新：Android 通常幾天內會換成新的，iPhone 要刪掉後重新加入。

### 新增或修改車站

資料庫會擋掉不在車站清單裡的站名，所以車站清單有兩份：`stations.js`（網頁用）和 `supabase/schema.sql`（資料庫用）。改完 `stations.js` 後：

1. 執行 `node scripts/check-stations.js --write`，自動更新 `schema.sql` 裡的清單
2. 到 Supabase 的 SQL Editor 重新執行整份 `schema.sql`
