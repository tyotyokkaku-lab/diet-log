// 社用車メンテナンス
// サーバー未接続:データはこの端末のブラウザ内(IndexedDB)だけに保存
// サーバー接続中:サーバー(Cloudflare Workers + D1)が正。この端末には表示用の控えを保存
const APP_VERSION = "1.2.0";

const $ = id => document.getElementById(id);
const pad2 = n => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
const fmt = n => Number(n).toLocaleString("ja-JP");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEFAULT_SET = { oilKm: 5000, oilMo: 6, tireKm: 40000, tireMo: 36 };
let S = { km: [], oil: [], tire: [], set: { ...DEFAULT_SET } };
let kmWarn = null;

function toast(m) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = m;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
}

// ---- 保存(IndexedDB。使えないときは localStorage) ----
const DB_NAME = "car-maint", STORE = "kv", KEY = "state";
let dbp = null;
function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    if (!("indexedDB" in window)) return rej(new Error("no idb"));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idbGet() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbPut(v) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v, KEY);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
function plain() { return { km: S.km, oil: S.oil, tire: S.tire, set: S.set }; }
// バックアップ用:安全管理(anzen.js)の記録も一緒に書き出す
const fullBackup = () => ({ ...plain(), ...(window.AZ ? { safety: window.AZ.data() } : {}) });
async function save() {
  const data = JSON.parse(JSON.stringify(plain()));
  try { await idbPut(data); }
  catch (e) {
    try { localStorage.setItem("carState", JSON.stringify(data)); }
    catch (e2) { toast("保存に失敗しました。もう一度お試しください。"); }
  }
}
function normalize(d) {
  const arr = x => Array.isArray(x) ? x : [];
  return {
    km: arr(d.km).filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(+r.odo)).map(r => ({ id: String(r.id || "k" + r.date), date: r.date, odo: +r.odo })),
    oil: arr(d.oil).filter(r => r && r.date && Number.isFinite(+r.odo)).map(r => ({ id: String(r.id || Math.random()), date: r.date, odo: +r.odo, note: r.note || "" })),
    tire: arr(d.tire).filter(r => r && r.date && Number.isFinite(+r.odo)).map(r => ({ id: String(r.id || Math.random()), date: r.date, odo: +r.odo, type: r.type || "", note: r.note || "" })),
    set: Object.assign({ ...DEFAULT_SET }, d.set || {}),
  };
}

// ---- サーバー連携 ----
let SRV = null; // { url, pass }
try { SRV = JSON.parse(localStorage.getItem("carServer") || "null"); } catch (e) {}
const online = () => !!(SRV && SRV.url && SRV.pass);
async function api(method, path, body, srv) {
  srv = srv || SRV;
  let r;
  try {
    r = await fetch(srv.url.replace(/\/+$/, "") + path, {
      method,
      headers: { "Authorization": "Bearer " + srv.pass, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
  } catch (e) { const er = new Error("サーバーにつながりません。電波を確認してください。"); er.network = true; throw er; }
  let d = null; try { d = await r.json(); } catch (e) {}
  if (!r.ok) { const er = new Error((d && d.error) || ("サーバーエラー(" + r.status + ")")); er.status = r.status; er.data = d; throw er; }
  return d;
}
function setBanner(t) { $("banner").textContent = t || ""; $("banner").classList.toggle("hide", !t); }
async function pull() {
  const d = await api("GET", "/api/data");
  S = normalize(d); await save(); setBanner(""); render();
}
// サーバーに送ってから画面のデータを変える。失敗したら何も変えずにメッセージを出す
async function remote(fn) {
  if (!online()) return true;
  try { await fn(); return true; }
  catch (e) { if (e.status !== 409) toast(e.message); throw e; }
}
function showServerState() {
  $("srvUrl").value = SRV ? SRV.url : ""; $("srvPass").value = SRV ? SRV.pass : "";
  $("srvState").textContent = online() ? "サーバーにつないでいます。記録はサーバーに保存され、ほかの端末でも同じデータが見られます。" : "つないでいません。データはこの端末の中だけにあります。";
  $("srvUpload").classList.toggle("hide", !online());
  $("photoBox").classList.toggle("hide", !online());
  $("foot").textContent = "バージョン " + APP_VERSION + " ・ " + (online() ? "サーバーと同期中" : "データはこの端末の中だけに保存されています");
}

async function init() {
  ["kmDate", "oilDate", "tireDate"].forEach(i => $(i).value = today());
  let d = null;
  try { d = await idbGet(); } catch (e) {}
  if (!d) { try { const t = localStorage.getItem("carState"); if (t) d = JSON.parse(t); } catch (e) {} }
  if (d) S = normalize(d);
  // ブラウザが勝手にデータを消さないようにお願いする(対応ブラウザのみ)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  showServerState();
  render();
  if (online()) {
    try { await pull(); }
    catch (e) { setBanner("サーバーから読み込めませんでした(" + e.message + ")。表示は前回の控えです。"); }
  }
}
// アプリに戻ってきたとき、ほかの端末で記録した分を取り込む
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && online()) {
    pull().catch(() => {});
    if (window.AZ) window.AZ.pull();
  }
});

const sortAsc = a => a.slice().sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
const latestKm = () => S.km.length ? sortAsc(S.km).pop().odo : 0;
function monthsSince(d) { return (new Date() - new Date(d)) / (1000 * 60 * 60 * 24 * 30.4); }

function statusBlock(title, list, limKm, limMo) {
  if (!list.length) return `<div class="st warn"><b>${title}</b><span>記録がありません</span></div>`;
  const last = sortAsc(list).pop();
  const cur = latestKm(), used = Math.max(0, cur - last.odo), remKm = limKm - used, mo = monthsSince(last.date), remMo = limMo - mo;
  let cls = ""; if (remKm <= 0 || remMo <= 0) cls = "ng"; else if (remKm <= limKm * 0.1 || remMo <= 1) cls = "warn";
  const label = cls === "ng" ? "交換時期を過ぎています" : cls === "warn" ? "もうすぐ交換時期" : "問題なし";
  return `<div class="st ${cls}"><b>${title}:${label}</b><span>前回 ${esc(last.date)}(${fmt(last.odo)}km)から ${fmt(used)}km 走行<br>あと ${fmt(Math.max(0, remKm))}km / ${Math.max(0, remMo).toFixed(1)}か月</span></div>`;
}

function dailyList() {
  const a = sortAsc(S.km);
  return a.map((r, i) => ({ ...r, diff: i ? r.odo - a[i - 1].odo : null, days: i ? Math.round((new Date(r.date) - new Date(a[i - 1].date)) / 86400000) : null })).reverse();
}

let kmAll = false;
function render() {
  const dl = dailyList(), last = dl[0];
  $("status").innerHTML = `<div class="stat"><div><div class="k">現在の総走行距離</div><div class="v">${last ? fmt(last.odo) + " km" : "—"}</div></div><div><div class="k">${last && last.diff != null ? (last.date === today() ? "今日の走行" : "直近の走行(" + last.date.slice(5) + ")") : "今日の走行"}</div><div class="v">${last && last.diff != null ? fmt(last.diff) + " km" : "—"}</div></div></div>`
    + statusBlock("オイル", S.oil, S.set.oilKm, S.set.oilMo) + statusBlock("タイヤ", S.tire, S.set.tireKm, S.set.tireMo);
  $("kmList").innerHTML = dl.length ? (kmAll ? dl : dl.slice(0, 60)).map(r => `<div class="row"><div><div class="big">${fmt(r.odo)} km</div><div class="d">${esc(r.date)}${r.diff != null && r.days > 1 ? `(${r.days}日間)` : ""}</div></div><div style="text-align:right"><div class="big">${r.diff != null ? "+" + fmt(r.diff) + " km" : "初回"}</div><button class="del" data-d="km" data-id="${esc(r.id)}">削除</button></div></div>`).join("") : '<div class="d">まだ記録がありません</div>';
  for (const k of ["oil", "tire"]) {
    const l = sortAsc(S[k]).reverse();
    $(k + "List").innerHTML = l.length ? l.map(r => `<div class="row"><div><div class="big">${esc(r.date)}${r.type ? " " + esc(r.type) : ""}</div><div class="d">${fmt(r.odo)} km${r.note ? " / " + esc(r.note) : ""}</div></div><button class="del" data-d="${k}" data-id="${esc(r.id)}">削除</button></div>`).join("") : '<div class="d">まだ記録がありません</div>';
  }
  if (dl.length > 60 && !kmAll) $("kmList").insertAdjacentHTML("beforeend", '<button class="btn sec" id="kmMore">すべて表示(' + dl.length + '件)</button>');
  renderRank(dl); renderChart();
  $("sOilKm").value = S.set.oilKm; $("sOilMo").value = S.set.oilMo; $("sTireKm").value = S.set.tireKm; $("sTireMo").value = S.set.tireMo;
  if (!$("oilKm").value) $("oilKm").value = latestKm() || "";
  if (!$("tireKm").value) $("tireKm").value = latestKm() || "";
}

document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
  ["km", "oil", "tire", "rank"].forEach(t => $(t).classList.toggle("hide", t !== b.dataset.t));
});

// 削除は「もう一度タップ」方式
document.addEventListener("click", e => {
  if (e.target.id === "kmMore") { kmAll = true; render(); return; }
  const b = e.target.closest(".del"); if (!b) return;
  if (b.dataset.arm !== "1") {
    b.dataset.arm = "1"; b.textContent = "もう一度タップで削除";
    setTimeout(() => { b.dataset.arm = ""; b.textContent = "削除"; }, 3000);
    return;
  }
  const kind = b.dataset.d, id = b.dataset.id;
  const row = S[kind].find(r => r.id === id); if (!row) return;
  b.disabled = true;
  remote(() => kind === "km" ? api("DELETE", "/api/odometer/" + row.date) : api("DELETE", `/api/${kind}/${encodeURIComponent(id)}`))
    .then(() => { S[kind] = S[kind].filter(r => r.id !== id); save(); render(); })
    .catch(() => { b.disabled = false; });
});

let busy = false;
$("kmSave").onclick = async () => {
  if (busy) return;
  const date = $("kmDate").value, odo = parseInt($("kmVal").value, 10);
  if (!date || isNaN(odo)) { $("kmMsg").textContent = "日付と距離を入力してください。"; return; }
  const prev = S.km.filter(r => r.date < date).sort((a, b) => a.date < b.date ? 1 : -1)[0];
  if (prev && odo < prev.odo && kmWarn !== odo) {
    kmWarn = odo;
    $("kmMsg").textContent = `前回(${fmt(prev.odo)}km)より小さい値です。このままなら、もう一度「記録する」を押してください。`;
    return;
  }
  const force = kmWarn === odo;
  const id = String(Date.now());
  busy = true;
  try {
    await remote(() => api("POST", "/api/odometer", { id, date, odo, force }));
  } catch (e) {
    busy = false;
    if (e.status === 409) { kmWarn = odo; $("kmMsg").textContent = e.message.replace(/。このまま記録するなら.*$/, "。このままなら、もう一度「記録する」を押してください。"); }
    else $("kmMsg").textContent = "記録できませんでした:" + e.message;
    return;
  }
  busy = false; kmWarn = null;
  S.km = S.km.filter(r => r.date !== date);
  S.km.push({ id, date, odo });
  save();
  $("kmMsg").textContent = prev ? `記録しました。前回から ${fmt(odo - prev.odo)} km 走行。` : "記録しました。";
  $("kmVal").value = ""; $("oilKm").value = ""; $("tireKm").value = "";
  $("photoCam").value = ""; $("photoLib").value = ""; $("prev").style.display = "none"; $("readMsg").textContent = "";
  render();
};
$("kmVal").addEventListener("input", () => { kmWarn = null; });

async function addRec(kind, row, done) {
  try { await remote(() => api("POST", "/api/" + kind, row)); } catch (e) { return; }
  S[kind].push(row); save(); render(); toast(done);
}
$("oilSave").onclick = async () => {
  const date = $("oilDate").value, odo = parseInt($("oilKm").value, 10);
  if (!date || isNaN(odo)) return toast("日付と距離を入力してください");
  await addRec("oil", { id: String(Date.now()), date, odo, note: $("oilNote").value.trim() }, "オイル交換を記録しました");
  $("oilNote").value = "";
};
$("tireSave").onclick = async () => {
  const date = $("tireDate").value, odo = parseInt($("tireKm").value, 10);
  if (!date || isNaN(odo)) return toast("日付と距離を入力してください");
  await addRec("tire", { id: String(Date.now()), date, odo, type: $("tireType").value, note: $("tireNote").value.trim() }, "タイヤ交換を記録しました");
  $("tireNote").value = "";
};
$("sSave").onclick = async () => {
  const g = i => Math.max(1, parseInt($(i).value, 10) || 1);
  const set = { oilKm: g("sOilKm"), oilMo: g("sOilMo"), tireKm: g("sTireKm"), tireMo: g("sTireMo") };
  try { await remote(() => api("PUT", "/api/settings", set)); } catch (e) { return; }
  S.set = set; save(); render(); toast("設定を保存しました");
};

// ---- 写真からメーターを読む(サーバー接続中のみ) ----
function resize(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const m = 1920, s = Math.min(1, m / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res({ dataUrl: c.toDataURL("image/jpeg", 0.85), url: u });
    };
    img.onerror = rej; img.src = u;
  });
}
const onPhoto = async e => {
  const f = e.target.files[0]; if (!f) return;
  const msg = $("readMsg");
  try {
    const { dataUrl, url } = await resize(f);
    $("prev").src = url; $("prev").style.display = "block";
    msg.textContent = "メーターを読み取り中…";
    const r = await api("POST", "/api/read-meter", { image: dataUrl, date: $("kmDate").value });
    if (r && r.odometer != null) {
      $("kmVal").value = r.odometer; kmWarn = null;
      msg.textContent = r.confidence === "low" ? "読み取りに自信がありません。写真と見比べて確認してください。" : "読み取り結果を確認して「記録する」を押してください。";
    } else msg.textContent = "数字を読み取れませんでした。手入力してください。";
  } catch (err) { msg.textContent = (err && err.message ? err.message : "読み取りに失敗しました。") + " 数字を手入力してください。"; }
};
$("photoCam").onchange = onPhoto; $("photoLib").onchange = onPhoto;

// ---- サーバーの設定 ----
$("srvSave").onclick = async () => {
  const url = $("srvUrl").value.trim(), pass = $("srvPass").value;
  const msg = $("srvMsg"); msg.classList.remove("err");
  if (!/^https:\/\//.test(url) || !pass) { msg.textContent = "https:// で始まるURLと合言葉を入れてください。"; msg.classList.add("err"); return; }
  const cand = { url: url.replace(/\/+$/, ""), pass };
  msg.textContent = "確認中…";
  let d;
  try { d = await api("GET", "/api/data", null, cand); }
  catch (e) { msg.textContent = "つなげませんでした:" + e.message; msg.classList.add("err"); return; }
  SRV = cand; try { localStorage.setItem("carServer", JSON.stringify(SRV)); } catch (e) {}
  const serverEmpty = !d.km.length && !d.oil.length && !d.tire.length;
  const localHas = S.km.length + S.oil.length + S.tire.length > 0;
  if (serverEmpty && localHas) {
    showServerState();
    if (window.AZ) window.AZ.render();
    msg.textContent = "つなぎました。サーバーはまだ空です。下の「この端末のデータをサーバーに送る」を押して、今のデータをサーバーに入れてください。";
    return;
  }
  S = normalize(d); await save(); showServerState(); render();
  if (window.AZ) await window.AZ.pull();
  msg.textContent = `つなぎました(${summary(S)})。`;
};
$("srvOff").onclick = () => {
  SRV = null; try { localStorage.removeItem("carServer"); } catch (e) {}
  showServerState(); setBanner("");
  if (window.AZ) window.AZ.render();
  $("srvMsg").textContent = "解除しました。これからの記録はこの端末の中だけに保存されます。"; $("srvMsg").classList.remove("err");
};
let upArm = false;
$("srvUpload").onclick = async () => {
  const msg = $("srvMsg"); msg.classList.remove("err");
  if (!upArm) {
    upArm = true; $("srvUpload").textContent = "もう一度タップで送る";
    msg.textContent = `サーバーのデータを、この端末のデータ(${summary(S)})で置き換えます。`;
    setTimeout(() => { upArm = false; $("srvUpload").textContent = "この端末のデータをサーバーに送る"; }, 5000);
    return;
  }
  upArm = false; $("srvUpload").textContent = "この端末のデータをサーバーに送る";
  msg.textContent = "送信中…";
  try { await api("PUT", "/api/data", plain()); if (window.AZ) await window.AZ.upload(); await pull(); msg.textContent = `サーバーに送りました(${summary(S)})。`; }
  catch (e) { msg.textContent = "送れませんでした:" + e.message; msg.classList.add("err"); }
};

// ---- 書き出し ----
const summary = d => `走行${d.km.length}件・オイル${d.oil.length}件・タイヤ${d.tire.length}件`;
$("exBtn").onclick = async () => {
  const t = JSON.stringify(fullBackup());
  $("exText").value = t; $("exText").classList.remove("hide");
  try { await navigator.clipboard.writeText(t); $("exMsg").textContent = `コピーしました(${summary(S)})。`; }
  catch (e) { $("exText").focus(); $("exText").select(); $("exMsg").textContent = `自動でコピーできませんでした。上の枠の中身をすべて選択してコピーしてください(${summary(S)})。`; }
};
$("exFile").onclick = () => {
  const blob = new Blob([JSON.stringify(fullBackup())], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "car-backup-" + today() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  $("exMsg").textContent = `ファイルに書き出しました(${summary(S)})。`;
};

// ---- バックアップの取り込み(置き換え) ----
let bkArm = false;
$("bkFile").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  $("bkText").value = await f.text(); e.target.value = "";
  $("bkMsg").textContent = "ファイルを読み込みました。「取り込む」を押してください。"; $("bkMsg").classList.remove("err");
};
$("bkText").addEventListener("input", () => { bkArm = false; $("bkImport").textContent = "取り込む"; });
$("bkImport").onclick = async () => {
  const msg = $("bkMsg"); msg.classList.remove("err");
  let d;
  try { d = JSON.parse($("bkText").value.trim()); } catch (e) { d = null; }
  if (!d || typeof d !== "object" || !Array.isArray(d.km)) {
    msg.textContent = "形式が違います。旧アプリの「データをコピー」で出した文字をそのまま貼り付けてください。"; msg.classList.add("err"); return;
  }
  const n = normalize(d);
  const has = S.km.length + S.oil.length + S.tire.length > 0;
  if (has && !bkArm) {
    bkArm = true; $("bkImport").textContent = "もう一度タップで置き換え";
    msg.textContent = `今のデータ(${summary(S)})を、取り込む内容(${summary(n)})に置き換えます。よければもう一度押してください。`;
    return;
  }
  bkArm = false; $("bkImport").textContent = "取り込む";
  if (online()) {
    msg.textContent = "サーバーに送信中…";
    try { await api("PUT", "/api/data", n); }
    catch (e) { msg.textContent = "取り込めませんでした:" + e.message; msg.classList.add("err"); return; }
  }
  S = n; kmAll = false; await save(); render();
  if (d.safety && window.AZ) {
    try { await window.AZ.replace(d.safety); }
    catch (e) { msg.textContent = "安全管理の記録を取り込めませんでした:" + e.message; msg.classList.add("err"); return; }
  }
  $("bkText").value = "";
  msg.textContent = `取り込みました(${summary(S)})。`;
};

// ---- Excel貼り付け ----
function parseDate(s) { const m = String(s).trim().match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/); return m ? m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") : null; }
$("impBtn").onclick = async () => {
  const have = new Set(S.km.map(r => r.date)); const nr = []; let skip = 0, dup = 0;
  for (const ln of $("impText").value.split(/\r?\n/)) {
    if (!ln.trim()) continue;
    const c = /[\t,]/.test(ln) ? ln.split(/\t|,/) : ln.trim().split(/\s+/);
    const d = parseDate(c[0]); if (!d) { skip++; continue; }
    const odo = parseInt(String((c.length >= 3 ? c[2] : c[1]) || "").replace(/[^\d]/g, ""), 10);
    if (isNaN(odo)) { skip++; continue; }
    if (have.has(d)) { dup++; continue; }
    have.add(d); nr.push({ id: "i" + d, date: d, odo });
  }
  if (!nr.length) { $("impMsg").textContent = "取り込める行がありませんでした。日付と距離の列を貼り付けてください。"; return; }
  nr.sort((a, b) => a.date < b.date ? -1 : 1);
  let back = 0; for (let i = 1; i < nr.length; i++) if (nr[i].odo < nr[i - 1].odo) back++;
  if (online()) {
    try { await api("POST", "/api/odometer/bulk", { rows: nr }); }
    catch (e) { $("impMsg").textContent = "取り込めませんでした:" + e.message; return; }
  }
  S.km = S.km.concat(nr); save(); render(); $("impText").value = "";
  $("impMsg").textContent = `${nr.length}件を取り込みました(${nr[0].date}〜${nr[nr.length - 1].date})。` + (dup ? ` 既存の日付${dup}件はスキップ。` : "") + (skip ? ` 読み取れない行${skip}件はスキップ。` : "") + (back ? ` 前日より距離が小さい行が${back}件あります。履歴で確認してください。` : "");
};

// ---- ランキング ----
let rkMode = "d";
function renderRank(dl) {
  const asc = dl.slice().reverse(); let rows = [];
  $("rkD").classList.toggle("on", rkMode === "d"); $("rkM").classList.toggle("on", rkMode === "m");
  if (asc.length > 1) {
    const tot = asc[asc.length - 1].odo - asc[0].odo, days = Math.max(1, Math.round((new Date(asc[asc.length - 1].date) - new Date(asc[0].date)) / 86400000));
    $("rkSum").innerHTML = `<div class="stat" style="margin-bottom:10px"><div><div class="k">記録開始からの走行</div><div class="v">${fmt(tot)} km</div></div><div><div class="k">1日平均</div><div class="v">${fmt(Math.round(tot / days))} km</div></div></div>`;
  } else $("rkSum").innerHTML = "";
  if (rkMode === "d") {
    for (let i = 1; i < asc.length; i++) {
      const d = Math.round((new Date(asc[i].date) - new Date(asc[i - 1].date)) / 86400000);
      if (d === 1) rows.push({ label: asc[i].date, km: asc[i].odo - asc[i - 1].odo });
    }
    $("rkNote").textContent = "前日の記録がある日だけが対象です(記録が飛んだ日をまたいだ差は除外)。";
  } else {
    const m = {}; asc.forEach(r => { m[r.date.slice(0, 7)] = r.odo; });
    const ks = Object.keys(m).sort(), cur = today().slice(0, 7);
    for (let i = 1; i < ks.length; i++) rows.push({ label: ks[i], km: m[ks[i]] - m[ks[i - 1]], part: ks[i] === cur });
    $("rkNote").textContent = "各月の最後の記録の差で計算しています。最初の月は対象外、今月は途中の値です。";
  }
  rows.sort((a, b) => b.km - a.km); rows = rows.slice(0, 20);
  const mx = rows.length ? Math.max(1, rows[0].km) : 1, medal = ["🥇", "🥈", "🥉"];
  $("rkList").innerHTML = rows.length ? rows.map((r, i) => `<div class="row" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px"><div><span class="big">${i < 3 ? medal[i] : (i + 1) + "位"}</span> ${esc(r.label)}${r.part ? "(途中)" : ""}</div><div class="big">${fmt(r.km)} km</div></div><div style="height:6px;background:var(--bd);border-radius:3px;margin-top:6px"><div style="width:${Math.max(0, Math.round(r.km / mx * 100))}%;height:100%;background:var(--ac);border-radius:3px"></div></div></div>`).join("") : '<div class="d">データがありません</div>';
}
$("rkD").onclick = () => { rkMode = "d"; render(); };
$("rkM").onclick = () => { rkMode = "m"; render(); };

// ---- 月ごとのグラフ ----
let chN = 12;
function renderChart() {
  const asc = sortAsc(S.km), m = {};
  asc.forEach(r => { m[r.date.slice(0, 7)] = r.odo; });
  const ks = Object.keys(m).sort(), cur = today().slice(0, 7); const rows = [];
  for (let i = 1; i < ks.length; i++) rows.push({ k: ks[i], km: m[ks[i]] - m[ks[i - 1]], part: ks[i] === cur });
  document.querySelectorAll("#chSeg button").forEach(b => b.classList.toggle("on", +b.dataset.n === chN));
  const box = $("chart");
  if (!rows.length) { box.innerHTML = '<div class="d">データが足りません</div>'; return; }
  box.innerHTML = '<div style="display:flex"><svg id="chAx" width="40" height="200" style="flex:none;max-width:none"></svg><div id="chSc" style="flex:1;min-width:0;overflow-x:auto;-webkit-overflow-scrolling:touch"><svg id="chBars" width="10" height="200" style="display:block;max-width:none"></svg></div></div>';
  const sc = $("chSc"), n = rows.length, H = 200, T = 14, B = 34, ph = H - T - B, AX = 40;
  const cw = Math.max(200, box.clientWidth - AX), bw = chN === 12 ? cw / 12 : cw / n, W = Math.max(cw, n * bw);
  const max = Math.max(1, ...rows.map(r => r.km)), raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= raw), top = step * Math.ceil(max / step);
  let ax = "", g = "";
  for (let v = 0; v <= top + 1e-9; v += step) {
    const y = T + ph - v / top * ph;
    ax += `<text x="${AX - 4}" y="${y + 3}" font-size="9" text-anchor="end" fill="var(--sub)">${fmt(Math.round(v))}</text>`;
    g += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="var(--bd)"/>`;
  }
  rows.forEach((r, i) => {
    const h = Math.max(0, r.km / top * ph), x = i * bw + bw * 0.15, w = bw * 0.7, y = T + ph - h, mo = +r.k.slice(5), cx = x + w / 2;
    g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="var(--ac)" opacity="${r.part ? 0.5 : 1}"/>`;
    if (chN === 12) g += `<text x="${cx}" y="${y - 3}" font-size="9" text-anchor="middle" fill="var(--tx)">${fmt(r.km)}</text>`;
    if (chN === 12 || mo === 1 || mo === 7) g += `<text x="${cx}" y="${T + ph + 12}" font-size="9" text-anchor="middle" fill="var(--sub)">${mo}</text>`;
    if (mo === 1 || (chN === 12 && i === 0)) g += `<text x="${cx}" y="${T + ph + 24}" font-size="9" text-anchor="middle" fill="var(--sub)">${r.k.slice(0, 4)}</text>`;
  });
  $("chAx").innerHTML = ax;
  const sv = $("chBars"); sv.setAttribute("width", W); sv.setAttribute("height", H); sv.setAttribute("role", "img"); sv.setAttribute("aria-label", "月ごとの走行距離の棒グラフ"); sv.innerHTML = g;
  sc.scrollLeft = sc.scrollWidth;
}
document.querySelectorAll("#chSeg button").forEach(b => b.onclick = () => { chN = +b.dataset.n; renderChart(); });
let chRT = null, chW = window.innerWidth;
window.addEventListener("resize", () => { if (window.innerWidth === chW) return; chW = window.innerWidth; clearTimeout(chRT); chRT = setTimeout(renderChart, 200); });

// ---- オフライン対応(Service Worker) ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

init();
