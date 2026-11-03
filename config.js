// 資料庫設定（Supabase）
// 留空時網站會用「本機模式」：紀錄只存在這台裝置的瀏覽器裡，統計也只看得到自己的。
// 填上 Supabase 專案的網址和 anon key 之後，所有人的紀錄就會集中到同一個資料庫一起統計。
// 設定步驟請看 README.md。公開金鑰（publishable / anon key）本來就是給網頁用的，可以放心寫在這裡。
const SUPABASE_URL = "https://ikkxwgxsryzilqtxzebj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0JSNSxBTgUmttL8pDKhV3g_86H6_Pyb";

// 隱私說明裡「申請刪除資料」的聯絡 email；留空就只顯示 GitHub Issues
const CONTACT_EMAIL = "";
