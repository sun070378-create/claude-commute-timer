# 通勤碼表

> 這個專案由 [Claude Code](https://claude.com/claude-code) 協助製作。

讓大家自己記錄搭淡海輕軌、安坑輕軌、台北捷運時的**等車、乘車、轉乘**時間，集中起來統計出真實的通勤時間。

## 怎麼用？

1. 選起點站、終點站，按「準備出發」
2. 到月台按「開始等車」→ 車來按「上車了」→ 下車時選「要轉乘」或「抵達終點」
3. 轉乘時，到下一個月台再按「開始等車」（車剛好在月台就按「直接上車」）
4. 抵達後確認時間，按「送出」

中途關掉螢幕或切到別的 App 都沒關係，時間是用按下按鈕的時刻計算的。按錯了可以「復原上一步」。

統計頁會依路線和時段（平日尖峰 7–9、17–19 點／平日離峰／假日）顯示**中位數**和「一半的人落在幾分到幾分」，用中位數是為了不被少數極端值（例如遇到故障）拉歪。

## 檔案說明

| 檔案 | 內容 |
|------|------|
| `index.html` | 網頁的骨架 |
| `style.css` | 外觀（顏色集中在最上面 `:root`） |
| `app.js` | 碼表、送出、統計的程式 |
| `stations.js` | 路線與車站清單，要加站改這裡 |
| `config.js` | 資料庫設定 |
| `supabase/schema.sql` | 建立資料表的 SQL |

## 先在自己電腦試用

直接雙擊 `index.html` 就能用。還沒設定資料庫時是「本機模式」，紀錄只存在自己的瀏覽器裡。

## 讓大家的資料集中起來（設定 Supabase，免費）

1. 到 <https://supabase.com> 註冊，建立一個新專案（Region 選 Tokyo 或 Singapore 比較快）
2. 左邊選 **SQL Editor**，把 `supabase/schema.sql` 的內容整段貼上，按 **Run**
3. 左邊選 **Project Settings → API**，複製：
   - **Project URL**（像 `https://abcdxyz.supabase.co`）
   - **anon public** key（很長一串）
4. 貼到 `config.js` 的引號裡，存檔

anon key 本來就是設計給網頁公開使用的；資料表已設定成「任何人只能新增和讀取，不能修改或刪除」，而且會擋掉不合理的資料（例如超過 4 小時、時間對不起來）。

## 放上網路（GitHub Pages，免費）

1. 到 repo 的 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`，按 Save
2. 等一兩分鐘，網址會是 <https://sun070378-create.github.io/claude-commute-timer/>

把這個網址傳給朋友，或在 PTT、Dcard、臉書社團分享，大家就能一起記錄了。手機瀏覽器選「加入主畫面」，用起來就像 App。
