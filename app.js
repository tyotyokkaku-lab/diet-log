import Anthropic from "./vendor/anthropic-sdk-1.3.0.js";

// ---------- 定数 ----------
const MEALS = [
  { id: "breakfast", label: "朝" },
  { id: "lunch", label: "昼" },
  { id: "dinner", label: "晩" },
  { id: "snack", label: "間食" },
];
const MEAL_LABEL = Object.fromEntries(MEALS.map((m) => [m.id, m.label]));
const SOURCE_LABEL = { dict: "マイ辞書", ai: "AI推定", photo: "写真推定", manual: "手入力", import: "取込" };
const MODEL = "claude-opus-5-5";
const STORE_KEY = "dietlog.v1";
const APP_VERSION = "2026-11-17g";

// ---------- 保存データ ----------
const defaultState = () => ({
  goal: { kcal: 2000, p: 24, f: 22.5, c: 53.5 }, // P120g / F50g / C約267g
  entries: [], // {id,date,meal,name,qty,kcal,p,f,c,source,createdAt}  ※kcal〜cは1人前あたり
  dict: {}, // key -> {name,kcal,p,f,c,source,count,updatedAt}
  pastDays: {}, // date -> {kcal,p,f,c,note}  エクセルから取り込んだ日別合計（null=未記録）
});

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
}
let state = load();
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    alert("保存できませんでした：" + e.message);
  }
}
function getKey() {
  try { return localStorage.getItem("dietlog.apiKey") || ""; } catch { return ""; }
}
function setKey(v) {
  try {
    if (v) localStorage.setItem("dietlog.apiKey", v);
    else localStorage.removeItem("dietlog.apiKey");
  } catch {}
}

// ---------- ユーティリティ ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const r0 = (n) => Math.round(n);
const r1 = (n) => Math.round(n * 10) / 10;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const normKey = (s) => s.normalize("NFKC").toLowerCase().replace(/[\s　・,、。]/g, "").replace(/の/g, "");

function todayStr(d = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function shiftDate(s, days) {
  const [y, m, d] = s.split("-").map(Number);
  return todayStr(new Date(y, m - 1, d + days));
}
function dateLabel(s) {
  const [y, m, d] = s.split("-").map(Number);
  const w = "日月火水木金土"[new Date(y, m - 1, d).getDay()];
  const t = todayStr();
  const tag = s === t ? "今日" : s === shiftDate(t, -1) ? "昨日" : "";
  return `${m}月${d}日（${w}）${tag ? " " + tag : ""}`;
}
function goalGrams(g = state.goal) {
  return {
    kcal: g.kcal,
    p: (g.kcal * g.p) / 100 / 4,
    f: (g.kcal * g.f) / 100 / 9,
    c: (g.kcal * g.c) / 100 / 4,
  };
}
function hasEntries(date) {
  return state.entries.some((e) => e.date === date);
}
function totalsFor(date) {
  if (!hasEntries(date) && state.pastDays[date]) {
    const d = state.pastDays[date];
    return { kcal: d.kcal, p: d.p, f: d.f, c: d.c, past: true, note: d.note };
  }
  const t = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const e of state.entries) {
    if (e.date !== date) continue;
    t.kcal += e.kcal * e.qty; t.p += e.p * e.qty; t.f += e.f * e.qty; t.c += e.c * e.qty;
  }
  return t;
}
function defaultMeal() {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 17) return "snack";
  return "dinner";
}

// ---------- 状態（画面） ----------
let currentDate = todayStr();
let currentMeal = defaultMeal();
let candidates = null; // {items:[...], source, note}

// ---------- 今日の画面 ----------
function renderSummary() {
  const g = goalGrams();
  const t0 = totalsFor(currentDate);
  const t = { kcal: t0.kcal ?? 0, p: t0.p ?? 0, f: t0.f ?? 0, c: t0.c ?? 0 };
  const remain = g.kcal - t.kcal;
  const pct = (v, max) => Math.min(100, max > 0 ? (v / max) * 100 : 0);
  const macro = (key, label, color) => {
    const rem = g[key] - t[key];
    return `<div class="macro">
      <div class="macro-head"><b>${label} ${r0(t[key])} / ${r0(g[key])}g</b>
      <span class="rem ${rem < 0 ? "over" : ""}">${rem >= 0 ? `残り ${r0(rem)}g` : `${r0(-rem)}g オーバー`}</span></div>
      <div class="bar"><i style="width:${pct(t[key], g[key])}%;background:${rem < 0 ? "var(--over)" : color}"></i></div></div>`;
  };
  $("summary").innerHTML = `
    <div class="kcal-head">
      <div class="remain ${remain < 0 ? "over" : ""}">${remain >= 0 ? r0(remain) : r0(-remain)}<small> kcal ${remain >= 0 ? "残り" : "オーバー"}</small></div>
      <div class="hint" style="margin:0">${r0(t.kcal)} / ${r0(g.kcal)} kcal</div>
    </div>
    <div class="bar"><i style="width:${pct(t.kcal, g.kcal)}%;background:${remain < 0 ? "var(--over)" : "var(--kcal)"}"></i></div>
    ${macro("p", "P たんぱく質", "var(--p)")}
    ${macro("f", "F 脂質", "var(--f)")}
    ${macro("c", "C 炭水化物", "var(--c)")}
    ${t0.past ? `<p class="note">この日はエクセルから取り込んだ合計です${t0.note ? `（${esc(t0.note)}）` : ""}。空欄の項目は0として表示しています。</p>` : ""}`;
}

function renderMealTabs() {
  $("mealTabs").innerHTML = MEALS.map(
    (m) => `<button type="button" role="radio" data-meal="${m.id}" aria-checked="${m.id === currentMeal}">${m.label}</button>`
  ).join("");
}

function renderEntries() {
  const list = state.entries.filter((e) => e.date === currentDate);
  if (!list.length) {
    $("entryList").innerHTML = `<div class="card empty">まだ記録がありません</div>`;
    return;
  }
  $("entryList").innerHTML = MEALS.map((m) => {
    const items = list.filter((e) => e.meal === m.id);
    if (!items.length) return "";
    const sum = items.reduce((a, e) => a + e.kcal * e.qty, 0);
    return `<div class="card meal-group"><h2>${m.label}<small>${r0(sum)} kcal</small></h2>
      ${items.map((e) => `<button class="entry" data-id="${e.id}">
        <span class="nm">${esc(e.name)}${e.qty !== 1 ? ` ×${e.qty}` : ""}
          <small>P ${r1(e.p * e.qty)} / F ${r1(e.f * e.qty)} / C ${r1(e.c * e.qty)}・${SOURCE_LABEL[e.source] || ""}</small></span>
        <span class="kc">${r0(e.kcal * e.qty)} kcal</span></button>`).join("")}</div>`;
  }).join("");
}

function renderDatalist() {
  const names = Object.values(state.dict).sort((a, b) => (b.count || 0) - (a.count || 0)).map((d) => d.name);
  $("dictList").innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
}

function renderCandidate(extra = "") {
  const box = $("candidate");
  if (!candidates) { box.innerHTML = extra; return; }
  const { items, source, note } = candidates;
  box.innerHTML = `<div class="cand">
    <div><b>この内容で記録しますか？</b><span class="badge ${source === "ai" || source === "photo" ? "ai" : ""}">${SOURCE_LABEL[source]}</span></div>
    ${candidates.photoUrls?.length ? `<div class="thumbs">${candidates.photoUrls.map((u) => `<img src="${u}" alt="送った写真">`).join("")}</div>` : ""}
    <p class="note">数値は「1人前」あたりです。違っていたら直してから記録してください。</p>
    ${items.map((it, i) => `<div class="cand-item" data-i="${i}">
      <input class="name-input" data-k="name" value="${esc(it.name)}">
      <div class="row four">
        <label class="field"><span>kcal</span><input data-k="kcal" type="number" inputmode="decimal" step="any" value="${r0(it.kcal)}"></label>
        <label class="field"><span>P</span><input data-k="p" type="number" inputmode="decimal" step="any" value="${r1(it.p)}"></label>
        <label class="field"><span>F</span><input data-k="f" type="number" inputmode="decimal" step="any" value="${r1(it.f)}"></label>
        <label class="field"><span>C</span><input data-k="c" type="number" inputmode="decimal" step="any" value="${r1(it.c)}"></label>
      </div>
      <label class="field qty"><span>量（人前）</span><input data-k="qty" type="number" inputmode="decimal" step="0.1" min="0.1" value="${it.qty}"></label>
    </div>`).join("")}
    ${note ? `<p class="note">メモ：${esc(note)}</p>` : ""}
    <div class="row">
      <button type="button" id="candCancel">やめる</button>
      ${source === "dict" ? `<button type="button" id="candAI">AIで計算し直す</button>` : ""}
      <button type="button" class="primary" id="candSave">記録する</button>
    </div>${extra}</div>`;
}

function renderToday() {
  $("dateLabel").textContent = dateLabel(currentDate);
  $("datePicker").value = currentDate;
  renderSummary();
  renderMealTabs();
  renderEntries();
  renderDatalist();
}

// ---------- 計算（辞書 → AI） ----------
function findInDict(text) {
  const k = normKey(text);
  if (state.dict[k]) return state.dict[k];
  return null;
}

const SYSTEM_PROMPT = `あなたは日本の食事の栄養計算アシスタントです。ユーザーが入力した「食べたもの」の、エネルギー(kcal)・たんぱく質(P, g)・脂質(F, g)・炭水化物(C, g)を推定します。

ルール:
- 入力に複数の料理が含まれていれば、料理ごとに分けて items に入れてください（例:「牛丼並と味噌汁」→2件）。1品なら1件です。
- 値はその料理の「1人前」あたりで出してください。「大盛」「半分」などサイズの指定があれば、そのサイズを1人前として反映します。
- チェーン店（すき家、吉野家、松屋、マクドナルド、コンビニ各社など）の商品は、その店が公式に公開している栄養成分の値をできるだけ使ってください。わからない場合は一般的な値で推定し、note にその旨を書きます。
- 一般的な料理や食品は、日本食品標準成分表や一般的な分量をもとに推定してください。
- name は、記録に残す短い料理名にしてください（例:「すき家 牛丼 並盛」）。
- confidence は、公式値をもとにしたなら "high"、一般的な推定なら "medium"、量や中身が曖昧なら "low" にします。
- note は日本語で1〜2文。前提にした量や、公式値かどうかを書きます。`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kcal: { type: "number" },
          protein_g: { type: "number" },
          fat_g: { type: "number" },
          carbs_g: { type: "number" },
        },
        required: ["name", "kcal", "protein_g", "fat_g", "carbs_g"],
        additionalProperties: false,
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    note: { type: "string" },
  },
  required: ["items", "confidence", "note"],
  additionalProperties: false,
};

const PHOTO_PROMPT = `写真に写っている食事の栄養を推定してください。

- 写真が複数あるときは、すべて同じ1回の食事です。全部の写真に写っている料理・食品を見分けて、品ごとに items に入れてください。
- 同じ料理が別の写真や別の角度で写っていても、1品として数え、二重に数えないでください。
- 写真から見える量（器の大きさ、ご飯の盛り、枚数・個数など）をもとに、写っている量そのものを1人前として値を出します。
- 栄養成分表示（ラベル・パッケージ裏面の「熱量」「たんぱく質」「脂質」「炭水化物」など）が読み取れる場合は、推定せずにその数値をそのまま使い、confidence を "high" にしてください。「1包装当り」「100g当り」など、表示の単位にも注意します。name は商品名にします。
- チェーン店の商品やパッケージ（コンビニ商品など）だと判断できる場合は、その公式の栄養成分を使い、name に店名・商品名を入れてください。
- 写真だけでは量や中身が確実にわからないので、confidence は確信がない限り "medium" か "low" にしてください。
- note には、何と判断したか・前提にした量を短く書いてください。`;

// 写真を長辺1024pxのJPEGに縮小してbase64にする（通信量と料金を抑えるため）
// iPhoneのSafariでも確実に動くよう、<img> で読み込んでから canvas に描く
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めませんでした")); };
    img.src = url;
  });
}
async function photoToJpeg(file, maxSide = 1024) {
  const img = await loadImage(file);
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) throw new Error("画像のサイズを読み取れませんでした");
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const w = Math.round(iw * scale), h = Math.round(ih * scale);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  cv.getContext("2d").drawImage(img, 0, 0, w, h);
  const dataUrl = cv.toDataURL("image/jpeg", 0.85);
  if (!dataUrl.startsWith("data:image/jpeg")) throw new Error("画像の変換に失敗しました");
  return { dataUrl, base64: dataUrl.split(",")[1] };
}

async function estimateWithAI(text, photos = null) {
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
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: photos?.length
          ? [
              ...photos.flatMap((ph, i) => [
                { type: "text", text: `写真${i + 1}` },
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: ph.base64 } },
              ]),
              { type: "text", text: PHOTO_PROMPT + (text ? `\n\n本人からの補足: ${text}` : "") },
            ]
          : `食べたもの: ${text}`,
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
  if (res.stop_reason === "refusal") throw new Error("AIが回答できませんでした。言い方を変えるか、手入力してください。");
  if (res.stop_reason === "max_tokens") throw new Error("AIの回答が途中で切れました。もう一度試してください。");
  const textBlock = res.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("AIの回答を読み取れませんでした。");
  const data = JSON.parse(textBlock.text);
  if (!Array.isArray(data.items) || !data.items.length) throw new Error("該当する料理が見つかりませんでした。");
  const conf = { high: "公式値ベース", medium: "一般的な推定", low: "かなり大まかな推定" }[data.confidence] || "";
  return {
    source: photos?.length ? "photo" : "ai",
    photoUrls: photos?.map((ph) => ph.dataUrl),
    note: [conf, data.note].filter(Boolean).join("。"),
    items: data.items.map((it) => ({
      name: it.name, kcal: it.kcal, p: it.protein_g, f: it.fat_g, c: it.carbs_g, qty: 1,
    })),
  };
}

async function calculate(text, qty, forceAI = false) {
  const hit = forceAI ? null : findInDict(text);
  if (hit) {
    candidates = { source: "dict", note: "", items: [{ name: hit.name, kcal: hit.kcal, p: hit.p, f: hit.f, c: hit.c, qty }] };
    renderCandidate();
    return;
  }
  const btn = $("calcBtn");
  btn.disabled = true; btn.textContent = "AIで計算中…";
  candidates = null;
  renderCandidate(`<p class="note">AIに問い合わせています（数秒〜十数秒）…</p>`);
  try {
    const r = await estimateWithAI(text);
    if (r.items.length === 1) r.items[0].qty = qty;
    candidates = r;
    renderCandidate();
  } catch (e) {
    candidates = null;
    showError(e);
  } finally {
    btn.disabled = false; btn.textContent = "計算する";
  }
}

function showError(e) {
    renderCandidate(`<p class="error">${esc(e.message)}</p>
      <button type="button" id="manualBtn" style="width:100%;margin-top:8px">数値を手入力する</button>`);
}

// 送る前に貯めておく写真（1回の食事ぶん）
const MAX_PHOTOS = 6;
let pendingPhotos = []; // {dataUrl, base64}

function renderPhotoTray() {
  const tray = $("photoTray");
  if (!pendingPhotos.length) { tray.innerHTML = ""; $("photoBtn").firstChild.textContent = "写真から計算"; return; }
  $("photoBtn").firstChild.textContent = pendingPhotos.length < MAX_PHOTOS ? "写真を追加" : `最大${MAX_PHOTOS}枚までです`;
  tray.innerHTML = `<div class="thumbs">${pendingPhotos.map((ph, i) =>
      `<div class="thumb"><img src="${ph.dataUrl}" alt="写真${i + 1}"><button type="button" data-rm="${i}" aria-label="写真${i + 1}を外す">×</button></div>`).join("")}</div>
    <div class="row">
      <button type="button" id="photoClear">クリア</button>
      <button type="button" class="primary" id="photoGo">${pendingPhotos.length}枚まとめて計算</button>
    </div>`;
}

async function addPhotos(files) {
  const room = MAX_PHOTOS - pendingPhotos.length;
  if (files.length > room) alert(`写真は1回の食事で${MAX_PHOTOS}枚までです。先の${room}枚だけ使います。`);
  for (const f of [...files].slice(0, room)) {
    try { pendingPhotos.push(await photoToJpeg(f)); }
    catch (err) { alert(`読み込めない写真がありました（${f.name || "写真"}）：${err.message}`); }
  }
  renderPhotoTray();
}

async function calculateFromPhotos() {
  if (!pendingPhotos.length) return;
  const text = $("foodInput").value.trim();
  const go = $("photoGo");
  go.disabled = true; go.textContent = "解析中…";
  candidates = null;
  renderCandidate(`<p class="note">写真${pendingPhotos.length}枚をAIで解析しています（10〜30秒ほど）…</p>`);
  try {
    candidates = await estimateWithAI(text, pendingPhotos);
    pendingPhotos = [];
    renderPhotoTray();
    renderCandidate();
  } catch (e) {
    candidates = null;
    showError(e);
    go.disabled = false; go.textContent = `${pendingPhotos.length}枚まとめて計算`;
  }
}

function readCandidateInputs() {
  document.querySelectorAll("#candidate .cand-item").forEach((el) => {
    const it = candidates.items[+el.dataset.i];
    el.querySelectorAll("input").forEach((inp) => {
      const k = inp.dataset.k;
      it[k] = k === "name" ? inp.value.trim() : num(inp.value);
    });
  });
}

function upsertDict(item, source, inputText) {
  const entry = {
    name: item.name, kcal: item.kcal, p: item.p, f: item.f, c: item.c,
    source, updatedAt: Date.now(),
  };
  const keys = new Set([normKey(item.name)]);
  // 1品だけのときは、入力した言い方でも次から引けるようにする
  if (inputText) keys.add(normKey(inputText));
  for (const k of keys) {
    const prev = state.dict[k];
    state.dict[k] = { ...entry, count: (prev?.count || 0) + 1 };
  }
}

function saveCandidates() {
  readCandidateInputs();
  const text = $("foodInput").value.trim();
  const single = candidates.items.length === 1;
  for (const it of candidates.items) {
    if (!it.name) continue;
    state.entries.push({
      id: uid(), date: currentDate, meal: currentMeal, name: it.name, qty: it.qty || 1,
      kcal: it.kcal, p: it.p, f: it.f, c: it.c, source: candidates.source, createdAt: Date.now(),
    });
    // 写真のときの入力欄は「補足」なので、辞書の呼び名には使わない
    upsertDict(it, candidates.source, single && candidates.source !== "photo" ? text : null);
  }
  save();
  candidates = null;
  $("foodInput").value = "";
  $("qtyInput").value = "1";
  renderCandidate();
  renderToday();
}

// ---------- 編集ダイアログ ----------
let editingId = null;
function openEdit(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  editingId = id;
  $("eName").value = e.name;
  $("eMeal").innerHTML = MEALS.map((m) => `<option value="${m.id}" ${m.id === e.meal ? "selected" : ""}>${m.label}</option>`).join("");
  $("eQty").value = e.qty;
  $("eKcal").value = r0(e.kcal); $("eP").value = r1(e.p); $("eF").value = r1(e.f); $("eC").value = r1(e.c);
  $("editDialog").showModal();
}
$("editDialog").addEventListener("close", () => {
  const action = $("editDialog").returnValue;
  const i = state.entries.findIndex((x) => x.id === editingId);
  if (i < 0) return;
  if (action === "delete") {
    if (!confirm("この記録を削除しますか？")) return;
    state.entries.splice(i, 1);
  } else if (action === "save") {
    const e = state.entries[i];
    e.name = $("eName").value.trim() || e.name;
    e.meal = $("eMeal").value;
    e.qty = num($("eQty").value) || 1;
    e.kcal = num($("eKcal").value); e.p = num($("eP").value); e.f = num($("eF").value); e.c = num($("eC").value);
    upsertDict(e, e.source === "ai" || e.source === "photo" ? "manual" : e.source, null);
  } else return;
  save();
  renderToday();
});

// ---------- 履歴 ----------
const fmt = (v, unit = "") => (v == null ? "—" : r0(v) + unit);
// 記録がある日だけ合計を返す（記録のない日は null）
function dayTotal(d) {
  if (!hasEntries(d) && !state.pastDays[d]) return null;
  const t = totalsFor(d);
  return t.kcal == null ? null : t;
}
function averages(dates) {
  const sum = { kcal: [0, 0], p: [0, 0], f: [0, 0], c: [0, 0] };
  for (const d of dates) {
    const t = totalsFor(d);
    for (const k of Object.keys(sum)) if (t[k] != null) { sum[k][0] += t[k]; sum[k][1]++; }
  }
  return Object.fromEntries(Object.entries(sum).map(([k, [v, n]]) => [k, n ? v / n : null]));
}
// 目標に対する状態。kcal・F・Cは「超えたら超過」、Pは「足りないと不足」
const STATUS = {
  ok: { label: "目標内", icon: "✓", cls: "st-ok" },
  over: { label: "超過", icon: "▲", cls: "st-over" },
  under: { label: "不足", icon: "▼", cls: "st-under" },
};
function statusOf(key, pct) {
  if (key === "p") return pct < 90 ? "under" : "ok";
  return pct > 105 ? "over" : "ok";
}

// 1. 平均の目標比（横棒。縦線が目標100%）
function goalBars(a, g) {
  const MAX = 150; // 横軸は0〜150%
  const row = (k, label, unit) => {
    if (a[k] == null) return `<div class="gb-row"><span class="gb-name">${label}</span><div class="gb-track"></div><span class="gb-val">—</span></div>`;
    const pct = (a[k] / g[k]) * 100;
    const st = STATUS[statusOf(k, pct)];
    return `<div class="gb-row" title="${label} 平均 ${r0(a[k])}${unit}（目標 ${r0(g[k])}${unit}）">
      <span class="gb-name">${label}</span>
      <div class="gb-track"><i class="${st.cls}" style="width:${(Math.min(pct, MAX) / MAX) * 100}%"></i><b class="gb-goal" style="left:${(100 / MAX) * 100}%"></b></div>
      <span class="gb-val">${r0(pct)}%<small class="gb-st"><span class="${st.cls}-ink">${st.icon}</span>${st.label}</small></span>
    </div>`;
  };
  return `<div class="gb">${row("kcal", "カロリー", "kcal")}${row("p", "たんぱく質", "g")}${row("f", "脂質", "g")}${row("c", "炭水化物", "g")}
    <div class="gb-axis"><span></span><div class="gb-axis-track"><span style="left:${(100 / 150) * 100}%">目標</span></div><span></span></div></div>`;
}

// 2. 日ごとのカロリー（縦棒。横の点線が目標）
function dailyBars(dayList, g) {
  const vals = dayList.map((d) => dayTotal(d)?.kcal ?? null);
  const top = Math.max(g.kcal * 1.4, ...vals.filter((v) => v != null));
  const goalY = (g.kcal / top) * 100;
  let over = 0, ok = 0;
  const bars = dayList.map((d, i) => {
    const v = vals[i];
    const md = d.slice(5).replace("-", "/").replace(/^0/, "");
    if (v == null) return `<button class="db-bar" data-tip="${md} 記録なし"><i class="db-none"></i></button>`;
    const isOver = v > g.kcal * 1.05;
    isOver ? over++ : ok++;
    const diff = v - g.kcal;
    return `<button class="db-bar" data-tip="${md}　${r0(v)} kcal（${diff > 0 ? "+" : ""}${r0(diff)}）${isOver ? "超過" : "目標内"}">
      <i class="${isOver ? "st-over" : "st-ok"}" style="height:${(v / top) * 100}%"></i></button>`;
  }).join("");
  const first = dayList[0].slice(5).replace("-", "/"), last = dayList[dayList.length - 1].slice(5).replace("-", "/");
  return `<div class="db">
    <div class="db-head"><span>日ごとのカロリー</span>
      <span><span class="st-over-ink">▲</span>超過 <b>${over}日</b>　<span class="st-ok-ink">✓</span>目標内 <b>${ok}日</b></span></div>
    <div class="db-legend"><i class="db-key-line"></i>目標 ${r0(g.kcal)} kcal</div>
    <div class="db-plot ${dayList.length > 10 ? "dense" : ""}">
      <b class="db-goal" style="bottom:${goalY}%"></b>${bars}</div>
    <div class="db-x"><span>${first}</span><span>${last}</span></div>
    <div class="db-tip hint">棒をタップすると、その日の値が出ます</div>
  </div>`;
}

function avgBlock(title, n) {
  const t = todayStr();
  const dayList = Array.from({ length: n }, (_, i) => shiftDate(t, i - n)); // 昨日までのn日（古い順）
  const days = dayList.filter((d) => dayTotal(d) != null);
  if (!days.length) return "";
  const a = averages(days), g = goalGrams();
  const cell = (k, label, unit) => {
    if (a[k] == null) return `<div>${label}<br><b>—</b></div>`;
    const pc = (a[k] / g[k]) * 100;
    const st = statusOf(k, pc);
    return `<div>${label}<br><b>${r0(a[k])}${unit}</b><br><small class="${st === "over" ? "over" : st === "under" ? "under" : ""}">${r0(pc)}%</small></div>`;
  };
  return `<div class="avg"><div class="hint" style="margin:0 0 4px">${title}（記録のある${days.length}日分の平均・目標比）</div>
    <div class="avg-grid">${cell("kcal", "カロリー", "")}${cell("p", "たんぱく質", "g")}${cell("f", "脂質", "g")}${cell("c", "炭水化物", "g")}</div>
    ${goalBars(a, g)}
    ${dailyBars(dayList, g)}
    <p class="gb-note">基準：カロリー・脂質・炭水化物は目標の105%を超えたら「超過」、たんぱく質は目標の90%未満で「不足」</p></div>`;
}
function renderHistory() {
  const dates = [...new Set([...state.entries.map((e) => e.date), ...Object.keys(state.pastDays)])].sort().reverse();
  if (!dates.length) { $("historyList").innerHTML = `<p class="empty">まだ記録がありません</p>`; $("historyAvg").innerHTML = ""; return; }
  const t = todayStr();
  const within = (n) => dates.filter((d) => d < t && d >= shiftDate(t, -n));
  $("historyAvg").innerHTML = avgBlock("直近7日", 7) + avgBlock("直近30日", 30);
  const g = goalGrams();
  $("historyList").innerHTML = dates.map((d) => {
    const x = totalsFor(d);
    const diff = x.kcal == null ? null : x.kcal - g.kcal;
    return `<div class="hist-row"><button data-date="${d}">
        <b>${dateLabel(d)}</b>${x.past ? `<span class="badge">取込</span>` : ""}<br>
        <small class="hint">P ${fmt(x.p)} / F ${fmt(x.f)} / C ${fmt(x.c)} g</small></button>
      <div style="text-align:right"><b>${fmt(x.kcal, " kcal")}</b><br>
        <span class="diff ${diff > 0 ? "over" : ""}">${diff == null ? "" : (diff > 0 ? "+" : "") + r0(diff)}</span></div></div>`;
  }).join("");
}

// ---------- 設定 ----------
function renderSettings() {
  const g = state.goal;
  $("goalKcal").value = g.kcal; $("goalP").value = g.p; $("goalF").value = g.f; $("goalC").value = g.c;
  updateGoalPreview();
  const k = getKey();
  $("apiKey").value = "";
  $("keyStatus").textContent = k ? `保存済み（…${k.slice(-4)}）` : "未設定";
  renderDict();
}
function updateGoalPreview() {
  const g = { kcal: num($("goalKcal").value), p: num($("goalP").value), f: num($("goalF").value), c: num($("goalC").value) };
  const sum = r1(g.p + g.f + g.c);
  const gg = goalGrams(g);
  $("goalPreview").innerHTML = `P ${r0(gg.p)}g / F ${r0(gg.f)}g / C ${r0(gg.c)}g` +
    (sum !== 100 ? `<br><span class="error">比率の合計が ${sum}% です（100%にしてください）</span>` : "");
}
function renderDict() {
  const q = normKey($("dictFilter").value || "");
  // 同じ内容が複数のキーで入っているので、名前でまとめて表示
  const byName = new Map();
  for (const [k, d] of Object.entries(state.dict)) {
    if (q && !normKey(d.name).includes(q) && !k.includes(q)) continue;
    if (!byName.has(d.name)) byName.set(d.name, { ...d, keys: [] });
    byName.get(d.name).keys.push(k);
  }
  const rows = [...byName.values()].sort((a, b) => (b.count || 0) - (a.count || 0));
  $("dictTable").innerHTML = rows.length ? rows.map((d) => `<div class="dict-row">
      <span class="nm">${esc(d.name)}<small>${r0(d.kcal)} kcal・P ${r1(d.p)} / F ${r1(d.f)} / C ${r1(d.c)}・${SOURCE_LABEL[d.source] || ""}</small></span>
      <button data-keys="${esc(d.keys.join("\n"))}">削除</button></div>`).join("")
    : `<p class="empty">まだ登録がありません</p>`;
}

// ---------- データ書き出し ----------
function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCsv() {
  const head = ["日付", "食事", "メニュー", "量", "kcal", "P", "F", "C", "出どころ"];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const rows = [...state.entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt).map((e) =>
    [e.date, MEAL_LABEL[e.meal], q(e.name), e.qty, r0(e.kcal * e.qty), r1(e.p * e.qty), r1(e.f * e.qty), r1(e.c * e.qty), SOURCE_LABEL[e.source] || ""].join(","));
  // Excelで文字化けしないようBOM付き
  download(`食事ログ_${todayStr()}.csv`, "﻿" + [head.join(","), ...rows].join("\r\n"), "text/csv");
}

// ---------- イベント ----------
function showView(name) {
  for (const v of ["today", "history", "settings"]) $("view-" + v).hidden = v !== name;
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  document.querySelector(".topbar").style.visibility = name === "today" ? "visible" : "hidden";
  if (name === "today") renderToday();
  if (name === "history") renderHistory();
  if (name === "settings") renderSettings();
  window.scrollTo(0, 0);
}
document.querySelectorAll(".tabbar button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

$("prevDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, -1); renderToday(); });
$("nextDay").addEventListener("click", () => { currentDate = shiftDate(currentDate, 1); renderToday(); });
$("dateLabel").addEventListener("click", () => {
  const p = $("datePicker");
  if (p.showPicker) { try { p.showPicker(); return; } catch {} }
  p.focus(); p.click();
});
$("datePicker").addEventListener("change", (e) => { if (e.target.value) { currentDate = e.target.value; renderToday(); } });

$("mealTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-meal]");
  if (!b) return;
  currentMeal = b.dataset.meal;
  renderMealTabs();
});

$("entryForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("foodInput").value.trim();
  if (!text) return;
  calculate(text, num($("qtyInput").value) || 1);
});

$("photoInput").addEventListener("change", async (e) => {
  const input = e.target;
  const files = [...input.files];
  if (!files.length) return;
  $("photoTray").innerHTML = `<p class="note">写真を読み込んでいます…</p>`;
  try {
    await addPhotos(files);
  } finally {
    input.value = ""; // 読み込みが終わってから空にする（同じ写真を選び直せるように）
  }
});
$("photoTray").addEventListener("click", (e) => {
  const rm = e.target.closest("button[data-rm]");
  if (rm) { pendingPhotos.splice(+rm.dataset.rm, 1); renderPhotoTray(); }
  if (e.target.id === "photoClear") { pendingPhotos = []; renderPhotoTray(); }
  if (e.target.id === "photoGo") calculateFromPhotos();
});

$("candidate").addEventListener("click", (e) => {
  const id = e.target.id;
  if (id === "candCancel") { candidates = null; renderCandidate(); }
  if (id === "candSave") saveCandidates();
  if (id === "candAI") { calculate($("foodInput").value.trim(), num($("qtyInput").value) || 1, true); }
  if (id === "manualBtn") {
    candidates = { source: "manual", note: "", items: [{ name: $("foodInput").value.trim(), kcal: 0, p: 0, f: 0, c: 0, qty: num($("qtyInput").value) || 1 }] };
    renderCandidate();
  }
});

$("entryList").addEventListener("click", (e) => {
  const b = e.target.closest(".entry");
  if (b) openEdit(b.dataset.id);
});

$("historyAvg").addEventListener("click", (e) => {
  const b = e.target.closest(".db-bar");
  if (!b) return;
  const box = b.closest(".db");
  box.querySelectorAll(".db-bar.sel").forEach((x) => x.classList.remove("sel"));
  b.classList.add("sel");
  box.querySelector(".db-tip").textContent = b.dataset.tip;
});
$("historyList").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-date]");
  if (!b) return;
  currentDate = b.dataset.date;
  showView("today");
});

["goalKcal", "goalP", "goalF", "goalC"].forEach((id) => $(id).addEventListener("input", updateGoalPreview));
$("goalForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const g = { kcal: num($("goalKcal").value), p: num($("goalP").value), f: num($("goalF").value), c: num($("goalC").value) };
  if (Math.abs(g.p + g.f + g.c - 100) > 0.01) { alert("PFCの比率の合計を100%にしてください。"); return; }
  if (g.kcal < 800) { alert("目標カロリーを確認してください。"); return; }
  state.goal = g;
  save();
  alert("保存しました");
});

$("keyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("apiKey").value.trim();
  if (!v) return;
  if (!v.startsWith("sk-ant-")) { if (!confirm("「sk-ant-」で始まらないキーです。このまま保存しますか？")) return; }
  setKey(v);
  renderSettings();
});
$("clearKey").addEventListener("click", () => {
  if (!confirm("APIキーを削除しますか？")) return;
  setKey("");
  renderSettings();
});

$("dictFilter").addEventListener("input", renderDict);
$("dictTable").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-keys]");
  if (!b || !confirm("辞書から削除しますか？（記録は消えません）")) return;
  for (const k of b.dataset.keys.split("\n")) delete state.dict[k];
  save();
  renderDict();
});

$("exportCsv").addEventListener("click", exportCsv);

function parseCsv(text) {
  const rows = []; let row = [], cur = "", q = false;
  text = text.replace(/^\ufeff/, "");
  // エクセルからコピーして貼った場合はタブ区切りになる
  const firstLine = text.split(/\r?\n/)[0];
  const sep = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
// エクセルの日別合計CSV（日付, 摂取カロリー(kcal), たんぱく質(g), 脂質(g), 炭水化物(g), …, メモ）を取り込む
function importDailyCsv(text) {
  const [head, ...rows] = parseCsv(text);
  const col = (re) => head.findIndex((h) => re.test(h.trim()));
  const iDate = col(/^日付/), iK = col(/カロリー\(kcal\)|^摂取カロリー/), iP = col(/^たんぱく質/), iF = col(/^脂質/), iC = col(/^炭水化物/);
  const iPlo = col(/^P下限/), iPhi = col(/^P上限/), iMemo = col(/^メモ/);
  if (iDate < 0 || iK < 0) throw new Error("「日付」「摂取カロリー(kcal)」の列が見つかりません");
  const val = (r, i) => { if (i < 0) return null; const n = parseFloat(r[i]); return Number.isFinite(n) ? n : null; };
  let n = 0;
  for (const r of rows) {
    const date = (r[iDate] || "").trim().replace(/\//g, "-");
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) continue;
    const kcal = val(r, iK);
    if (kcal == null) continue; // 合計がない日は取り込まない
    let p = val(r, iP);
    const notes = [];
    if (p == null && val(r, iPlo) != null && val(r, iPhi) != null) {
      p = (val(r, iPlo) + val(r, iPhi)) / 2; // 範囲しかない日は中間値
      notes.push(`Pは${val(r, iPlo)}〜${val(r, iPhi)}gの中間値`);
    }
    if (iMemo >= 0 && r[iMemo]) notes.push(r[iMemo].trim());
    const [y, m, d] = date.split("-").map(Number);
    state.pastDays[todayStr(new Date(y, m - 1, d))] = { kcal, p, f: val(r, iF), c: val(r, iC), note: notes.join("。") };
    n++;
  }
  return n;
}
$("importCsv").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const n = importDailyCsv(await file.text());
    save();
    alert(`${n}日分を取り込みました。「履歴」で見られます。`);
  } catch (err) {
    alert("読み込めませんでした：" + err.message);
  } finally {
    e.target.value = "";
  }
});
$("pasteCsvBtn").addEventListener("click", () => {
  const text = $("pasteCsv").value.trim();
  if (!text) { alert("CSVの文字を貼り付けてください。"); return; }
  try {
    const n = importDailyCsv(text);
    if (!n) throw new Error("取り込める行がありませんでした（1行目に「日付」「摂取カロリー(kcal)」などの見出しが必要です）");
    save();
    $("pasteCsv").value = "";
    alert(`${n}日分を取り込みました。「履歴」で見られます。`);
  } catch (err) {
    alert("読み込めませんでした：" + err.message);
  }
});
$("exportJson").addEventListener("click", () =>
  download(`食事ログ_バックアップ_${todayStr()}.json`, JSON.stringify(state, null, 1), "application/json"));
$("importJson").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.entries) || typeof data.dict !== "object" || !data.dict) throw new Error("形式が違います");
    if (!confirm(`記録 ${data.entries.length} 件で、今のデータを置き換えます。よろしいですか？`)) return;
    state = { ...defaultState(), ...data };
    save();
    alert("復元しました");
    renderSettings();
  } catch (err) {
    alert("読み込めませんでした：" + err.message);
  } finally {
    e.target.value = "";
  }
});

// 日付が変わったまま開きっぱなしのとき用
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !$("view-today").hidden) renderToday();
});

// 予期しないエラーを画面に出す（スマホでは原因がわかりにくいため）
window.addEventListener("error", (e) => alert("エラー：" + (e.message || e.error)));
window.addEventListener("unhandledrejection", (e) => alert("エラー：" + (e.reason?.message || e.reason)));

$("appVersion").textContent = APP_VERSION;
// スマホに残った古いファイルを捨てて、最新版を取り直す（記録やAPIキーは消えない）
$("forceUpdate").addEventListener("click", async () => {
  const b = $("forceUpdate");
  b.disabled = true; b.textContent = "読み込み中…";
  try {
    const html = await (await fetch("./?t=" + Date.now(), { cache: "reload" })).text();
    const v = (html.match(/app\.js\?v=([\w-]+)/) || [])[1];
    for (const u of ["./", "index.html", "style.css", "app.js", v && `style.css?v=${v}`, v && `app.js?v=${v}`].filter(Boolean)) {
      await fetch(u, { cache: "reload" }).catch(() => {});
    }
    location.replace("./?t=" + Date.now());
  } catch {
    alert("読み込めませんでした。電波の状態を確認してください。");
    b.disabled = false; b.textContent = "最新版を読み込み直す";
  }
});
renderToday();
