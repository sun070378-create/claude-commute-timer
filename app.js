// =========================================================
// 通勤碼表：主程式
// 流程：設定起訖點 → 一路按按鈕（等車 / 上車 / 轉乘）→ 抵達後確認送出
// =========================================================

const PHASES = {
  wait: { label: "等車中", cls: "wait" },
  ride: { label: "乘車中", cls: "ride" },
  transfer: { label: "轉乘步行中", cls: "transfer" },
};
const BAND_LABELS = { peak: "平日尖峰", offpeak: "平日離峰", weekend: "假日" };
const ONLINE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

// ---------- 本機儲存（無痕模式等情況可能不能用，所以都包 try/catch）----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 存不了就算了 */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* 同上 */ }
  },
};

function clientId() {
  let id = store.get("clientId", null);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    store.set("clientId", id);
  }
  return id;
}

// ---------- 小工具 ----------
function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

function fmtMin(sec) {
  const m = sec / 60;
  return m < 10 ? `${m.toFixed(1)} 分` : `${Math.round(m)} 分`;
}

// 一律用台北時間判斷時段，不受手機時區設定影響
function timeBand(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei", weekday: "short", hour: "numeric", hourCycle: "h23",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "weekday").value;
  if (day === "Sat" || day === "Sun") return "weekend";
  const h = Number(parts.find((p) => p.type === "hour").value);
  return (h >= 7 && h < 9) || (h >= 17 && h < 19) ? "peak" : "offpeak";
}

function percentile(values, p) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
const median = (v) => percentile(v, 0.5);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) node.append(c);
  return node;
}

function buzz() {
  if (navigator.vibrate) navigator.vibrate(30);
}

// ---------- 分頁切換 ----------
function showView(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  const views = { setup: "record", track: "record", summary: "record", stats: "stats", history: "history" };
  for (const v of Object.keys(views)) $("view-" + v).hidden = true;

  if (name === "record") name = trip ? (trip.endedAt ? "summary" : "track") : "setup";
  $("view-" + name).hidden = false;

  if (name === "track") renderTrack();
  if (name === "summary") renderSummary();
  if (name === "stats") loadStats();
  if (name === "history") renderHistory();
}

document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));

// =========================================================
// 一、設定起訖點
// =========================================================
function fillStationSelect(select) {
  for (const line of LINES) {
    const group = el("optgroup", { label: line.name });
    for (const s of line.stations) group.append(el("option", { value: s, textContent: s }));
    select.append(group);
  }
}
fillStationSelect($("origin"));
fillStationSelect($("destination"));

const lastRoute = store.get("lastRoute", { origin: "紅樹林", destination: "台北車站" });
$("origin").value = lastRoute.origin;
$("destination").value = lastRoute.destination;

$("swap").addEventListener("click", () => {
  const o = $("origin").value;
  $("origin").value = $("destination").value;
  $("destination").value = o;
});

$("start").addEventListener("click", () => {
  const origin = $("origin").value;
  const destination = $("destination").value;
  if (origin === destination) {
    alert("起點和終點不能是同一站");
    return;
  }
  store.set("lastRoute", { origin, destination });
  // events：每一段開始的時間點，例如 [{type:"wait", t:...}, {type:"ride", t:...}]
  trip = { origin, destination, events: [], endedAt: null };
  saveTrip();
  showView("track");
});

// =========================================================
// 二、碼表
// =========================================================
// 進行中的行程存在本機，重新整理或手機殺掉瀏覽器也不會不見
let trip = store.get("currentTrip", null);
const saveTrip = () => (trip ? store.set("currentTrip", trip) : store.remove("currentTrip"));

function currentPhase() {
  return trip.events.length ? trip.events[trip.events.length - 1].type : null;
}

// 每個階段可以按的按鈕
function actionsFor(phase) {
  switch (phase) {
    case null: return [{ text: "到月台了，開始等車", next: "wait", cls: "wait" }];
    case "wait": return [{ text: "上車了", next: "ride", cls: "ride" }];
    case "ride": return [
      { text: "下車，要轉乘", next: "transfer", cls: "transfer" },
      { text: "抵達終點", next: "end", cls: "finish" },
    ];
    case "transfer": return [
      { text: "到轉乘月台，開始等車", next: "wait", cls: "wait" },
      { text: "車剛好在月台，直接上車", next: "ride", cls: "ride" },
    ];
  }
}

function press(next) {
  buzz();
  const now = Date.now();
  if (next === "end") {
    trip.endedAt = now;
    saveTrip();
    showView("summary");
    return;
  }
  trip.events.push({ type: next, t: now });
  saveTrip();
  renderTrack();
}

$("undo").addEventListener("click", () => {
  if (!trip.events.length) return;
  trip.events.pop();
  saveTrip();
  renderTrack();
});

$("cancel").addEventListener("click", () => {
  if (!confirm("確定要放棄這趟紀錄嗎？")) return;
  trip = null;
  saveTrip();
  showView("record");
});

// 把事件換算成一段一段的時間
function segmentsOf(t, endAt) {
  return t.events.map((e, i) => {
    const end = i + 1 < t.events.length ? t.events[i + 1].t : endAt;
    return { type: e.type, sec: Math.round((end - e.t) / 1000) };
  });
}

function renderTrack() {
  $("track-origin").textContent = trip.origin;
  $("track-dest").textContent = trip.destination;

  const phase = currentPhase();
  $("actions").replaceChildren(
    ...actionsFor(phase).map((a) => {
      const b = el("button", { className: "big-btn " + a.cls, type: "button", textContent: a.text });
      b.addEventListener("click", () => press(a.next));
      return b;
    })
  );
  $("undo").hidden = !trip.events.length;
  tick();
}

function tick() {
  if (!trip || trip.endedAt || $("view-track").hidden) return;
  const now = Date.now();
  const phase = currentPhase();
  const segs = segmentsOf(trip, now);

  $("phase-label").textContent = phase ? PHASES[phase].label : "還沒開始，到月台後按下面的按鈕";
  $("phase-timer").textContent = phase ? fmt(segs[segs.length - 1].sec) : "0:00";
  $("total-timer").textContent = phase ? fmt((now - trip.events[0].t) / 1000) : "0:00";

  $("timeline").replaceChildren(
    ...segs.map((s, i) =>
      el("li", { className: PHASES[s.type].cls + (i === segs.length - 1 ? " current" : "") }, [
        el("span", { textContent: PHASES[s.type].label.replace("中", "") }),
        el("span", { textContent: fmt(s.sec) }),
      ])
    )
  );
}
setInterval(tick, 1000);
// 從背景切回來時立刻更新畫面
document.addEventListener("visibilitychange", tick);

// =========================================================
// 三、結果確認與送出
// =========================================================
function buildRecord(t) {
  const segments = segmentsOf(t, t.endedAt);
  const sum = (type) => segments.filter((s) => s.type === type).reduce((a, s) => a + s.sec, 0);
  const started = new Date(t.events[0].t);
  const band = timeBand(started);
  const wait = sum("wait");
  const ride = sum("ride");
  const transfer = sum("transfer");
  return {
    started_at: started.toISOString(),
    origin: t.origin,
    destination: t.destination,
    day_type: band === "weekend" ? "weekend" : "weekday",
    time_band: band,
    total_sec: wait + ride + transfer,
    wait_sec: wait,
    ride_sec: ride,
    transfer_sec: transfer,
    transfers: segments.filter((s) => s.type === "transfer").length,
    segments,
    note: null,
    client_id: clientId(),
  };
}

function renderStackBar(container, parts) {
  const total = parts.reduce((a, p) => a + p.sec, 0) || 1;
  container.replaceChildren(
    ...parts.filter((p) => p.sec > 0).map((p) => {
      const d = el("div", { className: p.type, title: `${PHASES[p.type].label.replace("中", "")} ${fmt(p.sec)}` });
      d.style.width = (p.sec / total) * 100 + "%";
      return d;
    })
  );
}

function renderLegend(container, parts, format = fmt) {
  container.replaceChildren(
    ...parts.map((p) =>
      el("li", {}, [
        el("span", { className: "dot " + p.type }),
        el("span", { textContent: PHASES[p.type].label.replace("中", "") }),
        el("b", { textContent: format(p.sec) }),
      ])
    )
  );
}

function renderSummary() {
  const r = buildRecord(trip);
  const parts = [
    { type: "wait", sec: r.wait_sec },
    { type: "ride", sec: r.ride_sec },
    { type: "transfer", sec: r.transfer_sec },
  ];
  $("sum-total").textContent = fmt(r.total_sec);
  $("sum-route").textContent = `${r.origin} → ${r.destination}・${BAND_LABELS[r.time_band]}・轉乘 ${r.transfers} 次`;
  renderStackBar($("sum-bar"), parts);
  renderLegend($("sum-parts"), parts);
  $("submit-msg").textContent = "";
  $("submit").disabled = false;

  if (r.ride_sec === 0) {
    $("submit").disabled = true;
    $("submit-msg").textContent = "這趟沒有乘車紀錄，無法送出。可以按「不要送出」重新開始。";
  } else if (r.total_sec < 30) {
    $("submit").disabled = true;
    $("submit-msg").textContent = "全程不到 30 秒，看起來是測試按的，這筆就不送出了。";
  } else if (r.total_sec > 4 * 3600) {
    $("submit").disabled = true;
    $("submit-msg").textContent = "全程超過 4 小時，看起來像是忘了按結束，這筆就不送出了。";
  }
}

$("submit").addEventListener("click", async () => {
  const r = buildRecord(trip);
  r.note = $("note").value.trim() || null;
  $("submit").disabled = true;
  $("submit-msg").textContent = "送出中…";
  try {
    if (ONLINE) await insertTrip(r);
    const history = store.get("history", []);
    history.unshift(r);
    store.set("history", history.slice(0, 500));
    trip = null;
    saveTrip();
    $("note").value = "";
    alert(ONLINE ? "已送出，謝謝你提供數據！" : "已存到這台裝置（本機模式）");
    showView("stats");
    selectPair(r.origin, r.destination);
  } catch (err) {
    $("submit").disabled = false;
    $("submit-msg").textContent = "送出失敗，請稍後再試：" + err.message;
  }
});

$("discard").addEventListener("click", () => {
  if (!confirm("確定不送出這筆紀錄？")) return;
  trip = null;
  saveTrip();
  showView("record");
});

// =========================================================
// 資料庫（Supabase REST API）
// =========================================================
function apiHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: "Bearer " + SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
  };
}

async function insertTrip(record) {
  const res = await fetch(SUPABASE_URL + "/rest/v1/trips", {
    method: "POST",
    headers: { ...apiHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(record),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function fetchTrips() {
  if (!ONLINE) return store.get("history", []);
  const cols = "started_at,origin,destination,time_band,total_sec,wait_sec,ride_sec,transfer_sec,transfers,note";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/trips?select=${cols}&order=started_at.desc&limit=5000`, {
    headers: apiHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// =========================================================
// 統計
// =========================================================
let allTrips = [];
const pairKey = (o, d) => `${o}→${d}`;

async function loadStats() {
  $("stats-body").replaceChildren(el("p", { className: "hint", textContent: "載入中…" }));
  try {
    allTrips = await fetchTrips();
  } catch (err) {
    $("stats-body").replaceChildren(el("p", { className: "hint", textContent: "讀取資料失敗：" + err.message }));
    return;
  }

  // 依筆數排序路線
  const counts = new Map();
  for (const t of allTrips) {
    const k = pairKey(t.origin, t.destination);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const pairs = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const select = $("stats-pair");
  const prev = select.value;
  select.replaceChildren(...pairs.map(([k, n]) => el("option", { value: k, textContent: `${k}（${n} 筆）` })));
  if (counts.has(prev)) select.value = prev;

  $("stats-popular").replaceChildren(
    ...pairs.slice(0, 10).map(([k, n]) => {
      const b = el("button", { type: "button", textContent: `${k}・${n} 筆` });
      b.addEventListener("click", () => { select.value = k; renderStats(); window.scrollTo(0, 0); });
      return el("li", {}, b);
    })
  );
  renderStats();
}

function selectPair(o, d) {
  // loadStats 是非同步的，等它載完再選
  const k = pairKey(o, d);
  const wait = setInterval(() => {
    if ([...$("stats-pair").options].some((op) => op.value === k)) {
      $("stats-pair").value = k;
      renderStats();
      clearInterval(wait);
    }
  }, 200);
  setTimeout(() => clearInterval(wait), 5000);
}

$("stats-pair").addEventListener("change", renderStats);
$("stats-band").addEventListener("change", renderStats);

function renderStats() {
  const body = $("stats-body");
  if (!allTrips.length) {
    body.replaceChildren(el("p", { className: "hint", textContent: "還沒有任何紀錄，搭車時記一筆吧！" }));
    return;
  }
  const k = $("stats-pair").value;
  const band = $("stats-band").value;
  const ofPair = allTrips.filter((t) => pairKey(t.origin, t.destination) === k);
  const rows = band === "all" ? ofPair : ofPair.filter((t) => t.time_band === band);

  if (!rows.length) {
    body.replaceChildren(el("p", { className: "hint", textContent: "這個時段還沒有紀錄。" }));
    return;
  }

  const col = (name, list = rows) => list.map((t) => t[name]);
  const parts = [
    { type: "wait", sec: median(col("wait_sec")) },
    { type: "ride", sec: median(col("ride_sec")) },
    { type: "transfer", sec: median(col("transfer_sec")) },
  ];
  const bar = el("div", { className: "stack-bar" });
  const legend = el("ul", { className: "legend" });
  renderStackBar(bar, parts);
  renderLegend(legend, parts, fmtMin);

  const card = el("div", { className: "stat-card" }, [
    el("div", { className: "stat-sub", textContent: "全程中位數" }),
    el("div", { className: "stat-big", textContent: fmtMin(median(col("total_sec"))) }),
    el("div", {
      className: "stat-sub",
      textContent: `一半的人落在 ${fmtMin(percentile(col("total_sec"), 0.25))} ～ ${fmtMin(percentile(col("total_sec"), 0.75))}・共 ${rows.length} 筆`,
    }),
    bar,
    el("div", { className: "stat-sub", textContent: "各段中位數" }),
    legend,
  ]);
  if (rows.length < 5) {
    card.append(el("p", { className: "hint", textContent: "⚠ 樣本還很少，數字僅供參考。" }));
  }

  // 各時段比較
  const table = el("table", { className: "band-table" });
  table.append(el("tr", {}, ["時段", "筆數", "全程", "等車", "轉乘"].map((h) => el("th", { textContent: h }))));
  for (const b of ["peak", "offpeak", "weekend"]) {
    const r = ofPair.filter((t) => t.time_band === b);
    const cells = r.length
      ? [BAND_LABELS[b], r.length, fmtMin(median(col("total_sec", r))), fmtMin(median(col("wait_sec", r))), fmtMin(median(col("transfer_sec", r)))]
      : [BAND_LABELS[b], 0, "—", "—", "—"];
    table.append(el("tr", {}, cells.map((c) => el("td", { textContent: String(c) }))));
  }
  card.append(table);

  body.replaceChildren(card);
}

$("export").addEventListener("click", () => {
  if (!allTrips.length) return;
  const cols = ["started_at", "origin", "destination", "time_band", "total_sec", "wait_sec", "ride_sec", "transfer_sec", "transfers", "note"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...allTrips.map((t) => cols.map((c) => esc(t[c])).join(","))].join("\n");
  // 開頭加 BOM，Excel 打開中文才不會亂碼
  const blob = new Blob(["﻿" + csv], { type: "text/csv" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "commute-trips.csv" });
  a.click();
  URL.revokeObjectURL(a.href);
});

// =========================================================
// 我的紀錄
// =========================================================
function renderHistory() {
  const list = store.get("history", []);
  if (!list.length) {
    $("history-list").replaceChildren(el("p", { className: "hint", textContent: "還沒有紀錄。" }));
    return;
  }
  $("history-list").replaceChildren(
    ...list.map((r) =>
      el("li", {}, [
        `${r.origin} → ${r.destination}　${fmt(r.total_sec)}`,
        el("span", {
          className: "meta",
          textContent: `${new Date(r.started_at).toLocaleString("zh-TW")}・等 ${fmt(r.wait_sec)}・乘 ${fmt(r.ride_sec)}・轉 ${fmt(r.transfer_sec)}${r.note ? "・" + r.note : ""}`,
        }),
      ])
    )
  );
}

// ---------- 啟動 ----------
if (!ONLINE) {
  $("mode-banner").hidden = false;
  $("mode-banner").textContent = "目前是本機模式：紀錄只存在這台裝置，統計也只看得到自己的。設定資料庫後就能和大家一起統計。";
}
showView("record");
