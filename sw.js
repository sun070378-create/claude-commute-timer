// =========================================================
// 通勤碼表：service worker，讓網站沒有網路也能打開
// =========================================================
// 第一次打開網站時，把下面 FILES 列的檔案存進手機。之後每次打開首頁：
// - 有網路：一次下載全部檔案，全部成功才換掉手機裡的舊版，所以網路不穩時不會新舊檔案混在一起
// - 沒有網路，或 3 秒內下載不完：直接用手機裡的版本
// - 伺服器有回應，但少了某個檔案（例如檔案改了名字，這裡忘了改）：不用手機裡的版本，照常上網
//
// 新增、改名或刪除網頁會用到的檔案時，記得也改這裡的 FILES。

const CACHE = "commute-timer";
const FILES = [
  "./",
  "style.css",
  "config.js",
  "stations.js",
  "app.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
];
const URLS = new Set(FILES.map((f) => new URL(f, location).href));
const HOME = new URL("./", location).href;

// 下載全部檔案；全部成功才存進手機
async function downloadAll(timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    // no-cache：每次都向伺服器確認有沒有新版（沒變的話伺服器只會回一句「沒變」）
    const responses = await Promise.all(FILES.map((f) => fetch(f, { cache: "no-cache", signal: ctrl.signal })));
    const missing = responses.find((r) => !r.ok);
    if (missing) throw new Error("伺服器少了檔案：" + missing.url);
    // 先把內容全部讀完，再一起存，避免存到一半斷線（檔案類型會跟著內容一起保存）
    const copies = await Promise.all(responses.map(async (r) => new Response(await r.blob())));
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map((f, i) => cache.put(f, copies[i])));
  } finally {
    clearTimeout(timer);
  }
}

// 連不上網路（TypeError）或超過時間（AbortError）
const isOffline = (err) => err.name === "AbortError" || err instanceof TypeError;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(downloadAll(30000));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // 清掉已經不在 FILES 裡的舊檔案
    const cache = await caches.open(CACHE);
    for (const req of await cache.keys()) {
      if (!URLS.has(req.url)) await cache.delete(req);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const path = url.origin + url.pathname;

  // 打開首頁：先試著把全部檔案更新成最新版
  if (req.mode === "navigate" && (path === HOME || path === HOME + "index.html")) {
    event.respondWith((async () => {
      try {
        await downloadAll(3000);
      } catch (err) {
        if (!isOffline(err)) {
          // 伺服器少了檔案：手機裡的版本可能已經和伺服器對不上，清掉，照常上網
          await caches.delete(CACHE);
          return fetch(req);
        }
      }
      return (await caches.match(HOME)) || fetch(req);
    })());
    return;
  }

  // 網頁用到的其他檔案：用手機裡的版本（打開首頁時已經更新過了），沒有的話才上網抓
  if (URLS.has(path)) {
    event.respondWith(caches.match(path).then((res) => res || fetch(req)));
  }
  // 其他請求（例如資料庫）不經過這裡，照常上網
});
