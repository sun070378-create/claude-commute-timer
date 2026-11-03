// =========================================================
// 通勤碼表：主程式
// 流程：設定起訖點 → 一路按按鈕（進站 / 等車 / 上車 / 轉乘 / 出站）→ 抵達後確認送出
// =========================================================

const PHASES = {
  wait: { label: "等車中", cls: "wait" },
  ride: { label: "乘車中", cls: "ride" },
  transfer: { label: "轉乘步行中", cls: "transfer" },
  entry: { label: "進站走到月台中", cls: "gate" },
  exit: { label: "走向出口中", cls: "gate" },
  access: { label: "前往車站中", cls: "access" },
  egress: { label: "前往目的地中", cls: "egress" },
};
// 到站、離站的交通方式（代碼要和 supabase/schema.sql 裡的一致）
const MODES = { walk: "步行", bike: "腳踏車", youbike: "YouBike", scooter: "機車", car: "開車", bus: "公車" };
// 車站裡的部分（閘門到閘門），大家的資料會一起統計；到站、離站只存在自己的手機，不上傳
const STATION_TYPES = ["entry", "wait", "ride", "transfer", "exit"];
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
  const views = { setup: "record", track: "record", summary: "record", stats: "stats", history: "history", privacy: "privacy" };
  for (const v of Object.keys(views)) $("view-" + v).hidden = true;

  if (name === "record") name = trip ? (trip.endedAt ? "summary" : "track") : "setup";
  $("view-" + name).hidden = false;

  if (name === "track") renderTrack();
  if (name === "summary") renderSummary();
  if (name === "stats") loadStats();
  if (name === "history") renderHistory();
  if (name === "privacy") renderPrivacy();
}

document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showView(t.dataset.view)));

// =========================================================
// 一、設定起訖點
// =========================================================
// 每個站經過哪些路線，例如 "紅樹林" → [綠山線, 淡水信義線]
const STATION_LINES = new Map();
for (const line of LINES) {
  for (const s of line.stations) {
    if (!STATION_LINES.has(s)) STATION_LINES.set(s, []);
    STATION_LINES.get(s).push(line);
  }
}

// 黃色、淺色的路線配白字看不清楚，改用深色字
function textColorOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#1f2a33" : "#ffffff";
}

function lineTag(line) {
  const tag = el("span", { className: "line-tag", textContent: line.short, title: line.name });
  tag.style.background = line.color;
  tag.style.color = textColorOn(line.color);
  return tag;
}

// 站名加上它所屬路線的小標籤；exceptLine 用來在路線清單裡省略自己那條線
function stationLabel(name, exceptLine) {
  const lines = STATION_LINES.get(name).filter((l) => l !== exceptLine);
  return [el("span", { className: "station-name", textContent: name }), ...lines.map(lineTag)];
}

// 舊版存的 lastRoute 沒有到站／離站方式，補成 null
const route = { accessMode: null, egressMode: null, ...store.get("lastRoute", { origin: "紅樹林", destination: "台北車站" }) };
if (route.accessMode || route.egressMode) $("more").open = true;

function renderRoute() {
  $("origin").replaceChildren(...stationLabel(route.origin));
  $("destination").replaceChildren(...stationLabel(route.destination));
  renderModes();
}
renderRoute();

$("swap").addEventListener("click", () => {
  Object.assign(route, reversed(route));
  renderRoute();
});

// ---------- 選站視窗 ----------
// 起點、終點、轉乘站共用；transferOnly 時只列出有兩條以上路線的車站
const TRANSFER_STATIONS = [...STATION_LINES.keys()].filter((s) => STATION_LINES.get(s).length > 1);
const picker = { line: null, current: null, onChoose: null, transferOnly: false };

function openPicker({ title, current, onChoose, transferOnly = false }) {
  Object.assign(picker, { line: null, current, onChoose, transferOnly });
  $("picker-title").textContent = title;
  $("picker-search").value = "";
  renderPicker();
  $("picker").showModal();
}

function choose(name) {
  picker.onChoose(name);
  $("picker").close();
}

function stationRow(name, exceptLine) {
  const b = el("button", { type: "button", className: "row" }, stationLabel(name, exceptLine));
  if (name === picker.current) b.classList.add("selected");
  b.addEventListener("click", () => choose(name));
  return b;
}

function renderPicker() {
  const q = $("picker-search").value.trim().replace(/站$/, "");
  const body = $("picker-body");
  $("picker-back").style.visibility = picker.line && !q ? "visible" : "hidden";
  const candidates = picker.transferOnly ? TRANSFER_STATIONS : [...STATION_LINES.keys()];

  // 有輸入搜尋字：直接列出所有符合的站
  if (q) {
    const hits = candidates.filter((s) => s.includes(q));
    body.replaceChildren(
      ...(hits.length ? hits.map((s) => stationRow(s)) : [el("p", { className: "hint", textContent: "找不到這個站名" })])
    );
    return;
  }

  // 選轉乘站：轉乘站不多，直接全部列出
  if (picker.transferOnly) {
    body.replaceChildren(
      el("p", { className: "picker-section", textContent: "可以轉乘的車站" }),
      ...TRANSFER_STATIONS.map((s) => stationRow(s))
    );
    body.scrollTop = 0;
    return;
  }

  // 第二層：某條路線的所有車站
  if (picker.line) {
    const head = el("p", { className: "picker-line-head" }, [lineTag(picker.line), " " + picker.line.name]);
    body.replaceChildren(head, ...picker.line.stations.map((s) => stationRow(s, picker.line)));
    body.scrollTop = 0;
    return;
  }

  // 第一層：最近使用的站 + 路線列表
  const parts = [];
  const recent = store.get("recentStations", []).filter((s) => STATION_LINES.has(s));
  if (recent.length) {
    parts.push(el("p", { className: "picker-section", textContent: "最近使用" }));
    parts.push(
      el("div", { className: "chips" }, recent.map((s) => {
        const c = el("button", { type: "button", className: "chip", textContent: s });
        c.addEventListener("click", () => choose(s));
        return c;
      }))
    );
  }
  parts.push(el("p", { className: "picker-section", textContent: "依路線選擇" }));
  for (const line of LINES) {
    const b = el("button", { type: "button", className: "row" }, [
      lineTag(line),
      el("span", { className: "station-name", textContent: line.name }),
      el("span", { className: "row-meta", textContent: `${line.stations.length} 站 ›` }),
    ]);
    b.addEventListener("click", () => { picker.line = line; renderPicker(); });
    parts.push(b);
  }
  body.replaceChildren(...parts);
  body.scrollTop = 0;
}

$("origin").addEventListener("click", () => openPicker({
  title: "選擇起點站", current: route.origin, onChoose: (s) => { route.origin = s; renderRoute(); },
}));
$("destination").addEventListener("click", () => openPicker({
  title: "選擇終點站", current: route.destination, onChoose: (s) => { route.destination = s; renderRoute(); },
}));
$("picker-search").addEventListener("input", renderPicker);
$("picker-back").addEventListener("click", () => { picker.line = null; renderPicker(); });
$("picker-close").addEventListener("click", () => $("picker").close());
// 點視窗外面的灰色區域也能關閉
$("picker").addEventListener("click", (e) => { if (e.target === $("picker")) $("picker").close(); });

// ---------- 到站／離站方式 ----------
function renderModes() {
  for (const [key, boxId] of [["accessMode", "access-modes"], ["egressMode", "egress-modes"]]) {
    const options = [[null, "不計"], ...Object.entries(MODES)];
    $(boxId).replaceChildren(
      ...options.map(([v, label]) => {
        const c = el("button", { type: "button", className: "chip" + (route[key] === v ? " selected" : ""), textContent: label });
        c.addEventListener("click", () => { route[key] = v; renderModes(); });
        return c;
      })
    );
  }
  // 「台北車站」本身已經有「站」字，不要變成「台北車站站」
  const withZhan = (s) => (s.endsWith("站") ? s : s + "站");
  $("access-label").textContent = `怎麼到${withZhan(route.origin)}？`;
  $("egress-label").textContent = `從${withZhan(route.destination)}出站後，怎麼到目的地？`;
  $("more-summary").textContent = modesText(route);
}

// 例如「腳踏車到站・步行離站」
function modesText(r) {
  return [r.accessMode && MODES[r.accessMode] + "到站", r.egressMode && MODES[r.egressMode] + "離站"]
    .filter(Boolean).join("・");
}

// 反方向：起訖對調，到站和離站的方式也跟著交換（上班騎車到站 = 下班騎車回家）
function reversed(r) {
  return { origin: r.destination, destination: r.origin, accessMode: r.egressMode, egressMode: r.accessMode };
}

// ---------- 常用路線 ----------
function renderSaved() {
  const saved = store.get("savedRoutes", []);
  $("saved-wrap").hidden = !saved.length;
  $("setup-title").hidden = Boolean(saved.length);

  const dirButton = (r) => {
    const b = el("button", { type: "button", className: "row saved-go" }, [
      el("span", { className: "station-name", textContent: `${r.origin} → ${r.destination}` }),
      el("span", { className: "row-meta", textContent: "出發 ›" }),
    ]);
    const m = modesText(r);
    if (m) b.append(el("span", { className: "saved-modes", textContent: m }));
    b.addEventListener("click", () => startTrip(r));
    return b;
  };

  $("saved-list").replaceChildren(
    ...saved.map((s, i) => {
      const del = el("button", { type: "button", className: "icon-btn small", textContent: "✕", ariaLabel: "刪除" });
      del.addEventListener("click", () => {
        if (!confirm(`刪除常用路線「${s.name}」？`)) return;
        saved.splice(i, 1);
        store.set("savedRoutes", saved);
        renderSaved();
      });
      return el("div", { className: "saved-card" }, [
        el("div", { className: "saved-head" }, [el("b", { textContent: s.name }), del]),
        dirButton(s),
        dirButton(reversed(s)),
      ]);
    })
  );
}

$("save-route").addEventListener("click", () => {
  $("save-form").hidden = !$("save-form").hidden;
  if (!$("save-form").hidden) $("route-name").focus();
});

$("save-confirm").addEventListener("click", () => {
  if (route.origin === route.destination) {
    alert("起點和終點不能是同一站");
    return;
  }
  const name = $("route-name").value.trim() || `${route.origin} ↔ ${route.destination}`;
  const saved = store.get("savedRoutes", []);
  saved.push({ name, ...route });
  store.set("savedRoutes", saved);
  $("route-name").value = "";
  $("save-form").hidden = true;
  renderSaved();
  window.scrollTo(0, 0);
});

function startTrip(r) {
  if (r.origin === r.destination) {
    alert("起點和終點不能是同一站");
    return;
  }
  store.set("lastRoute", r);
  const recent = [r.origin, r.destination, ...store.get("recentStations", [])];
  store.set("recentStations", [...new Set(recent)].slice(0, 8));
  // events：每一段開始的時間點，例如 [{type:"wait", t:...}, {type:"ride", t:...}]
  trip = { ...r, events: [], endedAt: null };
  saveTrip();
  showView("track");
}

$("start").addEventListener("click", () => startTrip({ ...route }));

// =========================================================
// 二、碼表
// =========================================================
// 進行中的行程存在本機，重新整理或手機殺掉瀏覽器也不會不見
let trip = store.get("currentTrip", null);
const saveTrip = () => (trip ? store.set("currentTrip", trip) : store.remove("currentTrip"));

function currentPhase() {
  return trip.events.length ? trip.events[trip.events.length - 1].type : null;
}

// 每個階段可以按的按鈕；small 的是不想記錄這一段時用的小字按鈕
function actionsFor(phase) {
  const skipEntry = { text: "已經在月台了，直接開始等車", next: "wait", small: true };
  switch (phase) {
    case null: return [
      ...(trip.accessMode ? [{ text: `出門了，${MODES[trip.accessMode]}前往車站`, next: "access", cls: "access" }] : []),
      { text: "刷卡進站了", next: "entry", cls: "gate" },
      skipEntry,
    ];
    case "access": return [{ text: "刷卡進站了", next: "entry", cls: "gate" }, skipEntry];
    case "entry": return [
      { text: "到月台了，開始等車", next: "wait", cls: "wait" },
      { text: "車剛好在月台，直接上車", next: "ride", cls: "ride" },
    ];
    case "wait": return [{ text: "上車了", next: "ride", cls: "ride" }];
    case "ride": return [
      { text: "下車，要轉乘", next: "transfer", cls: "transfer" },
      { text: "下車，走向出口", next: "exit", cls: "gate" },
      { text: "已經出站了（不記錄出站時間）", next: trip.egressMode ? "egress" : "end", small: true },
    ];
    case "transfer": return [
      { text: "到轉乘月台，開始等車", next: "wait", cls: "wait" },
      { text: "車剛好在月台，直接上車", next: "ride", cls: "ride" },
    ];
    case "exit": return trip.egressMode
      ? [{ text: `刷卡出站了，${MODES[trip.egressMode]}前往目的地`, next: "egress", cls: "access" }]
      : [{ text: "刷卡出站了", next: "end", cls: "finish" }];
    case "egress": return [{ text: "到達目的地", next: "end", cls: "finish" }];
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

// 把事件換算成一段一段的時間；at 是這一段開始的確切時間，之後可以拿來和時刻表比對
function segmentsOf(t, endAt) {
  return t.events.map((e, i) => {
    const end = i + 1 < t.events.length ? t.events[i + 1].t : endAt;
    return { type: e.type, at: new Date(e.t).toISOString(), sec: Math.round((end - e.t) / 1000) };
  });
}

// 例如「07:36」，一律顯示台北時間
function clockTime(iso) {
  return new Date(iso).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

function renderTrack() {
  $("track-origin").textContent = trip.origin;
  $("track-dest").textContent = trip.destination;

  const phase = currentPhase();
  $("actions").replaceChildren(
    ...actionsFor(phase).map((a) => {
      const b = el("button", { className: a.small ? "link-btn action-skip" : "big-btn " + a.cls, type: "button", textContent: a.text });
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

  const idle = trip.accessMode ? "還沒開始，出門時按下面的按鈕" : "還沒開始，刷卡進站時按下面的按鈕";
  $("phase-label").textContent = phase ? PHASES[phase].label : idle;
  $("phase-timer").textContent = phase ? fmt(segs[segs.length - 1].sec) : "0:00";
  $("total-timer").textContent = phase ? fmt((now - trip.events[0].t) / 1000) : "0:00";

  // 新的在上面：正在進行的那段永遠在第一行，不用往下捲
  $("timeline").replaceChildren(
    ...segs.map((s, i) =>
      el("li", { className: PHASES[s.type].cls + (i === segs.length - 1 ? " current" : " past") }, [
        el("span", {}, [PHASES[s.type].label.replace("中", ""), el("small", { className: "seg-time", textContent: clockTime(s.at) })]),
        el("span", { textContent: fmt(s.sec) }),
      ])
    ).reverse()
  );
}
setInterval(tick, 1000);
// 從背景切回來時立刻更新畫面
document.addEventListener("visibilitychange", tick);

// =========================================================
// 三、結果確認與送出
// =========================================================
function buildRecord(t) {
  // 轉乘那幾段併入使用者在確認畫面填的轉乘站和標籤（沒填的就不加）
  let k = 0;
  const segments = segmentsOf(t, t.endedAt).map((s) => {
    if (s.type !== "transfer") return s;
    const info = (t.transferInfo || [])[k++] || {};
    return {
      ...s,
      ...(info.station && { station: info.station }),
      ...(info.ran && { ran: true }),
      ...(info.missed && { missed: true }),
    };
  });
  const sum = (type) => segments.filter((s) => s.type === type).reduce((a, s) => a + s.sec, 0);
  // 時段以刷卡進站（沒按就是開始等車）的時間為準，不含在家門口出發的時間
  const first = t.events.find((e) => STATION_TYPES.includes(e.type)) || t.events[0];
  const started = new Date(first.t);
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
    // 這趟沒有按到站／離站，就算原本有設定方式也記成空的
    entry_sec: segments.some((s) => s.type === "entry") ? sum("entry") : null,
    exit_sec: segments.some((s) => s.type === "exit") ? sum("exit") : null,
    access_mode: segments.some((s) => s.type === "access") ? t.accessMode : null,
    access_sec: segments.some((s) => s.type === "access") ? sum("access") : null,
    egress_mode: segments.some((s) => s.type === "egress") ? t.egressMode : null,
    egress_sec: segments.some((s) => s.type === "egress") ? sum("egress") : null,
    note: null,
    client_id: clientId(),
  };
}

// 送到資料庫的版本：只留統計需要的部分（資料最小化），完整紀錄留在手機上
// - 到站／離站不上傳：和住家、公司位置有關，本來也不列入統計
// - 時刻四捨五入到分鐘，夠對照時刻表；各段秒數已經用原始時間算好，維持精確到秒
// - 備註只有使用者勾選時才上傳
const roundMinute = (iso) => new Date(Math.round(Date.parse(iso) / 60000) * 60000).toISOString();

function toUpload(r, withNote) {
  const { access_mode, access_sec, egress_mode, egress_sec, ...rest } = r;
  return {
    ...rest,
    started_at: roundMinute(r.started_at),
    segments: r.segments
      .filter((s) => s.type !== "access" && s.type !== "egress")
      .map((s) => ({ ...s, at: roundMinute(s.at) })),
    note: withNote ? r.note : null,
  };
}

// 閘門到閘門：進站、出站兩段都有記錄才算得出來
const gateSec = (r) => (r.entry_sec == null || r.exit_sec == null ? null : r.entry_sec + r.total_sec + r.exit_sec);

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

// ---------- 轉乘資訊 ----------
// 上次這條路線的轉乘站；反方向走過的也可以倒過來用
function rememberedTransfers(o, d) {
  const m = store.get("lastTransfers", {});
  return m[pairKey(o, d)] || (m[pairKey(d, o)] || []).slice().reverse();
}

function ensureTransferInfo() {
  if (trip.transferInfo) return;
  const n = trip.events.filter((e) => e.type === "transfer").length;
  const remembered = rememberedTransfers(trip.origin, trip.destination);
  // 轉乘次數和上次一樣才自動帶入，不然站會對錯位置
  trip.transferInfo = Array.from({ length: n }, (_, i) => ({ station: remembered.length === n ? remembered[i] : null }));
  saveTrip();
}

function renderTransfers(segments) {
  const transfers = segments.filter((s) => s.type === "transfer");
  if (!transfers.length) {
    $("sum-transfers").replaceChildren();
    return;
  }
  $("sum-transfers").replaceChildren(
    el("h3", { textContent: "轉乘資訊（選填）" }),
    el("p", { className: "hint", textContent: "記下在哪一站轉乘，就能統計各站的轉乘時間。下次走同一條路線會自動帶入。" }),
    ...transfers.map((s, i) => {
      const info = trip.transferInfo[i];
      const stationBtn = el("button", { type: "button", className: "station-field" },
        info.station ? stationLabel(info.station) : [el("span", { className: "placeholder", textContent: "選擇轉乘站" })]);
      stationBtn.addEventListener("click", () => openPicker({
        title: `第 ${i + 1} 次轉乘的車站`,
        current: info.station,
        transferOnly: true,
        onChoose: (st) => { info.station = st; saveTrip(); renderSummary(); },
      }));
      const tag = (key, label) => {
        const c = el("button", { type: "button", className: "chip" + (info[key] ? " selected" : ""), textContent: label });
        c.addEventListener("click", () => { info[key] = !info[key]; saveTrip(); renderSummary(); });
        return c;
      };
      return el("div", { className: "transfer-row" }, [
        el("div", { className: "transfer-head" }, [
          el("b", { textContent: `第 ${i + 1} 次轉乘` }),
          el("span", { className: "row-meta", textContent: `步行 ${fmt(s.sec)}` }),
        ]),
        stationBtn,
        el("div", { className: "chips" }, [tag("ran", "🏃 用跑的"), tag("missed", "🚃 到月台時車剛好開走")]),
      ]);
    })
  );
}

function renderSummary() {
  ensureTransferInfo();
  const r = buildRecord(trip);
  const parts = [
    { type: "access", sec: r.access_sec },
    { type: "entry", sec: r.entry_sec },
    { type: "wait", sec: r.wait_sec },
    { type: "ride", sec: r.ride_sec },
    { type: "transfer", sec: r.transfer_sec },
    { type: "exit", sec: r.exit_sec },
    { type: "egress", sec: r.egress_sec },
  ].filter((p) => p.sec !== null);
  const gate = gateSec(r);
  $("sum-title").textContent = gate === null ? "這趟花了" : "閘門到閘門花了";
  $("sum-total").textContent = fmt(gate ?? r.total_sec);
  $("sum-route").textContent = `${clockTime(r.started_at)} ${r.origin} → ${r.destination}・${BAND_LABELS[r.time_band]}・轉乘 ${r.transfers} 次`;
  const inStation = r.total_sec + (r.entry_sec || 0) + (r.exit_sec || 0);
  const door = inStation + (r.access_sec || 0) + (r.egress_sec || 0);
  const notes = [];
  if (gate !== null) notes.push(`月台到月台（等車＋乘車＋轉乘）${fmt(r.total_sec)}。`);
  if (door !== inStation) notes.push(`加上到站、離站，出門到抵達共 ${fmt(door)}；這兩段只存在你的手機，不會上傳。`);
  $("sum-door").hidden = !notes.length;
  $("sum-door").textContent = notes.join("");
  $("consent").hidden = !ONLINE;
  renderStackBar($("sum-bar"), parts);
  renderLegend($("sum-parts"), parts);
  renderTransfers(r.segments);
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
    if (ONLINE) await insertTrip(toUpload(r, $("note-share").checked));
    const stations = trip.transferInfo.map((i) => i.station);
    if (stations.length && stations.every(Boolean)) {
      const m = store.get("lastTransfers", {});
      m[pairKey(r.origin, r.destination)] = stations;
      store.set("lastTransfers", m);
    }
    const history = store.get("history", []);
    history.unshift(r);
    store.set("history", history.slice(0, 500));
    trip = null;
    saveTrip();
    $("note").value = "";
    $("note-share").checked = false;
    alert(ONLINE ? "已送出，謝謝你提供數據！同一條路線累積 5 人以上，就會出現在統計頁。" : "已存到這台裝置（本機模式）");
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
// 網址填成 https://xxx.supabase.co 或 https://xxx.supabase.co/rest/v1/ 都可以
const API_BASE = SUPABASE_URL.replace(/\/+$/, "").replace(/\/rest\/v1$/, "") + "/rest/v1";

function apiHeaders() {
  const headers = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
  // 舊式 anon key（eyJ 開頭）才需要放進 Authorization；新式 sb_publishable_ 只要 apikey 就夠
  if (SUPABASE_ANON_KEY.startsWith("eyJ")) headers.Authorization = "Bearer " + SUPABASE_ANON_KEY;
  return headers;
}

async function insertTrip(record) {
  const res = await fetch(API_BASE + "/trips", {
    method: "POST",
    headers: { ...apiHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    // 資料庫自訂的錯誤（例如「送出太頻繁了」）直接顯示中文訊息，其他的顯示狀態碼
    const body = await res.json().catch(() => ({}));
    throw new Error(body.code === "P0001" ? body.message : `HTTP ${res.status}`);
  }
}

// 統計結果的格式：每條路線每個時段一列，time_band 為 "all" 的是不分時段的合計
async function fetchStats() {
  if (!ONLINE) return computeStats(store.get("history", []));
  const res = await fetch(API_BASE + "/rpc/trip_stats", { headers: apiHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// 本機模式：用自己的紀錄算出和資料庫 trip_stats() 一樣格式的結果（自己的資料不設最少筆數）
function computeStats(trips) {
  const groups = new Map();
  for (const t of trips) {
    for (const band of ["all", t.time_band]) {
      const k = `${t.origin}\n${t.destination}\n${band}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(t);
    }
  }
  return [...groups.entries()].map(([k, list]) => {
    const [origin, destination, time_band] = k.split("\n");
    const col = (name, rows = list) => rows.map((t) => t[name]);
    const gated = list.filter((t) => gateSec(t) !== null);
    const g = gated.length > 0;
    return {
      origin, destination, time_band, n: list.length, people: 1,
      total_p25: percentile(col("total_sec"), 0.25),
      total_p50: median(col("total_sec")),
      total_p75: percentile(col("total_sec"), 0.75),
      wait_p50: median(col("wait_sec")),
      ride_p50: median(col("ride_sec")),
      transfer_p50: median(col("transfer_sec")),
      gate_n: g ? gated.length : null,
      gate_p25: g ? percentile(gated.map(gateSec), 0.25) : null,
      gate_p50: g ? median(gated.map(gateSec)) : null,
      gate_p75: g ? percentile(gated.map(gateSec), 0.75) : null,
      entry_p50: g ? median(col("entry_sec", gated)) : null,
      exit_p50: g ? median(col("exit_sec", gated)) : null,
    };
  });
}

// =========================================================
// 統計
// =========================================================
let stats = [];
const pairKey = (o, d) => `${o}→${d}`;
const statOf = (k, band) => stats.find((r) => pairKey(r.origin, r.destination) === k && r.time_band === band);

async function loadStats() {
  $("stats-body").replaceChildren(el("p", { className: "hint", textContent: "載入中…" }));
  try {
    stats = await fetchStats();
  } catch (err) {
    $("stats-body").replaceChildren(el("p", { className: "hint", textContent: "讀取資料失敗：" + err.message }));
    return;
  }

  // 依筆數排序路線
  const pairs = stats
    .filter((r) => r.time_band === "all")
    .sort((a, b) => b.n - a.n)
    .map((r) => [pairKey(r.origin, r.destination), r.n]);

  const select = $("stats-pair");
  const prev = select.value;
  select.replaceChildren(...pairs.map(([k, n]) => el("option", { value: k, textContent: `${k}（${n} 筆）` })));
  if (pairs.some(([k]) => k === prev)) select.value = prev;

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
  const minNote = ONLINE ? "為了保護個人隱私，有 5 人以上記錄的路線和時段才會顯示（同一個人記很多筆也只算 1 人）。" : "";
  if (!stats.length) {
    body.replaceChildren(
      el("p", { className: "hint", textContent: "還沒有可以顯示的統計，搭車時記一筆吧！" }),
      el("p", { className: "hint", textContent: minNote })
    );
    return;
  }
  const k = $("stats-pair").value;
  const r = statOf(k, $("stats-band").value);

  if (!r) {
    body.replaceChildren(el("p", { className: "hint", textContent: "這個時段的紀錄還不夠多。" + minNote }));
    return;
  }

  const hasGate = r.gate_p50 != null;
  const parts = [
    ...(hasGate ? [{ type: "entry", sec: r.entry_p50 }] : []),
    { type: "wait", sec: r.wait_p50 },
    { type: "ride", sec: r.ride_p50 },
    { type: "transfer", sec: r.transfer_p50 },
    ...(hasGate ? [{ type: "exit", sec: r.exit_p50 }] : []),
  ];
  const bar = el("div", { className: "stack-bar" });
  const legend = el("ul", { className: "legend" });
  renderStackBar(bar, parts);
  renderLegend(legend, parts, fmtMin);

  const card = el("div", { className: "stat-card" }, [
    el("div", { className: "stat-sub", textContent: "月台到月台（等車＋乘車＋轉乘）中位數" }),
    el("div", { className: "stat-big", textContent: fmtMin(r.total_p50) }),
    el("div", {
      className: "stat-sub",
      textContent: `一半的紀錄落在 ${fmtMin(r.total_p25)} ～ ${fmtMin(r.total_p75)}・共 ${r.n} 筆` + (ONLINE ? `、${r.people} 人` : ""),
    }),
    ...(hasGate ? [el("div", {
      className: "stat-sub gate-line",
      textContent: `閘門到閘門中位數 ${fmtMin(r.gate_p50)}（${fmtMin(r.gate_p25)} ～ ${fmtMin(r.gate_p75)}・${r.gate_n} 筆有記錄進出站）`,
    })] : []),
    bar,
    el("div", { className: "stat-sub", textContent: "各段中位數" }),
    legend,
  ]);
  if (r.n < 5) {
    card.append(el("p", { className: "hint", textContent: "⚠ 樣本還很少，數字僅供參考。" }));
  }

  // 各時段比較
  const table = el("table", { className: "band-table" });
  table.append(el("tr", {}, ["時段", "筆數", "全程", "等車", "轉乘"].map((h) => el("th", { textContent: h }))));
  for (const b of ["peak", "offpeak", "weekend"]) {
    const br = statOf(k, b);
    const cells = br
      ? [BAND_LABELS[b], br.n, fmtMin(br.total_p50), fmtMin(br.wait_p50), fmtMin(br.transfer_p50)]
      : [BAND_LABELS[b], ONLINE ? "不足 5 人" : 0, "—", "—", "—"];
    table.append(el("tr", {}, cells.map((c) => el("td", { textContent: String(c) }))));
  }
  card.append(table);
  if (minNote) card.append(el("p", { className: "hint", textContent: minNote }));

  body.replaceChildren(card);
}

$("export").addEventListener("click", () => {
  if (!stats.length) return;
  const cols = ["origin", "destination", "time_band", "n", "people", "total_p25", "total_p50", "total_p75", "wait_p50", "ride_p50",
    "transfer_p50", "gate_n", "gate_p25", "gate_p50", "gate_p75", "entry_p50", "exit_p50"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  // 授權與來源放在檔名和每一列的最後兩欄：第一列維持欄位名稱，Excel 和程式都能正常解析。時間單位為秒
  const source = `通勤碼表 ${location.origin + location.pathname}`;
  const csv = [
    [...cols, "license", "source"].join(","),
    ...stats.map((t) => [...cols.map((c) => esc(t[c])), esc("CC BY-SA 4.0"), esc(source)].join(",")),
  ].join("\n");
  // 開頭加 BOM，Excel 打開中文才不會亂碼
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "commute-stats_CC-BY-SA-4.0.csv" });
  a.click();
  URL.revokeObjectURL(a.href);
});

// =========================================================
// 我的紀錄
// =========================================================
// ---------- 個人路線比較 ----------
let myBand = "all";

// 這筆紀錄的「走法」：到站／離站方式 + 經過哪些轉乘站
function variantOf(r) {
  const modes = modesText({ accessMode: r.access_mode, egressMode: r.egress_mode });
  const transfers = (r.segments || []).filter((s) => s.type === "transfer");
  const via = !transfers.length ? "直達"
    : transfers.every((s) => s.station) ? "經" + transfers.map((s) => s.station).join("、")
    : `轉乘 ${transfers.length} 次（未記錄轉乘站）`;
  return [modes, via].filter(Boolean).join("・");
}

// 車站裡（有記錄進出站就是閘門到閘門）；出門到抵達再加上到站、離站
const inStationSec = (r) => r.total_sec + (r.entry_sec || 0) + (r.exit_sec || 0);
const doorSec = (r) => inStationSec(r) + (r.access_sec || 0) + (r.egress_sec || 0);

function renderMyStats() {
  const bands = [["all", "全部"], ["peak", "平日尖峰"], ["offpeak", "平日離峰"], ["weekend", "假日"]];
  $("my-band").replaceChildren(...bands.map(([v, label]) => {
    const c = el("button", { type: "button", className: "chip" + (myBand === v ? " selected" : ""), textContent: label });
    c.addEventListener("click", () => { myBand = v; renderMyStats(); });
    return c;
  }));

  const list = store.get("history", []).filter((r) => myBand === "all" || r.time_band === myBand);
  if (!list.length) {
    $("my-stats").replaceChildren(el("p", { className: "hint", textContent: "這個時段還沒有紀錄。" }));
    return;
  }

  // 起訖點 → 走法 → 紀錄
  const pairs = new Map();
  for (const r of list) {
    const k = pairKey(r.origin, r.destination);
    if (!pairs.has(k)) pairs.set(k, new Map());
    const variants = pairs.get(k);
    const v = variantOf(r);
    if (!variants.has(v)) variants.set(v, []);
    variants.get(v).push(r);
  }

  const cards = [...pairs.entries()]
    .sort((a, b) => [...b[1].values()].flat().length - [...a[1].values()].flat().length)
    .map(([k, variants]) => {
      const rows = [...variants.entries()].map(([v, rs]) => ({
        v, n: rs.length,
        door: median(rs.map(doorSec)), doorLo: percentile(rs.map(doorSec), 0.25), doorHi: percentile(rs.map(doorSec), 0.75),
        station: median(rs.map(inStationSec)),
      })).sort((a, b) => a.door - b.door);

      const table = el("table", { className: "band-table" });
      table.append(el("tr", {}, ["走法", "筆數", "出門到抵達", "車站到車站"].map((h) => el("th", { textContent: h }))));
      rows.forEach((row, i) => {
        // 兩種以上走法才標最快；3 筆以上才顯示範圍，不然範圍沒有意義
        const best = rows.length > 1 && i === 0 ? "★ " : "";
        const range = row.n >= 3 ? `（${fmtMin(row.doorLo)}～${fmtMin(row.doorHi)}）` : "";
        table.append(el("tr", {}, [best + row.v, row.n, fmtMin(row.door) + range, fmtMin(row.station)]
          .map((c) => el("td", { textContent: String(c) }))));
      });
      return el("div", { className: "stat-card my-card" }, [el("b", { textContent: k }), table]);
    });
  $("my-stats").replaceChildren(
    ...cards,
    el("p", { className: "hint", textContent: "數字都是中位數。★ 是這個起訖點目前最快的走法；沒記錄到站／離站的，出門到抵達等於車站到車站。" })
  );
}

function renderHistory() {
  $("my-client-id").textContent = clientId();
  renderMyStats();
  const list = store.get("history", []);
  if (!list.length) {
    $("history-list").replaceChildren(el("p", { className: "hint", textContent: "還沒有紀錄。" }));
    return;
  }
  $("history-list").replaceChildren(
    ...list.map((r) =>
      el("li", {}, [
        `${r.origin} → ${r.destination}　${fmt(gateSec(r) ?? r.total_sec)}`,
        el("span", {
          className: "meta",
          textContent: [
            new Date(r.started_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }),
            r.access_mode && `${MODES[r.access_mode]}到站 ${fmt(r.access_sec)}`,
            r.entry_sec != null && `進站 ${fmt(r.entry_sec)}`,
            `等 ${fmt(r.wait_sec)}`, `乘 ${fmt(r.ride_sec)}`, `轉 ${fmt(r.transfer_sec)}`,
            variantOf({ segments: r.segments }),
            r.exit_sec != null && `出站 ${fmt(r.exit_sec)}`,
            r.egress_mode && `${MODES[r.egress_mode]}離站 ${fmt(r.egress_sec)}`,
            r.note,
          ].filter(Boolean).join("・"),
        }),
      ])
    )
  );
}

// =========================================================
// 隱私與使用說明
// =========================================================
// 頁面裡的 data-goto 連結（例如送出按鈕旁的〈隱私與使用說明〉）
document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-goto]");
  if (!link) return;
  e.preventDefault();
  showView(link.dataset.goto);
  window.scrollTo(0, 0);
});

function renderPrivacy() {
  $("privacy-client-id").textContent = clientId();
  const email = typeof CONTACT_EMAIL === "string" ? CONTACT_EMAIL : "";
  $("contact-email-item").hidden = !email;
  if (email) {
    $("contact-email").href = "mailto:" + email;
    $("contact-email").textContent = email;
  }
}

// ---------- 啟動 ----------
if (!ONLINE) {
  $("mode-banner").hidden = false;
  $("mode-banner").textContent = "目前是本機模式：紀錄只存在這台裝置，統計也只看得到自己的。設定資料庫後就能和大家一起統計。";
}
renderSaved();
showView("record");
