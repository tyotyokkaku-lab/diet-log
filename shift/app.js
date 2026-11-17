import Anthropic from "../vendor/anthropic-sdk-1.3.0.js";
import { syncConfigured, startSync, stopSync, pushDiff } from "./sync.js?v=2026-11-17v";

// ---------- 定数 ----------
const MODEL = "claude-opus-5-5";
const STORE_KEY = "shiftcal.v1";
const KEY_KEY = "shiftcal.apiKey";
const DIET_KEY_KEY = "dietlog.apiKey"; // 同じサイトの食事ログに入れたキーも使えるように
const APP_VERSION = "2026-11-17v";
const PEOPLE = ["him", "her"];
const TYPES = [
  { id: "off", label: "休み" },
  { id: "work", label: "仕事" },
  { id: "plan", label: "予定" },
  { id: "none", label: "未設定" },
];
const WD = ["日", "月", "火", "水", "木", "金", "土"];

// ---------- 保存データ ----------
// shifts[person][YYYY-MM-DD] = { type: off|work|plan|none, label, start, end, note, u(更新時刻) }
// type "none" は「消した」記録（共有したときに相手側でも消えるように残しておく）
const defaultState = () => ({
  names: { him: "彼氏", her: "彼女" },
  shifts: { him: {}, her: {} },
  labelColors: {}, // シフト名 → 色（#rrggbb）。スクショの色や手で選んだ色
  avail: { him: {}, her: {} }, // avail[person][date] = { v: "ok"|"ng"|"", u }  会える○ / 無理✕
  types: { him: {}, her: {} }, // シフトの種類 types[person][名前] = { start, end, u, del? }
});
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    const d = defaultState();
    return {
      names: { ...d.names, ...s.names },
      shifts: { him: s.shifts?.him || {}, her: s.shifts?.her || {} },
      avail: { him: s.avail?.him || {}, her: s.avail?.her || {} },
      labelColors: s.labelColors || {},
      types: { him: s.types?.him || {}, her: s.types?.her || {} },
    };
  } catch {
    return defaultState();
  }
}
let state = load();
const OFF_WORD = /^(休|休み|公休|有給|有休|希望休|OFF|オフ|×)$/i;
// これまでに入っているシフトから「シフトの種類」を作る（よく使われている時間をその種類の時間にする）
function typesFromShifts(p) {
  const by = {};
  for (const e of Object.values(state.shifts[p])) {
    if (e.type !== "work" || !e.label || OFF_WORD.test(e.label)) continue;
    const k = `${e.start}|${e.end}`;
    ((by[e.label] ||= {})[k] = (by[e.label][k] || 0) + 1);
  }
  for (const [label, times] of Object.entries(by)) {
    if (state.types[p][label]) continue;
    const [start, end] = Object.entries(times).sort((a, b) => b[1] - a[1])[0][0].split("|");
    state.types[p][label] = { start, end, u: 1 };
  }
}
for (const p of ["him", "her"]) typesFromShifts(p);
function ensureType(p, label, start, end) {
  if (!label || OFF_WORD.test(label)) return;
  const t = state.types[p][label];
  if (!t || t.del) state.types[p][label] = { start: start || "", end: end || "", u: Date.now() };
}
function typeList(p) {
  const count = {};
  for (const e of Object.values(state.shifts[p])) if (e.type === "work" && e.label) count[e.label] = (count[e.label] || 0) + 1;
  return Object.entries(state.types[p]).filter(([, t]) => !t.del)
    .sort((a, b) => (count[b[0]] || 0) - (count[a[0]] || 0) || a[0].localeCompare(b[0], "ja"))
    .map(([label, t]) => ({ label, ...t }));
}
function saveLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { alert("保存できませんでした：" + e.message); }
}
let pushTimer = null;
function save() {
  saveLocal();
  // 自動同期中なら、少しまとめてからサーバーに送る
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushDiff(state, PEOPLE), 300);
}
function getKey() {
  try { return localStorage.getItem(KEY_KEY) || localStorage.getItem(DIET_KEY_KEY) || ""; } catch { return ""; }
}
function setKey(v) {
  try { v ? localStorage.setItem(KEY_KEY, v) : localStorage.removeItem(KEY_KEY); } catch {}
}

// ---------- ユーティリティ ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const todayStr = () => { const t = new Date(); return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate()); };
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function dateLabel(s) { const dt = parseDate(s); return `${dt.getMonth() + 1}/${dt.getDate()}(${WD[dt.getDay()]})`; }
const nm = (p) => state.names[p] || (p === "him" ? "彼氏" : "彼女");

function getShift(p, date) {
  const e = state.shifts[p][date];
  return e && e.type !== "none" ? e : null;
}
function setShift(p, date, e) {
  state.shifts[p][date] = { type: e.type, label: e.label || "", start: e.start || "", end: e.end || "", note: e.note || "", u: Date.now() };
}

const getAvail = (p, date) => state.avail[p][date]?.v || "";
function toggleAvail(p, date, v) {
  state.avail[p][date] = { v: getAvail(p, date) === v ? "" : v, u: Date.now() };
}

// "09:00" → "9"、"09:30" → "9:30"
function hm(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  return m === "00" ? String(+h) : `${+h}:${m}`;
}
function timeText(e) {
  if (!e.start && !e.end) return "";
  return `${hm(e.start)}-${hm(e.end)}`;
}
function chipHtml(e) {
  if (!e) return `<span class="chip empty">–</span>`;
  if (e.type === "off") return `<span class="chip off">${esc(e.label && e.label.length <= 3 ? e.label : "休み")}</span>`;
  const main = e.label || (e.type === "work" ? (timeText(e) ? "" : "仕事") : "予定");
  const t = timeText(e);
  // ふたりタブと同じ色（シフト名ごとの色）
  // 名前が長いときは文字を小さくして全部見えるようにする（全角1文字=1、半角=0.55で数える）
  const w = [...(main || "")].reduce((n, ch) => n + (/[\x20-\x7e]/.test(ch) ? 0.55 : 1), 0);
  const fit = w <= 3 ? "" : w <= 4 ? "fit4" : w <= 5 ? "fit5" : "fit6";
  return `<span class="chip ${e.type}" style="--pc:${pillColor(e.label || t || e.type)}">${main ? `<b class="${fit}">${esc(main)}</b>` : ""}${t ? `<small>${esc(t)}</small>` : ""}</span>`;
}
function describe(e) {
  if (!e) return "未設定";
  const t = timeText(e);
  const base = e.type === "off" ? (e.label || "休み") : (e.label || (e.type === "work" ? "仕事" : "予定"));
  return [base, t].filter(Boolean).join(" ") + (e.note ? `（${e.note}）` : "");
}

// ---------- 表示中の月・画面 ----------
let cur = (() => { const t = new Date(); return { y: t.getFullYear(), m: t.getMonth() + 1 }; })();
let view = "us";

function monthDays(y, m) {
  const first = new Date(y, m - 1, 1).getDay();
  const n = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= n; d++) cells.push(ymd(y, m, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

function calendarHtml(cellFn) {
  const today = todayStr();
  const head = WD.map((w, i) => `<div class="wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${w}</div>`).join("");
  const body = monthDays(cur.y, cur.m).map((date) => {
    if (!date) return `<div class="day blank"></div>`;
    const dow = parseDate(date).getDay();
    const { cls = "", inner = "" } = cellFn(date);
    return `<button type="button" class="day ${cls} ${date === today ? "today" : ""}" data-date="${date}">
      <span class="dn ${dow === 0 ? "sun" : dow === 6 ? "sat" : ""}">${+date.slice(8)}</span>${inner}</button>`;
  }).join("");
  return `<div class="cal">${head}${body}</div>`;
}

const bothOff = (date) => getShift("him", date)?.type === "off" && getShift("her", date)?.type === "off";

function typeBtnHtml(t, attrs = "") {
  const time = t.start || t.end ? `${hm(t.start)}〜${hm(t.end)}` : "";
  return `<button type="button" class="type-btn" style="--pc:${pillColor(t.label)}" ${attrs}><b>${esc(t.label)}</b>${time ? `<small>${esc(time)}</small>` : ""}</button>`;
}
function renderTypes(p) {
  const list = typeList(p);
  $("typeList").innerHTML = list.map((t) => typeBtnHtml(t, `data-tl="${esc(t.label)}"`)).join("")
    + `<button type="button" class="type-add" id="typeAdd">＋ 追加</button>`;
}
function renderPerson(p) {
  renderTypes(p);
  $("personTitle").innerHTML = `<i class="dot ${p}"></i>${esc(nm(p))}のシフト`;
  $("ocrWho").textContent = nm(p);
  $("personCal").innerHTML = calendarHtml((date) => {
    const e = getShift(p, date);
    return { inner: chipHtml(e) };
  });
}

// シフト名ごとに決まった色をつける（同じ名前はいつも同じ色）
const PILL_COLORS = ["#3fae80", "#e0703f", "#a39c63", "#3f95e0", "#9d7bd8", "#5c7aa6", "#d39a2a", "#2f9e9e", "#c45f8f", "#7a8f3a"];
// 初めて出てきたシフト名から順に色を割り当てて覚えておく（色かぶりを防ぐ）
let colorMap = (() => { try { return JSON.parse(localStorage.getItem("shiftcal.colors") || "{}"); } catch { return {}; } })();
// 元のシフトアプリの色（送ってもらったスクショから）
const PRESET_COLORS = { "2t": "#b2ad7b", 明け: "#a784d2", 新町: "#6882a5" };
// 固定の色（スクショの色や手で選んだ色より優先。遅番＝夜勤の青、中番＝日勤のオレンジ）
const FIXED_COLORS = { 遅番: "#49a3ed", 夜勤: "#49a3ed", 中番: "#e47548", 日勤: "#e47548" };
const isHex = (c) => /^#[0-9a-f]{6}$/i.test(c || "");
function pillColor(key) {
  if (FIXED_COLORS[key]) return FIXED_COLORS[key];
  if (isHex(state.labelColors[key])) return state.labelColors[key];
  if (PRESET_COLORS[key]) return PRESET_COLORS[key];
  if (!(key in colorMap)) {
    const used = new Set(Object.values(colorMap));
    let i = PILL_COLORS.findIndex((_, k) => !used.has(k));
    if (i < 0) i = Object.keys(colorMap).length % PILL_COLORS.length;
    colorMap[key] = i;
    try { localStorage.setItem("shiftcal.colors", JSON.stringify(colorMap)); } catch {}
  }
  return PILL_COLORS[colorMap[key]];
}
let usMode = (() => { try { return localStorage.getItem("shiftcal.usMode") || "name"; } catch { return "name"; } })();
function pillHtml(e) {
  if (!e) return `<span class="pill none">–</span>`;
  if (e.type === "off") return `<span class="pill off">${esc(e.label && e.label.length <= 3 ? e.label : "休み")}</span>`;
  const t = e.start || e.end ? `${hm(e.start)}〜${hm(e.end)}` : "";
  const name = e.label || (e.type === "work" ? "" : "予定");
  const showTime = usMode === "time" ? !!t : !name && !!t;
  const text = showTime ? t : (name || "仕事");
  const color = pillColor(e.label || timeText(e) || e.type);
  return `<span class="pill ${e.type} ${showTime ? "time" : ""}" style="--pc:${color}">${esc(text)}</span>`;
}

function renderUs() {
  const today = todayStr();
  const n = new Date(cur.y, cur.m, 0).getDate();
  const ox = (p, date) => {
    const a = getAvail(p, date);
    return `<div class="ox">
        <button type="button" class="ok" data-av="ok" data-who="${p}" data-d="${date}" aria-pressed="${a === "ok"}" aria-label="${esc(nm(p))}：行ける">○</button>
        <button type="button" class="ng" data-av="ng" data-who="${p}" data-d="${date}" aria-pressed="${a === "ng"}" aria-label="${esc(nm(p))}：無理">✕</button>
      </div>`;
  };
  // ふたりタブは見るだけ（シフトの変更はそれぞれのカレンダーで）
  const shift = (p, date) => `<div class="us-shift">${pillHtml(getShift(p, date))}</div>`;
  let rows = "";
  for (let d = 1; d <= n; d++) {
    const date = ymd(cur.y, cur.m, d);
    const dow = parseDate(date).getDay();
    const bothOk = getAvail("him", date) === "ok" && getAvail("her", date) === "ok";
    const cls = [bothOff(date) && "both-off", bothOk && "both-ok", date === today && "today", date < today && "past", dow === 0 && "sun", dow === 6 && "sat"].filter(Boolean).join(" ");
    rows += `<div class="us-row ${cls}">
      <div class="us-date"><b>${pad(d)}</b><small>(${WD[dow]})</small></div>
      ${shift("him", date)}${ox("him", date)}
      <div class="us-mid">${bothOk ? `<span class="heart" aria-label="2人とも○">♡</span>` : ""}</div>
      ${shift("her", date)}${ox("her", date)}
    </div>`;
  }
  $("usHead").innerHTML = `<div class="us-head"><span></span><span class="h-him"><i class="dot him"></i>${esc(nm("him"))}</span><span></span><span class="h-her"><i class="dot her"></i>${esc(nm("her"))}</span></div>`;
  $("usCal").innerHTML = `<div class="us-list">${rows}</div>`;
  document.querySelectorAll("#usMode button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mode === usMode));
}
$("usMode").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-mode]");
  if (!b) return;
  usMode = b.dataset.mode;
  try { localStorage.setItem("shiftcal.usMode", usMode); } catch {}
  renderUs();
});

function renderNames() {
  document.querySelectorAll(".nm-him").forEach((el) => (el.textContent = nm("him")));
  document.querySelectorAll(".nm-her").forEach((el) => (el.textContent = nm("her")));
}

function render() {
  $("monthLabel").textContent = `${cur.y}年${cur.m}月`;
  renderNames();
  document.body.dataset.view = view;
  $("view-person").hidden = !PEOPLE.includes(view);
  $("view-us").hidden = view !== "us";
  $("view-settings").hidden = view !== "settings";
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  if (PEOPLE.includes(view)) renderPerson(view);
  if (view === "us") renderUs();
}

// ---------- 日にちの編集 ----------
let editing = null; // { date, who }
function openDay(date, who) {
  editing = { date, who, fixed: PEOPLE.includes(view) };
  $("dTitle").textContent = dateLabel(date);
  $("dWho").hidden = editing.fixed;
  $("dWho").innerHTML = PEOPLE.map((p) =>
    `<button type="button" data-who="${p}"><i class="dot ${p}"></i>${esc(nm(p))}<small>${esc(describe(getShift(p, date)))}</small></button>`).join("");
  fillDayForm();
  $("dayDialog").showModal();
}
function fillDayForm() {
  const e = getShift(editing.who, editing.date);
  editing.type = e?.type || "none";
  $("dLabel").value = e?.type === "off" ? "" : (e?.label || ""); // 休みの名前（「休み」「公休」など）は仕事の名前に持ち越さない
  $("dStart").value = e?.start || "";
  $("dEnd").value = e?.end || "";
  $("dNote").value = e?.note || "";
  updateColorField();
  document.querySelectorAll("#dWho button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.who === editing.who));
  renderTypeSeg();
}
function updateColorField() {
  const label = $("dLabel").value.trim();
  $("dColorField").hidden = !label || !!FIXED_COLORS[label]; // 固定の色のシフトは色を選ばせない
  if (label) {
    const c = pillColor(label);
    $("dColor").value = isHex(c) ? c : "#888888";
  }
}
$("dLabel").addEventListener("input", updateColorField);
function renderQuick() {
  const list = editing.type === "work" ? typeList(editing.who) : [];
  $("dQuick").hidden = !list.length;
  const cur = $("dLabel").value.trim();
  $("dQuick").innerHTML = list.map((t) => typeBtnHtml(t, `data-q="${esc(t.label)}" aria-pressed="${t.label === cur}"`)).join("");
}
$("dQuick").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-q]");
  if (!b) return;
  const t = state.types[editing.who][b.dataset.q];
  $("dLabel").value = b.dataset.q;
  $("dStart").value = t?.start || "";
  $("dEnd").value = t?.end || "";
  updateColorField(); renderQuick();
});
$("dLabel").addEventListener("input", () => renderQuick());
function renderTypeSeg() {
  $("dType").innerHTML = TYPES.map((t) =>
    `<button type="button" role="radio" data-type="${t.id}" aria-checked="${t.id === editing.type}" class="t-${t.id}">${t.label}</button>`).join("");
  $("dWorkFields").hidden = editing.type === "off" || editing.type === "none";
  renderQuick();
}
$("dWho").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-who]");
  if (!b) return;
  editing.who = b.dataset.who;
  fillDayForm();
});
$("dType").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-type]");
  if (!b) return;
  editing.type = b.dataset.type;
  // 名前欄に休みを表す言葉が残っていたら消す
  if (/^(休|休み|公休|有給|有休|希望休|OFF|オフ|×)$/i.test($("dLabel").value.trim())) $("dLabel").value = "";
  updateColorField();
  renderTypeSeg();
});
$("dayDialog").addEventListener("close", () => {
  if ($("dayDialog").returnValue !== "save" || !editing) return;
  const isOff = editing.type === "off";
  setShift(editing.who, editing.date, {
    type: editing.type,
    label: isOff ? "" : $("dLabel").value.trim(),
    start: isOff ? "" : $("dStart").value,
    end: isOff ? "" : $("dEnd").value,
    note: editing.type === "none" ? "" : $("dNote").value.trim(),
  });
  const label = $("dLabel").value.trim();
  if (!isOff && editing.type !== "none" && label && $("dColor").value.toLowerCase() !== pillColor(label).toLowerCase()) {
    state.labelColors[label] = $("dColor").value.toLowerCase();
  }
  if (editing.type === "work") ensureType(editing.who, label, $("dStart").value, $("dEnd").value);
  save();
  render();
});
document.querySelector("main").addEventListener("click", (ev) => {
  const av = ev.target.closest("[data-av]");
  if (av) {
    toggleAvail(av.dataset.who, av.dataset.d, av.dataset.av);
    save(); render();
    return;
  }
  const tb = ev.target.closest("[data-tl], #typeAdd");
  if (tb) { openType(tb.dataset.tl || ""); return; }
  const b = ev.target.closest("[data-date]");
  if (!b || !PEOPLE.includes(view)) return;
  openDay(b.dataset.date, view);
});

// ---------- スクショ読み取り ----------
let shots = []; // {dataUrl, base64}
let ocr = null; // { who, entries: [{date,type,label,start,end,on}], note }

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした")); };
    img.src = url;
  });
}
// 文字が読めるよう長辺1600pxまでのJPEGにする
async function toJpeg(file, maxSide = 1600) {
  const img = await loadImage(file);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) throw new Error("画像のサイズを読み取れませんでした");
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const cv = document.createElement("canvas");
  cv.width = Math.round(iw * scale); cv.height = Math.round(ih * scale);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const dataUrl = cv.toDataURL("image/jpeg", 0.9);
  if (!dataUrl.startsWith("data:image/jpeg")) throw new Error("画像の変換に失敗しました");
  return { dataUrl, base64: dataUrl.split(",")[1] };
}
function renderThumbs() {
  $("thumbs").innerHTML = shots.map((s, i) =>
    `<div class="thumb"><img src="${s.dataUrl}" alt="スクショ${i + 1}"><button type="button" data-rm="${i}" aria-label="外す">×</button></div>`).join("");
  $("ocrBtn").disabled = !shots.length;
}
$("shotInput").addEventListener("change", async (ev) => {
  const files = [...ev.target.files].slice(0, 6 - shots.length);
  ev.target.value = "";
  $("shotBtn").classList.add("busy");
  try {
    for (const f of files) shots.push(await toJpeg(f));
  } catch (e) { alert(e.message); }
  $("shotBtn").classList.remove("busy");
  renderThumbs();
});
$("thumbs").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-rm]");
  if (!b) return;
  shots.splice(+b.dataset.rm, 1);
  renderThumbs();
});

const OCR_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          type: { type: "string", enum: ["work", "off", "plan"] },
          label: { type: "string", description: "画像に書かれていたシフト名・予定名（例：早番、A、飲み会）。なければ空文字" },
          start: { type: "string", description: "開始時刻 HH:MM（24時間）。わからなければ空文字" },
          end: { type: "string", description: "終了時刻 HH:MM（24時間）。わからなければ空文字" },
          color: { type: "string", description: "画像でそのシフト名に付いている背景色（文字色ではなく）を #rrggbb で。色が付いていなければ空文字" },
        },
        required: ["date", "type", "label", "start", "end", "color"],
        additionalProperties: false,
      },
    },
    note: { type: "string", description: "読み取りで迷った点・前提にしたことを短く。なければ空文字" },
  },
  required: ["entries", "note"],
  additionalProperties: false,
};

function ocrPrompt(who, hint) {
  return `これは「${nm(who)}」の勤務シフトや予定が写ったスクリーンショットです（シフト表、カレンダーアプリ、勤務管理アプリ、LINEのメッセージなど）。
読み取れる日ごとの予定を entries に入れてください。

- 今日は ${todayStr()}、アプリで今表示している月は ${cur.y}年${cur.m}月 です。画像に年や月が書かれていなければ、表示中の月かその近くとして解釈してください。
- type：仕事・出勤・シフト勤務は "work"。休み・公休・有給・希望休・「休」「×」「OFF」「/」などは "off"。仕事以外の予定（遊び・用事など）は "plan"。
- シフト表で複数人が並んでいる場合は「${nm(who)}」本人の行・列だけを読んでください。どれが本人か判断できない場合は、note にそう書いてください。
- シフト表で、空欄が明らかに「休み」を意味している場合は "off" にしてください。カレンダーで単に何も書かれていない日は出力しないでください。
- 時刻は24時間表記の HH:MM（例 "09:00"、"22:30"）。「9-18」なら start "09:00" end "18:00"。日をまたぐ場合も end はそのまま（例 "02:00"）。
- 同じ日に複数の予定がある場合は1件にまとめ、仕事があれば type は "work" にしてください。
- シフト名に色（背景色）が付いている場合は、その色を color に #rrggbb でできるだけ正確に入れてください。同じシフト名なら同じ色にしてください。
- 推測しすぎず、読み取れたものだけを入れてください。${hint ? `\n\n本人からの補足：${hint}` : ""}`;
}

async function readShots(who, hint) {
  const apiKey = getKey();
  if (!apiKey) throw new Error("APIキーが未設定です。「設定」画面で入力してください。");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: OCR_SCHEMA } },
      messages: [{
        role: "user",
        content: [
          ...shots.flatMap((s, i) => [
            { type: "text", text: `画像${i + 1}` },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: s.base64 } },
          ]),
          { type: "text", text: ocrPrompt(who, hint) },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error("APIキーが正しくないようです。設定画面で確認してください。");
    if (e instanceof Anthropic.RateLimitError) throw new Error("混み合っています。少し待ってからもう一度試してください。");
    if (e instanceof Anthropic.APIConnectionError) throw new Error("通信できませんでした。電波の状態を確認してください。");
    if (e instanceof Anthropic.APIError && e.status === 400 && /credit|balance/i.test(e.message)) throw new Error("APIのクレジット残高が足りないようです。");
    if (e instanceof Anthropic.APIError) throw new Error(`AIの呼び出しに失敗しました（${e.status ?? ""}）：${e.message}`);
    throw e;
  }
  if (res.stop_reason === "refusal") throw new Error("AIが読み取れませんでした。別の画像で試してください。");
  if (res.stop_reason === "max_tokens") throw new Error("AIの回答が途中で切れました。画像を減らしてもう一度試してください。");
  const tb = res.content.find((b) => b.type === "text");
  if (!tb) throw new Error("AIの回答を読み取れませんでした。");
  const data = JSON.parse(tb.text);
  const okTime = (t) => (/^\d{1,2}:\d{2}$/.test(t) ? t.padStart(5, "0") : "");
  const entries = (data.entries || [])
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !isNaN(parseDate(e.date)))
    .map((e) => ({ date: e.date, type: e.type, label: e.label || "", start: okTime(e.start), end: okTime(e.end), color: isHex(e.color) ? e.color.toLowerCase() : "", on: true }))
    .sort((a, b) => a.date.localeCompare(b.date));
  // 同じ日が重複したら後のものを使う
  const byDate = new Map(entries.map((e) => [e.date, e]));
  return { who, entries: [...byDate.values()], note: data.note || "" };
}

function renderOcr(msg) {
  if (msg) { $("ocrResult").innerHTML = msg; return; }
  if (!ocr) { $("ocrResult").innerHTML = ""; return; }
  if (!ocr.entries.length) {
    $("ocrResult").innerHTML = `<p class="error">予定を読み取れませんでした。${esc(ocr.note)}</p>`;
    return;
  }
  const n = ocr.entries.filter((e) => e.on).length;
  $("ocrResult").innerHTML = `
    <div class="ocr">
      <p class="note">${esc(nm(ocr.who))}の予定として ${ocr.entries.length}件 読み取りました。入れない日はチェックを外してください。${ocr.note ? `<br>AIのメモ：${esc(ocr.note)}` : ""}</p>
      ${ocr.entries.map((e, i) => {
        const old = getShift(ocr.who, e.date);
        return `<label class="ocr-row">
          <input type="checkbox" data-i="${i}" ${e.on ? "checked" : ""}>
          <b>${dateLabel(e.date)}</b>
          <span class="t-${e.type}">${esc(describe(e))}</span>
          ${old ? `<small>上書き（今：${esc(describe(old))}）</small>` : ""}
        </label>`;
      }).join("")}
      <button type="button" class="primary wide" id="applyOcr" ${n ? "" : "disabled"}>${n}件をカレンダーに入れる</button>
    </div>`;
}
$("ocrResult").addEventListener("change", (ev) => {
  const cb = ev.target.closest("input[data-i]");
  if (!cb) return;
  ocr.entries[+cb.dataset.i].on = cb.checked;
  renderOcr();
});
$("ocrResult").addEventListener("click", (ev) => {
  if (ev.target.id !== "applyOcr") return;
  const picked = ocr.entries.filter((e) => e.on);
  for (const e of picked) {
    setShift(ocr.who, e.date, { ...e, note: "" });
    if (e.label && e.type !== "off" && e.color) state.labelColors[e.label] = e.color; // 元のアプリの色を引き継ぐ
    if (e.type === "work") ensureType(ocr.who, e.label, e.start, e.end);
  }
  save();
  // 入れた予定の月を表示する
  if (picked.length) { const [y, m] = picked[0].date.split("-").map(Number); cur = { y, m }; }
  ocr = null; shots = [];
  renderThumbs(); renderOcr();
  $("ocrHint").value = "";
  render();
  $("personCal").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("ocrBtn").addEventListener("click", async () => {
  const who = view;
  const btn = $("ocrBtn");
  btn.disabled = true; btn.textContent = "読み取り中…";
  renderOcr(`<p class="note">AIが画像を読んでいます（十数秒〜1分ほど）…</p>`);
  try {
    ocr = await readShots(who, $("ocrHint").value.trim());
    renderOcr();
  } catch (e) {
    ocr = null;
    renderOcr(`<p class="error">${esc(e.message)}</p>`);
  } finally {
    btn.textContent = "読み取る";
    btn.disabled = !shots.length;
  }
});

// ---------- シフトの種類（名前・色・時間） ----------
let typeEditing = null; // { who, label }
function openType(label) {
  const who = view;
  typeEditing = { who, label };
  const t = label ? state.types[who][label] : null;
  $("tTitle").textContent = label ? `${nm(who)}のシフト「${label}」` : `${nm(who)}のシフトを追加`;
  $("tName").value = label;
  $("tStart").value = t?.start || "";
  $("tEnd").value = t?.end || "";
  $("tColor").value = label ? pillColor(label) : "#3f95e0";
  updateTypeColorField();
  $("tDelete").hidden = !label;
  $("typeDialog").returnValue = "";
  $("typeDialog").showModal();
}
function updateTypeColorField() {
  const fixed = FIXED_COLORS[$("tName").value.trim()];
  $("tColor").disabled = !!fixed;
  if (fixed) $("tColor").value = fixed;
  $("tColorNote").hidden = !fixed;
}
$("tName").addEventListener("input", updateTypeColorField);
$("typeDialog").addEventListener("close", () => {
  const rv = $("typeDialog").returnValue;
  if (!typeEditing || (rv !== "save" && rv !== "delete")) return;
  const { who, label: old } = typeEditing;
  const now = Date.now();
  if (rv === "delete") {
    state.types[who][old] = { ...state.types[who][old], del: true, u: now };
    save(); render(); return;
  }
  const name = $("tName").value.trim().slice(0, 12);
  if (!name || OFF_WORD.test(name)) { alert("シフトの名前を入れてください（「休み」は種類にできません）"); return; }
  const prev = old ? state.types[who][old] : null;
  const start = $("tStart").value, end = $("tEnd").value;
  // この種類が入っている日をまとめて直す（名前を変えたとき、時間を変えたとき）
  for (const [date, e] of Object.entries(state.shifts[who])) {
    if (!old || e.type !== "work" || e.label !== old) continue;
    const sameTime = !prev || (e.start === prev.start && e.end === prev.end) || (!e.start && !e.end);
    state.shifts[who][date] = { ...e, label: name, start: sameTime ? start : e.start, end: sameTime ? end : e.end, u: now };
  }
  if (old && old !== name) state.types[who][old] = { ...prev, del: true, u: now };
  state.types[who][name] = { start, end, u: now };
  state.labelColors[name] = $("tColor").value.toLowerCase();
  save(); render();
});

// ---------- 画面切り替え・設定 ----------
document.querySelector(".tabbar").addEventListener("click", (ev) => {
  const b = ev.target.closest("button[data-view]");
  if (!b) return;
  if (b.dataset.view !== view && ocr) { ocr = null; renderOcr(); }
  view = b.dataset.view;
  render();
  window.scrollTo(0, 0);
});
$("prevMonth").addEventListener("click", () => { cur = cur.m === 1 ? { y: cur.y - 1, m: 12 } : { y: cur.y, m: cur.m - 1 }; render(); });
$("nextMonth").addEventListener("click", () => { cur = cur.m === 12 ? { y: cur.y + 1, m: 1 } : { y: cur.y, m: cur.m + 1 }; render(); });
$("monthLabel").addEventListener("click", () => { const t = new Date(); cur = { y: t.getFullYear(), m: t.getMonth() + 1 }; render(); });

for (const p of PEOPLE) {
  const input = $(p === "him" ? "nameHim" : "nameHer");
  input.value = state.names[p];
  input.addEventListener("change", () => {
    state.names[p] = input.value.trim().slice(0, 20) || defaultState().names[p];
    input.value = state.names[p];
    save(); renderNames();
  });
}
function renderKeyStatus() {
  let own = "", diet = "";
  try { own = localStorage.getItem(KEY_KEY) || ""; diet = localStorage.getItem(DIET_KEY_KEY) || ""; } catch {}
  $("keyStatus").textContent = own ? "設定済み" : diet ? "食事ログのキーを使います" : "未設定";
}
$("saveKey").addEventListener("click", () => {
  setKey($("apiKey").value.trim());
  $("apiKey").value = "";
  renderKeyStatus();
});
$("clearAll").addEventListener("click", () => {
  if (!confirm(getRoom()
    ? "ふたり分のシフトをすべて消します。同期しているので相手のアプリからも消えます。よろしいですか？"
    : "このスマホに入っているふたり分のシフトをすべて消します。よろしいですか？")) return;
  // 「消した」記録を残す（同期・共有したときに相手側でも消えるように）
  const now = Date.now();
  for (const p of PEOPLE) {
    for (const date of Object.keys(state.shifts[p])) state.shifts[p][date] = { type: "none", label: "", start: "", end: "", note: "", u: now };
    for (const date of Object.keys(state.avail[p])) state.avail[p][date] = { v: "", u: now };
    for (const label of Object.keys(state.types[p])) state.types[p][label] = { ...state.types[p][label], del: true, u: now };
  }
  save(); render();
});

// ---------- 自動同期（Firebase） ----------
const ROOM_KEY = "shiftcal.room";
function getRoom() { try { return localStorage.getItem(ROOM_KEY) || ""; } catch { return ""; } }
function setRoom(v) { try { v ? localStorage.setItem(ROOM_KEY, v) : localStorage.removeItem(ROOM_KEY); } catch {} }
const normRoom = (s) => (s || "").replace(/^.*room=/, "").replace(/[^A-Za-z0-9]/g, "");
function newRoom() {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"; // 見間違えやすい文字は使わない
  const b = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(b, (x) => chars[x % chars.length]).join("");
}
let syncStatus = { text: "", ok: false };

function applyRemote(data) {
  for (const p of PEOPLE) {
    for (const [date, e] of Object.entries(data.shifts?.[p] || {})) {
      if (!e || typeof e !== "object") continue;
      const mine = state.shifts[p][date];
      if (!mine || (e.u || 0) > (mine.u || 0)) {
        state.shifts[p][date] = {
          type: TYPES.some((t) => t.id === e.type) ? e.type : "none",
          label: String(e.label || ""), start: String(e.start || ""), end: String(e.end || ""), note: String(e.note || ""), u: e.u || 0,
        };
      }
    }
    for (const [date, a] of Object.entries(data.avail?.[p] || {})) {
      if (!a || typeof a !== "object") continue;
      const mine = state.avail[p][date];
      if (!mine || (a.u || 0) > (mine.u || 0)) state.avail[p][date] = { v: ["ok", "ng"].includes(a.v) ? a.v : "", u: a.u || 0 };
    }
    for (const [label, t] of Object.entries(data.types?.[p] || {})) {
      if (!t || typeof t !== "object") continue;
      const mine = state.types[p][label];
      if (!mine || (t.u || 0) > (mine.u || 0)) state.types[p][label] = { start: String(t.start || ""), end: String(t.end || ""), u: t.u || 0, ...(t.del ? { del: true } : {}) };
    }
    if (data.names?.[p]) state.names[p] = String(data.names[p]).slice(0, 20);
  }
  for (const [label, c] of Object.entries(data.labelColors || {})) {
    if (/^#[0-9a-f]{6}$/i.test(c)) state.labelColors[label] = c;
  }
  for (const p of PEOPLE) typesFromShifts(p);
  saveLocal();
  pushDiff(state, PEOPLE); // こちらにしかない・こちらの方が新しいものを送る
  for (const p of PEOPLE) $(p === "him" ? "nameHim" : "nameHer").value = state.names[p];
  if (!$("dayDialog").open) render();
}

function connectSync() {
  const room = getRoom();
  if (!syncConfigured || !room) { stopSync(); renderSync(); return; }
  startSync(room, {
    onRemote: applyRemote,
    onStatus: (text, ok) => { syncStatus = { text, ok }; renderSync(); },
  });
}

function renderSync() {
  const room = getRoom();
  const on = syncConfigured && !!room;
  $("syncNotReady").hidden = syncConfigured;
  $("syncOff").hidden = !syncConfigured || !!room;
  $("syncOn").hidden = !on;
  $("usSyncLine").hidden = !on;
  if (on) {
    $("syncRoom").textContent = room;
    $("syncState").textContent = syncStatus.text;
    $("syncState").className = "sync-state " + (syncStatus.ok ? "ok" : "");
    $("usSyncLine").textContent = (syncStatus.ok ? "● " : "○ ") + syncStatus.text;
    $("usSyncLine").className = "sync-line " + (syncStatus.ok ? "ok" : "");
  }
}

$("syncCreate").addEventListener("click", () => {
  setRoom(newRoom());
  connectSync(); renderSync();
  $("syncInvite").click();
});
$("syncJoin").addEventListener("click", () => {
  const code = normRoom($("syncCode").value);
  if (code.length < 20) { alert("合言葉が短いようです。届いた合言葉をそのまま貼り付けてください。"); return; }
  setRoom(code);
  $("syncCode").value = "";
  connectSync(); renderSync();
});
$("syncInvite").addEventListener("click", async () => {
  const room = getRoom();
  const text = `ふたりのシフトの合言葉：\n${room}\n\nアプリの「設定」→「自動で同期する」の「合言葉を入れる」に貼り付けてね`;
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(room); alert("合言葉をコピーしました。LINEなどで相手に送ってください。"); }
  catch { prompt("この合言葉を相手に送ってください", room); }
});
$("syncStop").addEventListener("click", () => {
  if (!confirm("自動同期をやめますか？（このスマホのシフトは残ります。相手のアプリには影響しません）")) return;
  setRoom(""); stopSync(); syncStatus = { text: "", ok: false };
  renderSync();
});
$("appVersion").textContent = APP_VERSION;
$("forceUpdate").addEventListener("click", () => { location.replace(location.pathname + "?v=" + Date.now()); });

// 名前の見出しを、上のバーのすぐ下に貼り付けるため実際の高さを測る（ホーム画面アプリだと上の余白が変わる）
function measureTopbar() {
  document.documentElement.style.setProperty("--topbar-h", document.querySelector(".topbar").offsetHeight + "px");
}
measureTopbar();
addEventListener("resize", measureTopbar);
addEventListener("orientationchange", () => setTimeout(measureTopbar, 300));

renderKeyStatus();
render();
renderSync();
connectSync();

// 公開中の最新版と違えば、自動で読み込み直す（Safariが古いページを覚えていることがあるため）
(async () => {
  try {
    const r = await fetch("version.txt?t=" + Date.now(), { cache: "no-store" });
    const v = (await r.text()).trim();
    if (r.ok && v && v !== APP_VERSION && !sessionStorage.getItem("shiftcal.reloaded." + v)) {
      sessionStorage.setItem("shiftcal.reloaded." + v, "1");
      location.replace(location.pathname + "?v=" + Date.now() + location.hash);
    }
  } catch {}
})();
