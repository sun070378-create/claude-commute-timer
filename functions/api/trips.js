// =========================================================
// 通勤碼表：送出紀錄的伺服器程式（Cloudflare Pages Function）
// =========================================================
// 網址是 /api/trips。網頁把紀錄和 Turnstile 的驗證結果送到這裡：
//   1. 先向 Cloudflare 確認驗證結果是真的（擋機器人）
//   2. 通過了，再用私密金鑰把紀錄寫進 Supabase
// 資料庫不讓網頁直接寫入，所以機器人沒辦法跳過這一步。
//
// 需要在 Cloudflare 後台設定兩個「加密的環境變數」（不要寫在程式裡）：
//   TURNSTILE_SECRET_KEY   Turnstile 的 Secret key
//   SUPABASE_SECRET_KEY    Supabase 的 Secret key（sb_secret_ 開頭，或舊式的 service_role key）
// 以及一個一般的環境變數：
//   SUPABASE_URL           例如 https://xxxx.supabase.co

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8" },
});

export async function onRequestPost({ request, env }) {
  if (!env.TURNSTILE_SECRET_KEY || !env.SUPABASE_SECRET_KEY || !env.SUPABASE_URL) {
    return json(500, { code: "CONFIG", message: "伺服器還沒設定好" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { code: "BAD_REQUEST", message: "紀錄格式不正確" });
  }
  const { record, token } = body || {};
  if (!record || typeof record !== "object" || typeof token !== "string" || !token) {
    return json(400, { code: "BAD_REQUEST", message: "紀錄格式不正確" });
  }

  // 1. 確認 Turnstile 驗證結果（每個結果只能用一次，幾分鐘內有效）
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  let verified = false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    verified = (await res.json()).success === true;
  } catch {
    return json(502, { code: "TURNSTILE_DOWN", message: "暫時無法驗證，請稍後再試" });
  }
  if (!verified) {
    return json(403, { code: "TURNSTILE", message: "驗證沒有通過，請稍後再試" });
  }

  // 2. 寫進 Supabase。資料檢查（站名、時間、送出頻率）都在資料庫的 trigger 裡做
  const url = env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/trips";
  const headers = { apikey: env.SUPABASE_SECRET_KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
  // 舊式金鑰（eyJ 開頭）才需要放進 Authorization；新式 sb_secret_ 只要 apikey
  if (env.SUPABASE_SECRET_KEY.startsWith("eyJ")) headers.Authorization = "Bearer " + env.SUPABASE_SECRET_KEY;
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, body: JSON.stringify(record) });
  } catch {
    return json(502, { code: "DB_DOWN", message: "資料庫暫時連不上" });
  }
  // 資料庫的回應原封不動傳回去，網頁照原本的方式判斷（例如「送出太頻繁」、重複送出）
  return new Response(res.status === 201 ? null : await res.text(), {
    status: res.status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
