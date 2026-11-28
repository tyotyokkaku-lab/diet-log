// 安全管理(軽貨物):点呼・日常点検・業務の記録・事故の記録・指導監督・運転者等台帳・安全管理者
// 国土交通省「貨物軽自動車運送事業者の安全対策が強化されました」(令和7年4月から)で
// 義務になった記録を、スマホで付けて保存・印刷する。app.js の後に読み込む(app.js の関数を使う)
//
// サーバー未接続:この端末(IndexedDB の "safety")だけに保存
// サーバー接続中:サーバー(/api/safety)が正。送れなかった記録は端末に残し、あとで自動で送る

(() => {
const KINDS = ["tenko", "tenken", "gyomu", "jiko", "shido", "kenshin", "tekisei", "tokubetsu", "koshu"];
const empty = () => { const o = { profile: {} }; KINDS.forEach(k => o[k] = []); return o; };
let SF = empty();

// ---------- 日付・時刻 ----------
const nowDT = () => { const d = new Date(); return today() + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
const nowTime = () => nowDT().slice(11);
const dt = s => new Date(s.length === 10 ? s + "T00:00" : s);
const ymd = d => d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
const addDays = (s, n) => { const d = dt(s.slice(0, 10)); d.setDate(d.getDate() + n); return ymd(d); };
const addYears = (s, n) => { const d = dt(s.slice(0, 10)); d.setFullYear(d.getFullYear() + n); return ymd(d); };
const daysTo = s => Math.round((dt(s.slice(0, 10)) - dt(today())) / 86400000);
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const jd = s => { if (!s) return ""; const d = dt(s.slice(0, 10)); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const jdy = s => s ? s.slice(0, 4) + "/" + jd(s) : "";
const jdt = s => s ? jdy(s) + (s.length > 10 ? " " + s.slice(11, 16) : "") : "";
const hm = min => { if (min == null || !isFinite(min)) return "—"; min = Math.round(min); return Math.floor(min / 60) + ":" + pad2(min % 60); };
const hmj = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return (h ? h + "時間" : "") + (m || !h ? m + "分" : ""); };
const ageOn = (birth, on) => { if (!birth) return null; const b = dt(birth), d = dt(on); let a = d.getFullYear() - b.getFullYear(); if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--; return a; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const P = () => SF.profile || {};

// ---------- 保存 ----------
async function idb(mode, v) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode === "get" ? "readonly" : "readwrite"), st = tx.objectStore(STORE);
    if (mode === "get") { const r = st.get("safety"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    else { st.put(v, "safety"); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }
  });
}
async function store() {
  const d = JSON.parse(JSON.stringify(SF));
  try { await idb("put", d); }
  catch (e) { try { localStorage.setItem("carSafety", JSON.stringify(d)); } catch (e2) { toast("保存に失敗しました。もう一度お試しください。"); } }
}
function normalizeSF(d) {
  const o = empty();
  if (d && typeof d === "object") {
    KINDS.forEach(k => { if (Array.isArray(d[k])) o[k] = d[k].filter(r => r && typeof r === "object" && r.id).map(r => ({ ...r, id: String(r.id) })); });
    if (d.profile && typeof d.profile === "object" && !Array.isArray(d.profile)) o.profile = { ...d.profile };
  }
  return o;
}
const count = d => KINDS.reduce((a, k) => a + d[k].length, 0) + (Object.keys(d.profile || {}).length ? 1 : 0);

// ---------- サーバー ----------
let Q = []; try { Q = JSON.parse(localStorage.getItem("carSafetyQueue") || "[]"); } catch (e) {}
const saveQ = () => { try { localStorage.setItem("carSafetyQueue", JSON.stringify(Q)); } catch (e) {} };
let srvOK = true; // サーバーが安全管理(/api/safety)に対応しているか
function rec(kind, id) { return kind === "profile" ? SF.profile : SF[kind].find(r => r.id === id); }
async function flush() {
  while (Q.length) {
    const q = Q[0], path = "/api/safety/" + q.kind + "/" + encodeURIComponent(q.id);
    try {
      if (q.op === "del") await api("DELETE", path);
      else { const r = rec(q.kind, q.id); if (r) await api("PUT", path, r); }
    } catch (e) {
      if (e.network || e.status === 404 || e.status === 401 || e.status === 429 || !e.status || e.status >= 500) { if (e.status === 404) srvOK = false; throw e; }
      toast("送れなかった記録があります:" + e.message);
    }
    Q.shift(); saveQ();
  }
  srvOK = true;
}
async function write(op, kind, id) {
  await store(); renderAll();
  if (!online()) return;
  Q = Q.filter(q => !(q.kind === kind && q.id === id)); Q.push({ op, kind, id }); saveQ();
  try { await flush(); } catch (e) {}
  syncNote();
}
async function pull() {
  if (!online()) { syncNote(); return; }
  try { await flush(); } catch (e) { syncNote(); return; }
  let d;
  try { d = await api("GET", "/api/safety"); }
  catch (e) { if (e.status === 404) srvOK = false; syncNote(); return; }
  srvOK = true;
  const n = normalizeSF(d);
  // サーバーが空で、この端末に記録があるときは、この端末の記録を送る(安全管理を使い始めたとき)
  if (!count(n) && count(SF)) { try { await api("PUT", "/api/safety", SF); } catch (e) { syncNote(); return; } }
  else SF = n;
  await store(); renderAll(); syncNote();
}
function syncNote() {
  const el = $("azSync"); let t = "";
  if (online() && !srvOK) t = "サーバーがまだ安全管理に対応していません(サーバーの更新が必要)。記録はこの端末に保存し、対応したら自動で送ります。";
  else if (online() && Q.length) t = `サーバーに送れていない記録が${Q.length}件あります。電波が戻ったら自動で送ります。`;
  el.textContent = t; el.classList.toggle("hide", !t);
}

// ---------- 日常点検の項目(リーフレット:エンジンルーム内、ライト、タイヤ、運転席周り) ----------
const TENKEN = [
  ["エンジンルーム", [["brakeFluid", "ブレーキ液の量"], ["coolant", "冷却水の量"], ["engineOil", "エンジンオイルの量"], ["battery", "バッテリー液の量"], ["washerFluid", "ウインド・ウォッシャ液の量"]]],
  ["ライト", [["lights", "ライト・ブレーキランプ・方向指示器の点灯・点滅、汚れ・損傷"]]],
  ["タイヤ", [["tireAir", "タイヤの空気圧"], ["tireDamage", "タイヤの亀裂・損傷・異常な摩耗"], ["tireGroove", "タイヤの溝の深さ"]]],
  ["運転席周り", [["brakePedal", "ブレーキペダルの踏みしろ・ブレーキの効き"], ["parkingBrake", "駐車ブレーキの引きしろ"], ["engine", "エンジンのかかり具合・異音"], ["wiper", "ワイパーの拭き取り・ウォッシャ液の噴射"], ["meters", "メーター・警告灯"]]],
];
const TENKEN_ITEMS = TENKEN.flatMap(g => g[1]);
const tenkenStop = r => tenkenNG(r).length > 0 && r.result !== "運行可";
const tenkenNG = r => TENKEN_ITEMS.filter(([k]) => r.items && r.items[k] === "ng").map(x => x[1]);

// ---------- 判定 ----------
function tenkoIssues(r) {
  const a = [];
  if (r.alcohol === "あり") a.push("酒気帯びあり");
  if (r.phase === "乗務前") {
    if (r.sick === "あり") a.push("疾病のおそれ");
    if (r.tired === "あり") a.push("疲労");
    if (r.sleep === "あり") a.push("睡眠不足");
    if (r.tenken === "未実施") a.push("日常点検が未実施");
  }
  return a;
}
const todayTenken = day => SF.tenken.filter(r => r.date === day);
function tenkoJudge(r) {
  const a = tenkoIssues(r);
  if (r.phase === "乗務前") {
    const tk = todayTenken(r.date || today());
    const ng = tk.filter(tenkenStop).flatMap(tenkenNG);
    if (ng.length) a.push("日常点検で運行不可:" + ng.join("・"));
    if (a.length) return `<div class="st ng"><b>運行してはいけません</b><span>${esc(a.join(" / "))}<br>問題が解消してから、もう一度点呼をしてください。</span></div>`;
    return `<div class="st"><b>問題なし</b><span>運行を始めてかまいません。</span></div>`;
  }
  if (a.length) return `<div class="st ng"><b>要注意</b><span>${esc(a.join(" / "))}</span></div>`;
  return "";
}

// 勤務時間(改善基準告示の目安)。休憩以外はすべて運転として計算する
function work(src) {
  const L = (src || SF.gyomu).filter(r => r.startAt && r.endAt).map(r => ({ r, s: dt(r.startAt), e: dt(r.endAt) })).filter(x => x.e > x.s).sort((a, b) => a.s - b.s);
  const map = new Map(), byDay = {}, list = [];
  let prevE = null;
  for (const x of L) {
    const brs = (x.r.breaks || []).filter(b => b.s && b.e).map(b => ({ s: dt(b.s), e: dt(b.e) })).filter(b => b.e > b.s && b.s >= x.s && b.e <= x.e).sort((a, b) => a.s - b.s);
    const kosoku = (x.e - x.s) / 60000, brk = brs.reduce((a, b) => a + (b.e - b.s) / 60000, 0), drive = Math.max(0, kosoku - brk);
    // 連続運転:1回おおむね10分以上、合計30分以上の中断で区切る
    let acc = 0, bacc = 0, max = 0, cur = x.s;
    for (const b of brs) {
      if (b.s < cur) continue;
      acc += (b.s - cur) / 60000; max = Math.max(max, acc);
      const bl = (b.e - b.s) / 60000;
      if (bl >= 10) { bacc += bl; if (bacc >= 30) { acc = 0; bacc = 0; } } else acc += bl;
      cur = b.e;
    }
    acc += (x.e - cur) / 60000; max = Math.max(max, acc);
    const day = x.r.startAt.slice(0, 10);
    const w = { id: x.r.id, r: x.r, day, kosoku, brk, drive, maxCont: max, rest: prevE ? (x.s - prevE) / 60000 : null, issues: [] };
    prevE = x.e; byDay[day] = (byDay[day] || 0) + drive;
    map.set(x.r.id, w); list.push(w);
  }
  const D = d => byDay[d] || 0, weeks = {};
  for (const w of list) {
    if (w.kosoku > 15 * 60) w.issues.push(["ng", "1日の拘束時間が15時間を超えています"]);
    else if (w.kosoku > 13 * 60) w.issues.push(["warn", "1日の拘束時間が13時間を超えています"]);
    if (w.kosoku > 14 * 60) { const d = dt(w.day); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = ymd(d); weeks[k] = (weeks[k] || 0) + 1; if (weeks[k] > 2) w.issues.push(["warn", "拘束14時間超がこの週で3回目以上です(週2回までが目安)"]); }
    if (w.rest != null) {
      if (w.rest < 9 * 60) w.issues.push(["ng", "休息期間が9時間未満です(前の業務終了から" + hmj(w.rest) + ")"]);
      else if (w.rest < 11 * 60) w.issues.push(["warn", "休息期間が11時間未満です(継続11時間以上が基本)"]);
    }
    if (w.maxCont > 240) w.issues.push(["ng", "連続運転が4時間を超えています(最長" + hmj(w.maxCont) + ")"]);
    const p = addDays(w.day, -1), n = addDays(w.day, 1);
    if ((D(p) + D(w.day)) / 2 > 540 && (D(w.day) + D(n)) / 2 > 540) w.issues.push(["ng", "2日平均の運転時間が1日9時間を超えています"]);
    let sum = 0; for (let i = 0; i < 14; i++) sum += D(addDays(w.day, -i));
    if (sum / 2 > 44 * 60) w.issues.push(["warn", "2週平均の運転時間が1週44時間を超えています"]);
  }
  return { map, list };
}
const monthKosoku = (W, ym) => W.list.filter(w => w.day.slice(0, 7) === ym).reduce((a, w) => a + w.kosoku, 0);
const yearKosoku = W => { const from = addDays(today(), -365); return W.list.filter(w => w.day > from).reduce((a, w) => a + w.kosoku, 0); };

// ---------- 期限・注意 ----------
const latest = (list, f) => list.filter(f || (() => true)).map(r => r.date || (r.at || "").slice(0, 10)).filter(Boolean).sort().pop() || null;
const earlyBiz = () => P().keieiDate && P().keieiDate < "2025-04-01"; // 令和7年3月末までに経営届出した事業者(猶予あり)
function dueAlert(out, title, due, warnDays) {
  const n = daysTo(due);
  if (n < 0) out.push(["ng", title, `期限 ${jdy(due)} を ${-n}日過ぎています`]);
  else if (n <= warnDays) out.push(["warn", title, `期限 ${jdy(due)}(あと${n}日)`]);
}
function alerts() {
  const out = [], p = P(), d = today();
  // 今日の点呼・点検
  const started = SF.gyomu.filter(r => r.startAt && r.startAt.slice(0, 10) === d);
  const mae = SF.tenko.filter(r => r.date === d && r.phase === "乗務前");
  if (started.length && !mae.length) out.push(["ng", "乗務前点呼の記録がありません", "業務を始める前に点呼をしてください。"]);
  mae.forEach(r => { const a = tenkoIssues(r); if (a.length) out.push(["ng", "乗務前点呼で問題あり:運行してはいけません", a.join(" / ")]); });
  todayTenken(d).forEach(r => { const ng = tenkenNG(r); if (ng.length) out.push(tenkenStop(r) ? ["ng", "日常点検で運行不可です", ng.join("・") + (r.note ? "(" + r.note + ")" : "")] : ["warn", "日常点検で「否」がありました(処置済・運行可)", ng.join("・") + (r.note ? "(" + r.note + ")" : "")]); });
  // 終わった業務の乗務後点呼(直近7日)
  SF.gyomu.filter(r => r.endAt && r.startAt && r.startAt.slice(0, 10) >= addDays(d, -7)).forEach(r => {
    const day = r.endAt.slice(0, 10);
    if (!SF.tenko.some(t => t.phase === "乗務後" && (t.date === day || t.date === r.startAt.slice(0, 10)))) out.push(["warn", "乗務後点呼の記録がありません", jd(r.startAt) + "の業務"]);
  });
  // 勤務時間(直近14日)
  const W = work();
  W.list.filter(w => w.day >= addDays(d, -14)).forEach(w => w.issues.forEach(([c, t]) => out.push([c, "勤務時間:" + t, jd(w.day) + "の業務"])));
  const mk = monthKosoku(W, d.slice(0, 7)); if (mk > 284 * 60) out.push(["ng", "勤務時間:今月の拘束時間が284時間を超えています", hmj(mk)]);
  const yk = yearKosoku(W); if (yk > 3300 * 60) out.push(["ng", "勤務時間:1年の拘束時間が3,300時間を超えています", "直近1年 " + hmj(yk)]);
  // 事故の報告
  SF.jiko.forEach(r => {
    if (!r.at) return;
    if (r.sokuho === "必要" && !r.sokuhoAt) {
      const left = (dt(r.at).getTime() + 86400000 - Date.now()) / 3600000;
      out.push(["ng", "事故の速報(24時間以内)が未記録です", jdt(r.at) + "の事故 / " + (left > 0 ? "あと約" + Math.ceil(left) + "時間" : "24時間を過ぎています")]);
    }
    if (r.report === "必要" && !r.reportedOn) dueAlert(out, "国土交通大臣への事故報告(30日以内)が未記録です", addDays(r.at, 30), 30);
    if ((+r.dead || 0) + (+r.injured || 0) > 0) {
      const day = r.at.slice(0, 10);
      if (!SF.tokubetsu.some(t => t.target === "事故惹起運転者" && t.date >= day)) out.push(["warn", "死傷事故を起こした運転者への特別な指導の記録がありません", jd(day) + "の事故"]);
      if (!SF.tekisei.some(t => /特定診断/.test(t.type || "") && t.date >= day)) out.push(["warn", "死傷事故を起こした運転者の適性診断(特定診断)の記録がありません", jd(day) + "の事故"]);
    }
  });
  // 安全管理者
  const kd = earlyBiz() ? "令和9年3月31日まで" : "速やかに";
  if (!p.kanrisha) out.push(["warn", "貨物軽自動車安全管理者が登録されていません", "営業所ごとに選任し、運輸支局等に届出が必要です(" + kd + ")。「台帳」で登録できます。"]);
  else if (!p.todokedeDate) out.push(["warn", "安全管理者の選任届出日が未記入です", "選任したら運輸支局等に届出が必要です。"]);
  const lk = latest(SF.koshu);
  if (!lk) out.push(["warn", "安全管理者講習の受講記録がありません", "選任前に講習、選任後は2年ごとに定期講習(" + kd + ")"]);
  else dueAlert(out, "安全管理者の定期講習(2年ごと)", addYears(lk, 2), 90);
  // 運転者
  const ld = earlyBiz() ? "令和10年3月31日まで" : "乗務の前に";
  if (!SF.tokubetsu.some(t => t.target === "初任運転者")) out.push(["warn", "初任運転者への特別な指導の記録がありません", ld]);
  if (!SF.tekisei.some(t => t.type === "初任診断")) out.push(["warn", "適性診断(初任診断)の受診記録がありません", ld]);
  const age = ageOn(p.birth, d);
  if (age != null && age >= 65) {
    const d65 = addYears(p.birth, 65);
    if (!SF.tekisei.some(t => t.type === "適齢診断" && t.date >= d65)) out.push(["warn", "65歳以上:適性診断(適齢診断)の受診記録がありません", "現在" + age + "歳"]);
    if (!SF.tokubetsu.some(t => t.target === "高齢者(65歳以上)" && t.date >= d65)) out.push(["warn", "65歳以上:高齢運転者への特別な指導の記録がありません", "現在" + age + "歳"]);
  }
  const lh = latest(SF.kenshin);
  if (!lh) out.push(["warn", "健康診断の記録がありません", "雇い入れ時と1年に1回"]);
  else dueAlert(out, "健康診断(1年に1回)", addYears(lh, 1), 30);
  const ls = latest(SF.shido);
  if (!ls) out.push(["warn", "指導・監督の記録がありません", "毎年実施し、3年間保存"]);
  else dueAlert(out, "運転者への指導・監督(毎年)", addYears(ls, 1), 30);
  if (p.licenseExp) dueAlert(out, "運転免許の有効期限", p.licenseExp, 60);
  return out;
}

// ---------- 入力フォームの定義 ----------
const ARI = ["なし", "あり"];
const KIND = {
  tenko: {
    name: "点呼", keep: "1年間保存", key: r => r.date + "T" + (r.time || "") + (r.phase === "乗務後" ? "b" : "a"),
    make: () => {
      const d = today(), p = P(), tk = todayTenken(d);
      const mae = SF.tenko.some(r => r.date === d && r.phase === "乗務前");
      return { date: d, phase: mae ? "乗務後" : "乗務前", time: nowTime(), method: "自己点呼", tenkosha: p.driver || "", driver: p.driver || "", detector: "使用", alcValue: "", alcohol: "", sick: "", tired: "", sleep: "", tenken: tk.length ? "実施済" : "", temp: "", bpHi: "", bpLo: "", report: "", order: "", note: "" };
    },
    fields: [
      { k: "phase", label: "区分", type: "seg", opts: ["乗務前", "乗務後"], req: 1 },
      { k: "date", label: "日付", type: "date", req: 1, half: 1 }, { k: "time", label: "時刻", type: "time", req: 1, half: 1 },
      { k: "method", label: "点呼の方法", type: "seg", opts: ["自己点呼", "対面", "電話等"], help: "一人で事業を行っている場合は、自ら確認します。" },
      { k: "tenkosha", label: "点呼執行者", type: "text", half: 1 }, { k: "driver", label: "運転者", type: "text", half: 1 },
      { k: "detector", label: "アルコール検知器", type: "seg", opts: ["使用", "未使用"] },
      { k: "alcValue", label: "検知器の数値 (mg/L)", type: "num", step: "0.01", ph: "0.00", half: 1 },
      { k: "alcohol", label: "酒気帯び", type: "seg", opts: ARI, req: 1, ng: "あり", half: 1, help: "検知器の結果と、顔色・呼気の臭い・声の調子などを目視で確認" },
      { k: "sick", label: "疾病", type: "seg", opts: ARI, req: 1, ng: "あり", when: r => r.phase === "乗務前" },
      { k: "tired", label: "疲労", type: "seg", opts: ARI, req: 1, ng: "あり", when: r => r.phase === "乗務前" },
      { k: "sleep", label: "睡眠不足", type: "seg", opts: ARI, req: 1, ng: "あり", when: r => r.phase === "乗務前", help: "安全な運転ができないおそれがあれば「あり」。ご家族に体調を見てもらうのも有効です。" },
      { k: "temp", label: "体温 (℃)", type: "num", step: "0.1", when: r => r.phase === "乗務前", half: 1 },
      { k: "bp", label: "血圧 (上/下)", type: "bp", when: r => r.phase === "乗務前", half: 1 },
      { k: "tenken", label: "日常点検", type: "seg", opts: ["実施済", "未実施"], req: 1, ng: "未実施", when: r => r.phase === "乗務前", help: "日常点検を記録すると自動で「実施済」になります。" },
      { k: "report", label: "業務に係る自動車・道路・運行の状況", type: "area", when: r => r.phase === "乗務後", ph: "気になる点がなければ「異常なし」" },
      { k: "order", label: "指示事項", type: "area", rows: 2 },
      { k: "note", label: "備考", type: "area", rows: 2 },
      { k: "judge", type: "info", html: r => tenkoJudge(r) },
    ],
    check: r => (!r.date || !r.time) ? "日付と時刻を入れてください" : null,
    title: r => `${r.phase} ${r.time || ""}`,
    sub: r => [r.method, "酒気帯び" + (r.alcohol || "未確認") + (r.alcValue !== "" && r.alcValue != null ? `(${r.alcValue})` : ""), r.phase === "乗務前" ? "日常点検" + (r.tenken || "—") : (r.report || "")].filter(Boolean).join(" / "),
    bad: r => tenkoIssues(r).length > 0,
  },
  tenken: {
    name: "日常点検", keep: "", key: r => r.date + "T" + (r.time || ""),
    make: () => ({ date: today(), time: nowTime(), vehicle: P().vehicle || "", odo: latestKm() || "", items: {}, note: "", checker: P().driver || "" }),
    fields: [
      { k: "date", label: "日付", type: "date", req: 1, half: 1 }, { k: "time", label: "時刻", type: "time", half: 1 },
      { k: "vehicle", label: "車両番号", type: "text", half: 1 }, { k: "odo", label: "走行距離 (km)", type: "num", half: 1 },
      { k: "items", label: "点検項目", type: "checks" },
      { k: "note", label: "不具合の内容・処置", type: "area", rows: 2 },
      { k: "result", label: "判定", type: "seg", opts: ["運行可", "運行不可"], req: 1, ng: "運行不可", when: r => tenkenNG(r).length > 0, help: "「否」があっても、処置して問題がなくなれば「運行可」。" },
      { k: "checker", label: "点検者", type: "text" },
    ],
    check: r => !r.date ? "日付を入れてください" : TENKEN_ITEMS.some(([k]) => !r.items || !r.items[k]) ? "まだ選んでいない点検項目があります" : null,
    title: r => `${r.time || ""} ${tenkenNG(r).length ? "否あり・" + (r.result || "判定なし") : "異常なし"}`,
    sub: r => [r.vehicle, r.odo !== "" && r.odo != null ? fmt(r.odo) + "km" : "", tenkenNG(r).join("・")].filter(Boolean).join(" / "),
    bad: r => tenkenStop(r),
  },
  gyomu: {
    name: "業務の記録", keep: "1年間保存", key: r => r.startAt || "",
    make: () => ({ driver: P().driver || "", vehicle: P().vehicle || "", startAt: nowDT(), startPlace: P().basePlace || "", startOdo: latestKm() || "", endAt: "", endPlace: "", endOdo: "", distance: "", breaks: [], waypoints: "", note: "" }),
    fields: [
      { k: "driver", label: "運転者等の氏名", type: "text", half: 1 }, { k: "vehicle", label: "車両番号", type: "text", half: 1 },
      { k: "startAt", label: "業務開始の日時", type: "dt", req: 1 },
      { k: "startPlace", label: "開始地点", type: "text", half: 1 }, { k: "startOdo", label: "開始メーター (km)", type: "num", half: 1 },
      { k: "breaks", label: "休憩(時刻と地点)", type: "breaks" },
      { k: "endAt", label: "業務終了の日時", type: "dt", help: "業務中は空欄のままで保存できます。" },
      { k: "endPlace", label: "終了地点", type: "text", half: 1 }, { k: "endOdo", label: "終了メーター (km)", type: "num", half: 1 },
      { k: "distance", label: "業務に従事した距離 (km)", type: "num", help: "空欄なら開始・終了のメーターの差を入れます。" },
      { k: "_toKm", label: "終了メーターを「走行距離」の記録にも入れる", type: "flag", when: r => r.endOdo !== "" && r.endOdo != null && r.endAt },
      { k: "waypoints", label: "主な経過地点", type: "area", rows: 3, ph: "例:〇〇センター → △△市内配達 → 〇〇センター" },
      { k: "note", label: "備考", type: "area", rows: 2 },
      { k: "calc", type: "info", html: r => gyomuInfo(r) },
    ],
    check: r => {
      if (!r.startAt) return "業務開始の日時を入れてください";
      if (r.endAt && dt(r.endAt) < dt(r.startAt)) return "終了の日時が開始より前になっています";
      if (r.endOdo !== "" && r.startOdo !== "" && r.endOdo != null && r.startOdo != null && +r.endOdo < +r.startOdo) return "終了メーターが開始メーターより小さくなっています";
      for (const b of r.breaks || []) if (b.s && b.e && dt(b.e) < dt(b.s)) return "休憩の終わりが始まりより前になっています";
      return null;
    },
    title: r => `${r.startAt ? r.startAt.slice(11, 16) : ""}〜${r.endAt ? (r.endAt.slice(0, 10) !== r.startAt.slice(0, 10) ? jd(r.endAt) + " " : "") + r.endAt.slice(11, 16) : "業務中"}`,
    sub: r => { const w = WK && WK.map.get(r.id); return [r.distance !== "" && r.distance != null ? fmt(r.distance) + "km" : "", w ? "拘束" + hm(w.kosoku) + " / 休憩" + hm(w.brk) : "", r.waypoints ? r.waypoints.split("\n")[0] : ""].filter(Boolean).join(" / "); },
    bad: r => { const w = WK && WK.map.get(r.id); return !!(w && w.issues.some(i => i[0] === "ng")); },
  },
  jiko: {
    name: "事故の記録", keep: "3年間保存", key: r => r.at || "",
    make: () => ({ at: nowDT(), crew: P().driver || "", vehicle: P().vehicle || "", place: "", type: "", dead: 0, injured: 0, summary: "", cause: "", prevention: "", sokuho: "不要", sokuhoAt: "", report: "", reportedOn: "", note: "" }),
    fields: [
      { k: "at", label: "事故の発生日時", type: "dt", req: 1 },
      { k: "crew", label: "乗務員等の氏名", type: "text", half: 1 }, { k: "vehicle", label: "車両番号", type: "text", half: 1 },
      { k: "place", label: "事故の発生場所", type: "text" },
      { k: "type", label: "種類", type: "seg", opts: ["人身", "物損", "車両故障", "その他"] },
      { k: "dead", label: "死者 (人)", type: "num", half: 1 }, { k: "injured", label: "負傷者 (人)", type: "num", half: 1 },
      { k: "summary", label: "事故の概要(当時の状況・処置)", type: "area", req: 1 },
      { k: "cause", label: "事故の原因", type: "area" },
      { k: "prevention", label: "再発防止対策", type: "area" },
      { k: "report", label: "国土交通大臣への事故報告(30日以内)", type: "seg", opts: ["必要", "不要"], help: "死傷者を生じた事故など、重大な事故は運輸支局等を通じて報告が必要です。" },
      { k: "reportedOn", label: "報告した日", type: "date", when: r => r.report === "必要" },
      { k: "sokuho", label: "速報(24時間以内)", type: "seg", opts: ["必要", "不要"], help: "2人以上の死者を生じた事故などは、24時間以内にできるだけ速やかに運輸支局等へ速報。" },
      { k: "sokuhoAt", label: "速報した日時", type: "dt", when: r => r.sokuho === "必要" },
      { k: "note", label: "備考", type: "area", rows: 2 },
      { k: "hint", type: "info", html: r => jikoInfo(r) },
    ],
    check: r => !r.at ? "発生日時を入れてください" : !r.summary ? "事故の概要を入れてください" : null,
    title: r => `${jdt(r.at)} ${r.type || ""}`,
    sub: r => [r.place, ((+r.dead || 0) + (+r.injured || 0)) ? `死者${+r.dead || 0}・負傷者${+r.injured || 0}` : "", r.report === "必要" ? (r.reportedOn ? "報告済" : "報告未了") : ""].filter(Boolean).join(" / "),
    bad: r => (r.report === "必要" && !r.reportedOn) || (r.sokuho === "必要" && !r.sokuhoAt),
  },
  shido: {
    name: "指導・監督", keep: "3年間保存", key: r => r.at || "",
    make: () => ({ at: nowDT(), place: "", content: "", by: P().kanrisha || P().driver || "", to: P().driver || "", minutes: "", note: "" }),
    fields: [
      { k: "at", label: "実施した日時", type: "dt", req: 1 },
      { k: "place", label: "実施した場所", type: "text" },
      { k: "content", label: "実施内容", type: "area", req: 1, rows: 4, ph: "例:安全運転の技術、関係法令の遵守事項、ヒヤリハットの共有、過積載・積載方法、異常気象時の対応など", help: "一人で事業を行っている場合は、指導監督マニュアルなどで自ら必要な知識を習得します。" },
      { k: "by", label: "実施した者", type: "text", half: 1 }, { k: "to", label: "受けた者", type: "text", half: 1 },
      { k: "minutes", label: "時間 (分)", type: "num" },
      { k: "note", label: "備考", type: "area", rows: 2 },
    ],
    check: r => !r.at ? "日時を入れてください" : !r.content ? "実施内容を入れてください" : null,
    title: r => jdt(r.at),
    sub: r => [r.place, (r.content || "").split("\n")[0]].filter(Boolean).join(" / "),
  },
  kenshin: {
    name: "健康診断", key: r => r.date || "",
    make: () => ({ date: today(), type: "定期(1年に1回)", place: "", result: "", submitted: "提出済" }),
    fields: [
      { k: "date", label: "受診日", type: "date", req: 1 },
      { k: "type", label: "種類", type: "seg", opts: ["雇入れ時", "定期(1年に1回)", "その他"] },
      { k: "place", label: "医療機関", type: "text" },
      { k: "result", label: "結果・所見", type: "area", rows: 2 },
      { k: "submitted", label: "結果の提出", type: "seg", opts: ["提出済", "未提出"] },
    ],
    check: r => !r.date ? "受診日を入れてください" : null,
    title: r => jdy(r.date) + " " + (r.type || ""), sub: r => [r.place, r.submitted].filter(Boolean).join(" / "),
  },
  tekisei: {
    name: "適性診断", key: r => r.date || "",
    make: () => ({ date: today(), type: "初任診断", org: "", note: "" }),
    fields: [
      { k: "date", label: "受診日", type: "date", req: 1 },
      { k: "type", label: "種類", type: "seg", opts: ["初任診断", "適齢診断", "特定診断Ⅰ", "特定診断Ⅱ", "一般診断"], help: "国土交通大臣が認定した適性診断を受診させます。" },
      { k: "org", label: "受診機関", type: "text" },
      { k: "note", label: "結果・備考", type: "area", rows: 2 },
    ],
    check: r => !r.date ? "受診日を入れてください" : null,
    title: r => jdy(r.date) + " " + (r.type || ""), sub: r => r.org || "",
  },
  tokubetsu: {
    name: "特別な指導", key: r => r.date || "",
    make: () => ({ date: today(), target: "初任運転者", content: "", by: P().kanrisha || "", minutes: "", note: "" }),
    fields: [
      { k: "date", label: "実施日", type: "date", req: 1 },
      { k: "target", label: "対象", type: "seg", opts: ["初任運転者", "高齢者(65歳以上)", "事故惹起運転者"], help: "初任運転者(過去に特別な指導・適性診断を受けていない者)、65歳以上の者、死者又は負傷者が生じた事故を引き起こした者" },
      { k: "content", label: "指導の内容", type: "area", rows: 3 },
      { k: "by", label: "指導した者", type: "text", half: 1 }, { k: "minutes", label: "時間 (分)", type: "num", half: 1 },
      { k: "note", label: "備考", type: "area", rows: 2 },
    ],
    check: r => !r.date ? "実施日を入れてください" : null,
    title: r => jdy(r.date) + " " + (r.target || ""), sub: r => (r.content || "").split("\n")[0],
  },
  koshu: {
    name: "安全管理者講習", key: r => r.date || "",
    make: () => ({ date: today(), type: SF.koshu.length ? "定期講習(2年ごと)" : "安全管理者講習(選任前)", org: "", certNo: "", note: "" }),
    fields: [
      { k: "date", label: "修了日", type: "date", req: 1 },
      { k: "type", label: "種類", type: "seg", opts: ["安全管理者講習(選任前)", "定期講習(2年ごと)"] },
      { k: "org", label: "講習機関(国土交通大臣の登録機関)", type: "text" },
      { k: "certNo", label: "修了証の番号", type: "text" },
      { k: "note", label: "備考", type: "area", rows: 2 },
    ],
    check: r => !r.date ? "修了日を入れてください" : null,
    title: r => jdy(r.date) + " " + (r.type || ""), sub: r => [r.org, r.certNo].filter(Boolean).join(" / "),
  },
  profile: {
    name: "事業者・運転者・安全管理者",
    fields: [
      { k: "h1", type: "info", html: () => '<b>事業者</b>' },
      { k: "jigyosha", label: "事業者の氏名又は名称", type: "text" },
      { k: "eigyosho", label: "営業所の名称・所在地", type: "text" },
      { k: "keieiDate", label: "貨物軽自動車運送事業の経営届出日", type: "date", help: "令和7年3月末までに届け出た事業者は、講習・選任は令和9年3月、特別な指導・適性診断は令和10年3月までの猶予があります。" },
      { k: "h2", type: "info", html: () => '<hr><b>運転者(運転者等台帳)</b>' },
      { k: "driver", label: "運転者の氏名", type: "text", half: 1 }, { k: "birth", label: "生年月日", type: "date", half: 1 },
      { k: "hired", label: "運転者になった日(雇入れ・事業開始)", type: "date" },
      { k: "license", label: "運転免許証の番号", type: "text", half: 1 }, { k: "licenseExp", label: "免許の有効期限", type: "date", half: 1 },
      { k: "vehicle", label: "車両番号(ナンバー)", type: "text", ph: "例:品川 480 あ 12-34" },
      { k: "basePlace", label: "業務の開始・終了地点(いつもの場所)", type: "text" },
      { k: "h3", type: "info", html: () => '<hr><b>貨物軽自動車安全管理者</b><div class="note">営業所ごとに選任し、運輸支局等を通じて国土交通大臣に届出します。一人で事業を行っている場合は自分を選任します。</div>' },
      { k: "kanrisha", label: "安全管理者の氏名", type: "text", half: 1 }, { k: "kanrishaBirth", label: "生年月日", type: "date", half: 1 },
      { k: "senninDate", label: "選任年月日", type: "date", half: 1 }, { k: "todokedeDate", label: "届出日", type: "date", half: 1 },
    ],
  },
};

function gyomuInfo(r) {
  const parts = [];
  if (r.startOdo !== "" && r.endOdo !== "" && r.startOdo != null && r.endOdo != null && +r.endOdo >= +r.startOdo) parts.push("メーターの差:" + fmt(+r.endOdo - +r.startOdo) + " km");
  if (r.startAt && r.endAt && dt(r.endAt) > dt(r.startAt)) {
    const tmp = { ...r, id: r.id || "__draft" };
    const w = work(SF.gyomu.filter(x => x.id !== tmp.id).concat([tmp])).map.get(tmp.id);
    if (w) {
      parts.push(`拘束 ${hmj(w.kosoku)} / 休憩 ${hmj(w.brk)} / 運転(推定) ${hmj(w.drive)} / 最長の連続運転 ${hmj(w.maxCont)}` + (w.rest != null ? ` / 前の業務からの休息 ${hmj(w.rest)}` : ""));
      if (w.issues.length) return `<div class="note">${parts.map(esc).join("<br>")}</div>` + w.issues.map(([c, t]) => `<div class="st ${c}"><b>${esc(t)}</b></div>`).join("");
    }
  }
  return parts.length ? `<div class="note">${parts.map(esc).join("<br>")}</div>` : "";
}
function jikoInfo(r) {
  const cas = (+r.dead || 0) + (+r.injured || 0), a = [];
  if (cas > 0 && r.report !== "必要") a.push("死傷者がいる事故は、国土交通大臣への事故報告が必要です。");
  if ((+r.dead || 0) >= 2 && r.sokuho !== "必要") a.push("2人以上の死者を生じた事故は、24時間以内の速報が必要です。");
  if (cas > 0) a.push("事故を起こした運転者には、特別な指導と適性診断(特定診断)が必要です(「台帳」で記録)。");
  if (r.report === "必要" && r.at && !r.reportedOn) a.push("報告の期限:" + jdy(addDays(r.at, 30)));
  return a.map(t => `<div class="st warn"><span>${esc(t)}</span></div>`).join("");
}

// ---------- 入力画面(シート) ----------
let draft = null, dKind = null, dNew = false, delArm = false;
function openSheet(kind, r, isNew) {
  dKind = kind; draft = JSON.parse(JSON.stringify(r)); dNew = isNew; delArm = false;
  if (kind === "gyomu" && draft._toKm === undefined) draft._toKm = isNew || !draft.endOdo;
  renderSheet();
  const sh = $("azSheet"); sh.classList.remove("hide"); sh.scrollTop = 0;
}
function closeSheet() { $("azSheet").classList.add("hide"); $("azSheet").innerHTML = ""; draft = null; }
const val = v => v == null ? "" : v;
function fieldHtml(f, r) {
  const v = val(r[f.k]), id = "azf_" + f.k;
  const lab = `<label for="${id}">${esc(f.label || "")}${f.req ? ' <span class="req">必須</span>' : ""}</label>`;
  const help = f.help ? `<div class="note">${esc(f.help)}</div>` : "";
  switch (f.type) {
    case "seg": return `<label>${esc(f.label)}${f.req ? ' <span class="req">必須</span>' : ""}</label><div class="seg wrapseg" data-seg="${f.k}">${f.opts.map(o => `<button type="button" data-v="${esc(o)}" class="${v === o ? "on" : ""}${f.ng === o ? " ngv" : ""}">${esc(o)}</button>`).join("")}</div>${help}`;
    case "area": return lab + `<textarea id="${id}" data-f="${f.k}" rows="${f.rows || 3}" placeholder="${esc(f.ph || "")}">${esc(v)}</textarea>` + help;
    case "info": return `<div data-info="${f.k}">${f.html(r)}</div>`;
    case "flag": return `<label class="chk"><input type="checkbox" data-f="${f.k}" ${v ? "checked" : ""}> ${esc(f.label)}</label>` + help;
    case "bp": return `<label>${esc(f.label)}</label><div style="display:flex;gap:4px;align-items:center"><input type="number" inputmode="numeric" data-f="bpHi" value="${esc(val(r.bpHi))}" aria-label="血圧(上)"><span>/</span><input type="number" inputmode="numeric" data-f="bpLo" value="${esc(val(r.bpLo))}" aria-label="血圧(下)"></div>`;
    case "checks": return `<label>${esc(f.label)} <span class="req">必須</span></label><button type="button" class="btn sec" data-act="allok" style="margin-top:4px">すべて「良」にする</button>` + TENKEN.map(([g, items]) => `<div class="ckgrp"><div class="ckhead">${esc(g)}</div>${items.map(([k, l]) => { const c = (r.items || {})[k]; return `<div class="ckrow"><span>${esc(l)}</span><div class="seg" data-ck="${k}"><button type="button" data-v="ok" class="${c === "ok" ? "on" : ""}">良</button><button type="button" data-v="ng" class="${c === "ng" ? "on" : ""}">否</button></div></div>`; }).join("")}</div>`).join("");
    case "breaks": return `<label>${esc(f.label)}</label>` + (r.breaks || []).map((b, i) => `<div class="brow"><input type="time" data-b="s" data-i="${i}" value="${esc((b.s || "").slice(11, 16))}" aria-label="休憩の始まり"><span>〜</span><input type="time" data-b="e" data-i="${i}" value="${esc((b.e || "").slice(11, 16))}" aria-label="休憩の終わり"><input class="p" data-b="p" data-i="${i}" value="${esc(b.p || "")}" placeholder="休憩した地点"><button type="button" class="del" data-act="brkdel" data-i="${i}">削除</button></div>`).join("") + `<button type="button" class="btn sec" data-act="brkadd">＋ 休憩を追加</button><div class="note">休憩は1回おおむね10分以上、合計30分以上で連続運転が区切られます。</div>`;
    default: {
      const t = { date: "date", time: "time", dt: "datetime-local", num: "number", text: "text" }[f.type];
      return lab + `<input id="${id}" type="${t}" data-f="${f.k}" value="${esc(v)}"${f.type === "num" ? ` inputmode="decimal" step="${f.step || "any"}"` : ""} placeholder="${esc(f.ph || "")}" autocomplete="off">` + help;
    }
  }
}
function renderSheet() {
  const K = KIND[dKind], r = draft, fs = K.fields.filter(f => !f.when || f.when(r));
  let h = "", half = [];
  const flushHalf = () => { if (half.length) { h += `<div class="two">${half.map(x => `<div>${x}</div>`).join("")}</div>`; half = []; } };
  for (const f of fs) { if (f.half) { half.push(fieldHtml(f, r)); if (half.length === 2) flushHalf(); } else { flushHalf(); h += fieldHtml(f, r); } }
  flushHalf();
  const sh = $("azSheet"), top = sh.scrollTop;
  sh.innerHTML = `<div class="shd"><b>${esc(K.name)}${dNew ? "を記録" : ""}</b><button type="button" data-act="close">閉じる</button></div><div class="sbody">${K.keep ? `<div class="note">${esc(K.keep)}</div>` : ""}${h}<div class="msg err" id="azErr"></div><button type="button" class="btn" data-act="save">保存する</button>${!dNew && dKind !== "profile" ? '<button type="button" class="btn danger" data-act="del">この記録を削除</button>' : ""}</div>`;
  sh.scrollTop = top;
}
function refreshInfo() {
  const fs = KIND[dKind].fields;
  document.querySelectorAll("#azSheet [data-info]").forEach(el => { const f = fs.find(x => x.k === el.dataset.info); if (f) el.innerHTML = f.html(draft); });
}
// 休憩の時刻から日時を作る(日をまたぐときは翌日に)
function brkDT(time, after) {
  if (!time) return "";
  const base = (after || draft.startAt || nowDT());
  let s = base.slice(0, 10) + "T" + time;
  if (dt(s) < dt(base)) s = addDays(base, 1) + "T" + time;
  return s;
}
$("azSheet").addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.f) {
    const f = (KIND[dKind].fields.find(x => x.k === el.dataset.f) || {});
    draft[el.dataset.f] = el.type === "checkbox" ? el.checked : (el.type === "number" ? (el.value === "" ? "" : Number(el.value)) : el.value);
    if (f.k === "endOdo" || f.k === "endAt") { const before = !!document.querySelector('#azSheet [data-f="_toKm"]'); const now = KIND[dKind].fields.find(x => x.k === "_toKm"); if (now && before !== !!now.when(draft)) { renderSheet(); return; } }
  } else if (el.dataset.b) {
    const b = draft.breaks[+el.dataset.i];
    if (el.dataset.b === "p") b.p = el.value;
    else if (el.dataset.b === "s") b.s = brkDT(el.value);
    else b.e = brkDT(el.value, b.s || undefined);
  }
  refreshInfo();
});
$("azSheet").addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  const seg = t.closest("[data-seg]"), ck = t.closest("[data-ck]");
  if (seg) { const k = seg.dataset.seg; const f = KIND[dKind].fields.find(x => x.k === k); draft[k] = draft[k] === t.dataset.v && !f.req ? "" : t.dataset.v; renderSheet(); return; }
  if (ck) { draft.items = draft.items || {}; draft.items[ck.dataset.ck] = t.dataset.v; renderSheet(); return; }
  const act = t.dataset.act;
  if (act === "close") return closeSheet();
  if (act === "allok") { draft.items = draft.items || {}; TENKEN_ITEMS.forEach(([k]) => { if (!draft.items[k]) draft.items[k] = "ok"; }); renderSheet(); return; }
  if (act === "brkadd") { draft.breaks = draft.breaks || []; draft.breaks.push({ s: "", e: "", p: "" }); renderSheet(); return; }
  if (act === "brkdel") { draft.breaks.splice(+t.dataset.i, 1); renderSheet(); return; }
  if (act === "save") return saveDraft();
  if (act === "del") {
    if (!delArm) { delArm = true; t.textContent = "もう一度タップで削除"; setTimeout(() => { delArm = false; if (t.isConnected) t.textContent = "この記録を削除"; }, 3000); return; }
    const id = draft.id; SF[dKind] = SF[dKind].filter(r => r.id !== id); const k = dKind; closeSheet();
    await write("del", k, id); toast("削除しました");
  }
});
async function saveDraft() {
  const K = KIND[dKind], r = draft;
  if (dKind === "gyomu") r.breaks = (r.breaks || []).filter(b => b.s || b.e || b.p);
  const miss = K.fields.find(f => f.req && (!f.when || f.when(r)) && f.type !== "checks" && (r[f.k] === "" || r[f.k] == null));
  const err = miss ? `「${miss.label}」を${miss.type === "seg" ? "選んで" : "入れて"}ください` : K.check ? K.check(r) : null;
  if (err) { $("azErr").textContent = err; return; }
  if (dKind === "tenken" && !tenkenNG(r).length) r.result = "運行可";
  if (dKind === "gyomu" && (r.distance === "" || r.distance == null) && r.endOdo !== "" && r.startOdo !== "" && r.endOdo != null && r.startOdo != null) r.distance = +r.endOdo - +r.startOdo;
  const toKm = dKind === "gyomu" && r._toKm && r.endAt && r.endOdo !== "" && r.endOdo != null;
  const clean = {}; Object.keys(r).forEach(k => { if (k[0] !== "_") clean[k] = r[k]; });
  clean.u = Date.now();
  const kind = dKind;
  if (kind === "profile") { SF.profile = clean; closeSheet(); await write("put", "profile", "main"); toast("保存しました"); return; }
  if (!clean.id) clean.id = uid();
  const i = SF[kind].findIndex(x => x.id === clean.id);
  if (i >= 0) SF[kind][i] = clean; else SF[kind].push(clean);
  // 日常点検を記録したら、同じ日の乗務前点呼を「実施済」にする
  if (kind === "tenken") SF.tenko.filter(t => t.date === clean.date && t.phase === "乗務前" && t.tenken !== "実施済").forEach(t => { t.tenken = "実施済"; t.u = Date.now(); write("put", "tenko", t.id); });
  closeSheet();
  await write("put", kind, clean.id);
  toast(K.name + "を保存しました");
  if (toKm) addKm(clean.endAt.slice(0, 10), +clean.endOdo);
}
// 業務終了のメーターを、メンテナンス側の走行距離にも記録する
async function addKm(date, odo) {
  const same = S.km.find(r => r.date === date);
  if (same && same.odo === odo) return;
  const prev = S.km.filter(r => r.date < date).sort((a, b) => a.date < b.date ? 1 : -1)[0];
  if (prev && odo < prev.odo) { toast("終了メーターが前回の走行距離より小さいので、走行距離には入れませんでした"); return; }
  const id = String(Date.now());
  try { await remote(() => api("POST", "/api/odometer", { id, date, odo })); } catch (e) { return; }
  S.km = S.km.filter(r => r.date !== date); S.km.push({ id, date, odo }); save(); render();
}

// ---------- 画面 ----------
let tab = "home", recKind = "tenko", month = today().slice(0, 7), WK = null;
const sortDesc = (kind, list) => list.slice().sort((a, b) => { const x = KIND[kind].key(a), y = KIND[kind].key(b); return x < y ? 1 : x > y ? -1 : 0; });
const dayOf = (kind, r) => (KIND[kind].key(r) || "").slice(0, 10);
function rowHtml(kind, r, showDate) {
  const K = KIND[kind], bad = K.bad && K.bad(r);
  return `<button type="button" class="rowb" data-open="${kind}" data-id="${esc(r.id)}"><div class="big">${showDate ? esc(jd(dayOf(kind, r))) + " " : ""}${esc(K.title(r))}${bad ? ' <span class="tag bad">要確認</span>' : ""}</div><div class="d">${esc(K.sub(r) || "")}</div></button>`;
}
function renderHome() {
  const d = today(), p = P();
  const mae = SF.tenko.filter(r => r.date === d && r.phase === "乗務前").sort((a, b) => a.time < b.time ? 1 : -1)[0];
  const ato = SF.tenko.filter(r => r.date === d && r.phase === "乗務後").sort((a, b) => a.time < b.time ? 1 : -1)[0];
  const tk = todayTenken(d).sort((a, b) => a.time < b.time ? 1 : -1)[0];
  const open = sortDesc("gyomu", SF.gyomu.filter(r => r.startAt && !r.endAt))[0];
  const doneG = sortDesc("gyomu", SF.gyomu.filter(r => r.startAt && r.endAt && (r.startAt.slice(0, 10) === d || r.endAt.slice(0, 10) === d)))[0];
  const ob = open && (open.breaks || []).find(b => b.s && !b.e);
  const step = (ic, title, sub, cls, btn) => `<div class="step"><div class="ic">${ic}</div><div class="tx"><b class="${cls || ""}">${title}</b><div class="d">${sub}</div></div>${btn}</div>`;
  const B = (act, label, sec) => `<button type="button" class="btn${sec ? " sec" : ""}" data-home="${act}">${label}</button>`;
  let h = `<div class="card"><div class="h2"><b>今日 ${esc(jdy(d))}</b></div>`;
  h += step(tk ? (tenkenStop(tk) ? "⛔" : tenkenNG(tk).length ? "⚠️" : "✅") : "①", "日常点検", tk ? esc(tk.time + " " + (tenkenNG(tk).length ? "否:" + tenkenNG(tk).join("・") + " / " + (tk.result || "") : "異常なし")) : "エンジンルーム・ライト・タイヤ・運転席周り", tk ? (tenkenStop(tk) ? "bad" : tenkenNG(tk).length ? "warnc" : "done") : "", tk ? `<button type="button" class="btn sec" data-open="tenken" data-id="${esc(tk.id)}">見る</button>` : B("tenken", "点検する"));
  h += step(mae ? (tenkoIssues(mae).length ? "⛔" : "✅") : "②", "乗務前点呼", mae ? esc(mae.time + " " + mae.method + " / 酒気帯び" + mae.alcohol + (tenkoIssues(mae).length ? " / " + tenkoIssues(mae).join("・") : "")) : "酒気帯び・体調・日常点検を確認", mae ? (tenkoIssues(mae).length ? "bad" : "done") : "", mae ? `<button type="button" class="btn sec" data-open="tenko" data-id="${esc(mae.id)}">見る</button>` : B("mae", "記録する"));
  if (open) {
    const since = jdt(open.startAt);
    h += step("🚚", "業務中" + (ob ? "(休憩中)" : ""), esc(since + " 開始" + (open.startPlace ? " / " + open.startPlace : "") + ((open.breaks || []).length ? ` / 休憩${open.breaks.length}回` : "")), "warnc", `<div class="btns">${ob ? B("brkEnd", "休憩おわり", 1) : B("brkStart", "休憩", 1)}${B("end", "業務終了")}</div>`);
  } else if (doneG) {
    const w = WK.map.get(doneG.id);
    h += step(w && w.issues.some(i => i[0] === "ng") ? "⚠️" : "✅", "業務の記録", esc(KIND.gyomu.title(doneG) + (doneG.distance !== "" && doneG.distance != null ? " / " + fmt(doneG.distance) + "km" : "") + (w ? " / 拘束" + hm(w.kosoku) : "")), "done", `<div class="btns"><button type="button" class="btn sec" data-open="gyomu" data-id="${esc(doneG.id)}">見る</button>${B("start", "もう1件", 1)}</div>`);
  } else h += step("③", "業務の記録", "開始・休憩・終了の時刻と地点、距離", "", B("start", "業務開始"));
  h += step(ato ? "✅" : "④", "乗務後点呼", ato ? esc(ato.time + " / 酒気帯び" + ato.alcohol + (ato.report ? " / " + ato.report.split("\n")[0] : "")) : "酒気帯び・車両・道路・運行の状況", ato ? (tenkoIssues(ato).length ? "bad" : "done") : "", ato ? `<button type="button" class="btn sec" data-open="tenko" data-id="${esc(ato.id)}">見る</button>` : B("ato", "記録する", !open && !doneG));
  h += "</div>";
  const al = alerts();
  h += `<div class="card"><b>注意・期限</b>${al.length ? al.map(([c, t, s]) => `<div class="st ${c}"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ""}</div>`).join("") : '<div class="st"><b>問題はありません</b></div>'}</div>`;
  const mk = monthKosoku(WK, d.slice(0, 7)), yk = yearKosoku(WK), mp = mk / (284 * 60), yp = yk / (3300 * 60);
  const cls = x => x > 1 ? "ng" : x > 0.9 ? "warn" : "";
  h += `<div class="card"><b>拘束時間(勤務時間)</b>
    <div class="stat" style="margin-top:8px"><div><div class="k">今月</div><div class="v">${hm(mk)}</div><div class="d">上限 284時間</div><div class="meter"><i class="${cls(mp)}" style="width:${Math.min(100, mp * 100).toFixed(1)}%"></i></div></div>
    <div><div class="k">直近1年</div><div class="v">${hm(yk)}</div><div class="d">上限 3,300時間</div><div class="meter"><i class="${cls(yp)}" style="width:${Math.min(100, yp * 100).toFixed(1)}%"></i></div></div></div>
    <div class="note">1日の拘束13時間以内(上限15時間)、休息期間は継続11時間以上が基本で9時間を下回らない、運転は2日平均1日9時間・2週平均1週44時間以内、連続運転4時間以内(改善基準告示)。休憩以外はすべて運転として計算した目安です。</div></div>`;
  if (!p.driver) h += `<div class="card"><b>はじめに</b><div class="note">「台帳」タブで、事業者名・運転者・車両番号・安全管理者を登録してください。点呼や業務の記録に自動で入ります。</div><button type="button" class="btn" data-open="profile" data-id="main">登録する</button></div>`;
  $("az-home").innerHTML = h;
}
const REC_NOTE = { tenko: "乗務前・乗務後の点呼。1年間保存。", tenken: "乗務前の日常点検。", gyomu: "業務の開始・終了・休憩の日時と地点、距離、主な経過地点。1年間保存。", shido: "運転者への指導・監督。毎年実施し、3年間保存。" };
function renderRec() {
  document.querySelectorAll("#azRecSeg button").forEach(b => b.classList.toggle("on", b.dataset.k === recKind));
  const [y, m] = month.split("-");
  $("azMon").textContent = `${y}年${+m}月`;
  $("azNext").disabled = month >= today().slice(0, 7);
  $("azRecNote").textContent = REC_NOTE[recKind];
  const list = sortDesc(recKind, SF[recKind].filter(r => dayOf(recKind, r).slice(0, 7) === month));
  let h = "", last = "";
  for (const r of list) {
    const d = dayOf(recKind, r);
    if (d !== last) { h += `<div class="d" style="margin-top:10px;font-weight:700">${esc(jd(d))}</div>`; last = d; }
    h += rowHtml(recKind, r, false);
  }
  $("azList").innerHTML = h || '<div class="d" style="margin-top:10px">この月の記録はありません</div>';
}
function renderJiko() {
  const list = sortDesc("jiko", SF.jiko);
  $("az-jiko").innerHTML = `<div class="card"><b>事故の記録</b><div class="note">事故が発生したら、概要・原因・再発防止対策などを記録し、3年間保存します。死傷者を生じた事故などは30日以内に運輸支局等を通じて国土交通大臣へ報告(2人以上の死者などは24時間以内に速報)。</div><button type="button" class="btn" data-new="jiko">＋ 事故を記録</button>${list.map(r => rowHtml("jiko", r, false)).join("") || '<div class="d" style="margin-top:10px">記録はありません</div>'}</div>`;
}
function renderDaicho() {
  const p = P(), age = ageOn(p.birth, today());
  const kv = (k, v) => `<dt>${esc(k)}</dt><dd>${v ? esc(v) : '<span class="warnc">未登録</span>'}</dd>`;
  let h = `<div class="card"><div class="h2"><b>事業者・運転者・安全管理者</b><button type="button" class="btn sec" data-open="profile" data-id="main">編集</button></div><dl class="kv">
    ${kv("事業者", p.jigyosha)}${kv("営業所", p.eigyosho)}${kv("経営届出日", p.keieiDate ? jdy(p.keieiDate) : "")}
    ${kv("運転者", p.driver ? p.driver + (age != null ? `(${age}歳)` : "") : "")}${kv("運転者になった日", p.hired ? jdy(p.hired) : "")}${kv("免許の有効期限", p.licenseExp ? jdy(p.licenseExp) : "")}${kv("車両番号", p.vehicle)}
    ${kv("安全管理者", p.kanrisha)}${kv("選任日", p.senninDate ? jdy(p.senninDate) : "")}${kv("届出日", p.todokedeDate ? jdy(p.todokedeDate) : "")}</dl></div>`;
  const sec = (kind, title, note) => { const list = sortDesc(kind, SF[kind]); return `<div class="card"><div class="h2"><b>${esc(title)}</b><button type="button" class="btn sec" data-new="${kind}">＋ 追加</button></div><div class="note">${esc(note)}</div>${list.map(r => rowHtml(kind, r, false)).join("") || '<div class="d" style="margin-top:8px">記録はありません</div>'}</div>`; };
  h += sec("koshu", "安全管理者講習", "選任前に講習、選任後は2年ごとに定期講習(国土交通大臣の登録機関)。");
  h += sec("kenshin", "健康診断", "雇い入れる際と1年に1回受診し、結果を事業者に提出。");
  h += sec("tekisei", "適性診断", "初任運転者・65歳以上・死傷事故を起こした者に、認定された適性診断を受診させる。");
  h += sec("tokubetsu", "特別な指導", "初任運転者・65歳以上・死傷事故を起こした者に、特別な指導をする。");
  $("az-daicho").innerHTML = h;
}

// ---------- 出力(印刷・PDF / CSV) ----------
const REPORTS = { tenko: "点呼記録簿", tenken: "日常点検表", gyomu: "業務の記録", work: "勤務時間チェック", jiko: "事故の記録", shido: "指導・監督の記録", daicho: "運転者等台帳・安全管理者" };
let outType = "tenko", outFrom = today().slice(0, 7), outTo = today().slice(0, 7);
function renderOut() {
  const months = new Set([today().slice(0, 7)]);
  KINDS.forEach(k => SF[k].forEach(r => { const d = dayOf(k, r); if (d) months.add(d.slice(0, 7)); }));
  const ms = [...months].sort().reverse();
  const opt = (v, cur, l) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(l)}</option>`;
  const ml = m => m.slice(0, 4) + "年" + (+m.slice(5)) + "月";
  $("az-out").innerHTML = `<div class="card"><b>記録の印刷・書き出し</b><div class="note">監査や保存用に、記録簿の形で印刷(PDF保存)したり、Excelで開けるCSVに書き出せます。</div>
    <label for="azOutType">記録の種類</label><select id="azOutType">${Object.entries(REPORTS).map(([k, l]) => opt(k, outType, l)).join("")}</select>
    <div class="two" id="azOutPeriod"${outType === "daicho" ? ' style="display:none"' : ""}><div><label for="azOutFrom">期間(から)</label><select id="azOutFrom">${ms.map(m => opt(m, outFrom, ml(m))).join("")}</select></div><div><label for="azOutTo">期間(まで)</label><select id="azOutTo">${ms.map(m => opt(m, outTo, ml(m))).join("")}</select></div></div>
    <div class="two"><button type="button" class="btn" id="azPrint">印刷・PDF</button><button type="button" class="btn sec" id="azCsv">CSVで保存</button></div>
    <div class="msg" id="azOutMsg"></div>
    <div class="note">印刷の画面で「PDFとして保存」を選ぶとPDFになります。ホーム画面のアプリで印刷の画面が出ないときは、Safariでこのページを開いて印刷してください。</div></div>
    <div class="card"><b>保存期間</b><div class="note">点呼記録・業務の記録:1年間 / 事故の記録・指導監督の記録:3年間。記録は自動では消えません。</div></div>`;
  $("azOutType").onchange = e => { outType = e.target.value; renderOut(); };
  $("azOutFrom").onchange = e => { outFrom = e.target.value; if (outTo < outFrom) outTo = outFrom; renderOut(); };
  $("azOutTo").onchange = e => { outTo = e.target.value; if (outTo < outFrom) outFrom = outTo; renderOut(); };
  $("azPrint").onclick = () => doPrint();
  $("azCsv").onclick = () => doCsv();
}
const inPeriod = d => d && d.slice(0, 7) >= outFrom && d.slice(0, 7) <= outTo;
const periodLabel = () => { const ml = m => m.slice(0, 4) + "年" + (+m.slice(5)) + "月"; return outFrom === outTo ? ml(outFrom) : ml(outFrom) + "〜" + ml(outTo); };
const ascBy = (kind, list) => sortDesc(kind, list).reverse();
// 表の形(head と rows)を作る。印刷とCSVの両方で使う
function report(type) {
  const p = P(), W = work();
  if (type === "tenko") {
    const L = ascBy("tenko", SF.tenko.filter(r => inPeriod(r.date)));
    return [{ head: ["日付", "区分", "時刻", "方法", "点呼執行者", "運転者", "検知器", "数値(mg/L)", "酒気帯び", "疾病", "疲労", "睡眠不足", "体温", "血圧", "日常点検", "自動車・道路・運行の状況", "指示事項", "備考"],
      rows: L.map(r => [jdy(r.date), r.phase, r.time, r.method, r.tenkosha, r.driver, r.detector, r.alcValue, r.alcohol, r.phase === "乗務前" ? r.sick : "", r.phase === "乗務前" ? r.tired : "", r.phase === "乗務前" ? r.sleep : "", r.phase === "乗務前" ? r.temp : "", r.phase === "乗務前" && (r.bpHi || r.bpLo) ? (r.bpHi || "") + "/" + (r.bpLo || "") : "", r.phase === "乗務前" ? r.tenken : "", r.report, r.order, r.note]),
      ng: L.map(r => tenkoIssues(r).length > 0) }];
  }
  if (type === "tenken") {
    const L = ascBy("tenken", SF.tenken.filter(r => inPeriod(r.date)));
    return [{ head: ["日付", "時刻", "車両番号", "走行距離(km)", ...TENKEN_ITEMS.map(x => x[1]), "判定", "不具合の内容・処置", "点検者"],
      rows: L.map(r => [jdy(r.date), r.time, r.vehicle, r.odo, ...TENKEN_ITEMS.map(([k]) => ({ ok: "良", ng: "否" })[(r.items || {})[k]] || ""), tenkenNG(r).length ? "否あり・" + (r.result || "") : "良", r.note, r.checker]), matrix: L, ng: L.map(r => tenkenStop(r)) }];
  }
  if (type === "gyomu") {
    const L = ascBy("gyomu", SF.gyomu.filter(r => inPeriod((r.startAt || "").slice(0, 10))));
    return [{ head: ["運転者等の氏名", "車両番号", "業務開始の日時", "開始地点", "業務終了の日時", "終了地点", "休憩(日時・地点)", "開始メーター", "終了メーター", "業務に従事した距離(km)", "主な経過地点", "拘束時間", "備考"],
      rows: L.map(r => { const w = W.map.get(r.id); return [r.driver, r.vehicle, jdt(r.startAt), r.startPlace, jdt(r.endAt), r.endPlace, (r.breaks || []).map(b => `${(b.s || "").slice(11, 16)}〜${(b.e || "").slice(11, 16)}${b.p ? " " + b.p : ""}`).join("\n"), r.startOdo, r.endOdo, r.distance, r.waypoints, w ? hm(w.kosoku) : "", r.note]; }) }];
  }
  if (type === "work") {
    const L = W.list.filter(w => inPeriod(w.day));
    const sum = L.reduce((a, w) => a + w.kosoku, 0);
    return [{ head: ["日付", "業務開始", "業務終了", "拘束時間", "休憩", "運転(推定)", "最長の連続運転", "前の業務からの休息期間", "判定"],
      rows: L.map(w => [jdy(w.day), w.r.startAt.slice(11, 16), (w.r.endAt.slice(0, 10) !== w.day ? jd(w.r.endAt) + " " : "") + w.r.endAt.slice(11, 16), hm(w.kosoku), hm(w.brk), hm(w.drive), hm(w.maxCont), w.rest == null ? "" : hm(w.rest), w.issues.map(i => i[1]).join("\n") || "問題なし"]).concat([["合計", "", "", hm(sum), "", hm(L.reduce((a, w) => a + w.drive, 0)), "", "", ""]]),
      ng: L.map(w => w.issues.some(i => i[0] === "ng")).concat([false]), foot: "目安:1日の拘束13時間以内(上限15時間・14時間超は週2回まで)、休息期間は継続11時間以上が基本で9時間を下回らない、運転時間は2日平均1日9時間・2週平均1週44時間以内、連続運転4時間以内、1か月284時間・1年3,300時間以内。運転時間は休憩以外をすべて運転として計算しています。" }];
  }
  if (type === "jiko") {
    const L = ascBy("jiko", SF.jiko.filter(r => inPeriod((r.at || "").slice(0, 10))));
    return [{ head: ["発生日時", "乗務員等の氏名", "車両番号", "発生場所", "種類", "死者", "負傷者", "事故の概要", "事故の原因", "再発防止対策", "事故報告", "報告日", "速報", "速報日時", "備考"],
      rows: L.map(r => [jdt(r.at), r.crew, r.vehicle, r.place, r.type, r.dead, r.injured, r.summary, r.cause, r.prevention, r.report, jdy(r.reportedOn), r.sokuho, jdt(r.sokuhoAt), r.note]), blocks: L }];
  }
  if (type === "shido") {
    const L = ascBy("shido", SF.shido.filter(r => inPeriod((r.at || "").slice(0, 10))));
    return [{ head: ["実施した日時", "実施した場所", "実施内容", "実施した者", "受けた者", "時間(分)", "備考"], rows: L.map(r => [jdt(r.at), r.place, r.content, r.by, r.to, r.minutes, r.note]) }];
  }
  // 台帳
  return [
    { title: "運転者", head: ["項目", "内容"], rows: [["事業者の氏名又は名称", p.jigyosha], ["営業所", p.eigyosho], ["運転者の氏名", p.driver], ["生年月日", jdy(p.birth) + (p.birth ? `(${ageOn(p.birth, today())}歳)` : "")], ["運転者になった日", jdy(p.hired)], ["運転免許証の番号", p.license], ["免許の有効期限", jdy(p.licenseExp)], ["車両番号", p.vehicle]] },
    { title: "特別な指導", head: ["実施日", "対象", "指導の内容", "指導した者", "時間(分)", "備考"], rows: ascBy("tokubetsu", SF.tokubetsu).map(r => [jdy(r.date), r.target, r.content, r.by, r.minutes, r.note]) },
    { title: "適性診断の受診状況", head: ["受診日", "種類", "受診機関", "結果・備考"], rows: ascBy("tekisei", SF.tekisei).map(r => [jdy(r.date), r.type, r.org, r.note]) },
    { title: "健康診断", head: ["受診日", "種類", "医療機関", "結果・所見", "結果の提出"], rows: ascBy("kenshin", SF.kenshin).map(r => [jdy(r.date), r.type, r.place, r.result, r.submitted]) },
    { title: "事故歴", head: ["発生日時", "場所", "種類", "死者", "負傷者", "概要"], rows: ascBy("jiko", SF.jiko).map(r => [jdt(r.at), r.place, r.type, r.dead, r.injured, r.summary]) },
    { title: "貨物軽自動車安全管理者", head: ["項目", "内容"], rows: [["氏名", p.kanrisha], ["生年月日", jdy(p.kanrishaBirth)], ["選任年月日", jdy(p.senninDate)], ["届出日", jdy(p.todokedeDate)]] },
    { title: "安全管理者講習の受講", head: ["修了日", "種類", "講習機関", "修了証の番号", "備考"], rows: ascBy("koshu", SF.koshu).map(r => [jdy(r.date), r.type, r.org, r.certNo, r.note]) },
  ];
}
const cell = v => esc(val(v)).replace(/\n/g, "<br>");
function tableHtml(t) {
  return `<table><thead><tr>${t.head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${t.rows.length ? t.rows.map((r, i) => `<tr${t.ng && t.ng[i] ? ' class="ng"' : ""}>${r.map(c => { const t = String(val(c)); return `<td${t.length <= 16 && !t.includes("\n") ? ' class="nw"' : ""}>${cell(c)}</td>`; }).join("")}</tr>`).join("") : `<tr><td colspan="${t.head.length}">記録はありません</td></tr>`}</tbody></table>`;
}
// 日常点検表は、行=点検項目・列=日 の形で月ごとに印刷する
function tenkenMatrix(L) {
  const byMonth = {};
  L.forEach(r => (byMonth[r.date.slice(0, 7)] = byMonth[r.date.slice(0, 7)] || []).push(r));
  const months = Object.keys(byMonth).sort();
  if (!months.length) return "<p>記録はありません</p>";
  return months.map((m, mi) => {
    const last = new Date(+m.slice(0, 4), +m.slice(5), 0).getDate(), days = Array.from({ length: last }, (_, i) => i + 1);
    const at = {}; byMonth[m].forEach(r => { at[+r.date.slice(8)] = r; });
    const c = (d, k) => { const r = at[d]; if (!r) return ""; const v = (r.items || {})[k]; return v === "ok" ? "✓" : v === "ng" ? '<span class="ng">×</span>' : ""; };
    let h = `<div${mi ? ' style="page-break-before:always"' : ""}><h2>${m.slice(0, 4)}年${+m.slice(5)}月</h2><table class="mx"><colgroup><col style="width:62mm">${days.map(() => "<col>").join("")}</colgroup><thead><tr><th>点検項目 \\ 日</th>${days.map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody>`;
    TENKEN.forEach(([g, items]) => { h += `<tr><td colspan="${last + 1}" style="background:#f3f3f3;text-align:left"><b>${esc(g)}</b></td></tr>`; items.forEach(([k, l]) => { h += `<tr><td>${esc(l)}</td>${days.map(d => `<td>${c(d, k)}</td>`).join("")}</tr>`; }); });
    h += `<tr><td>走行距離(km)</td>${days.map(d => `<td style="font-size:6pt">${at[d] && at[d].odo !== "" && at[d].odo != null ? esc(at[d].odo) : ""}</td>`).join("")}</tr>`;
    h += `<tr><td>判定</td>${days.map(d => `<td style="font-size:6pt">${at[d] ? (tenkenStop(at[d]) ? '<span class="ng">不可</span>' : "可") : ""}</td>`).join("")}</tr>`;
    h += `<tr><td>点検者</td>${days.map(d => `<td style="font-size:6pt">${at[d] ? esc(at[d].checker || "") : ""}</td>`).join("")}</tr></tbody></table>`;
    const notes = byMonth[m].filter(r => r.note || tenkenNG(r).length);
    if (notes.length) h += `<table><thead><tr><th>日付</th><th>否の項目</th><th>不具合の内容・処置</th><th>判定</th></tr></thead><tbody>${notes.map(r => `<tr><td>${esc(jd(r.date))}</td><td>${esc(tenkenNG(r).join("・"))}</td><td>${cell(r.note)}</td><td>${esc(r.result || "")}</td></tr>`).join("")}</tbody></table>`;
    return h + "<div class=\"pnote\">✓:良 ×:否</div></div>";
  }).join("");
}
function jikoBlocks(L) {
  if (!L.length) return "<p>記録はありません</p>";
  return L.map(r => `<div class="pblock"><table><tbody>${[["発生日時", jdt(r.at)], ["乗務員等の氏名", r.crew], ["車両番号", r.vehicle], ["発生場所", r.place], ["種類", r.type], ["死傷者", `死者 ${+r.dead || 0}人 / 負傷者 ${+r.injured || 0}人`], ["事故の概要", r.summary], ["事故の原因", r.cause], ["再発防止対策", r.prevention], ["国土交通大臣への事故報告", (r.report || "") + (r.reportedOn ? "(報告日 " + jdy(r.reportedOn) + ")" : "")], ["速報", (r.sokuho || "") + (r.sokuhoAt ? "(" + jdt(r.sokuhoAt) + ")" : "")], ["備考", r.note]].map(([k, v]) => `<tr><th style="width:42mm">${esc(k)}</th><td>${cell(v)}</td></tr>`).join("")}</tbody></table></div>`).join("");
}
function reportHtml(type) {
  const p = P(), ts = report(type);
  let body;
  if (type === "tenken") body = tenkenMatrix(ts[0].matrix);
  else if (type === "jiko") body = jikoBlocks(ts[0].blocks);
  else body = ts.map(t => (t.title ? `<h2>${esc(t.title)}</h2>` : "") + tableHtml(t) + (t.foot ? `<div class="pnote">${esc(t.foot)}</div>` : "")).join("");
  const keep = { tenko: "1年間保存", gyomu: "1年間保存", jiko: "3年間保存", shido: "3年間保存" }[type];
  return `<h1>${esc(REPORTS[type])}</h1><div class="pmeta"><span>事業者:${esc(p.jigyosha || "")}</span><span>営業所:${esc(p.eigyosho || "")}</span>${type !== "daicho" ? `<span>期間:${esc(periodLabel())}</span>` : ""}<span>出力日:${esc(jdy(today()))}</span>${keep ? `<span>${keep}</span>` : ""}</div>${body}`;
}
function doPrint() {
  $("printArea").innerHTML = reportHtml(outType);
  const done = () => { $("printArea").innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
}
function doCsv() {
  const q = v => { const s = String(val(v)); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const ts = report(outType);
  const lines = [];
  ts.forEach((t, i) => { if (t.title) { if (i) lines.push(""); lines.push(q(t.title)); } lines.push(t.head.map(q).join(",")); t.rows.forEach(r => lines.push(r.map(q).join(","))); });
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = REPORTS[outType].replace(/[・\/]/g, "_") + (outType === "daicho" ? "" : "_" + outFrom + (outTo !== outFrom ? "_" + outTo : "")) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  $("azOutMsg").textContent = "CSVを書き出しました。";
}

function renderAll() {
  WK = work();
  renderHome(); renderRec(); renderJiko(); renderDaicho();
  if (tab === "out") renderOut();
}

// ---------- 操作 ----------
document.querySelectorAll("#azTabs button").forEach(b => b.onclick = () => {
  tab = b.dataset.t;
  document.querySelectorAll("#azTabs button").forEach(x => x.classList.toggle("on", x === b));
  ["home", "rec", "jiko", "daicho", "out"].forEach(t => $("az-" + t).classList.toggle("hide", t !== tab));
  if (tab === "out") renderOut();
  $("modeSafe").closest(".wrap").scrollTop = 0;
});
document.querySelectorAll("#azRecSeg button").forEach(b => b.onclick = () => { recKind = b.dataset.k; renderRec(); });
$("azPrev").onclick = () => { const d = dt(month + "-01"); d.setMonth(d.getMonth() - 1); month = ymd(d).slice(0, 7); renderRec(); };
$("azNext").onclick = () => { const d = dt(month + "-01"); d.setMonth(d.getMonth() + 1); month = ymd(d).slice(0, 7); renderRec(); };
$("azAdd").onclick = () => openSheet(recKind, KIND[recKind].make(), true);
$("modeSafe").addEventListener("click", async e => {
  const o = e.target.closest("[data-open]"), n = e.target.closest("[data-new]"), hb = e.target.closest("[data-home]");
  if (o) { const k = o.dataset.open; const r = k === "profile" ? SF.profile : SF[k].find(x => x.id === o.dataset.id); if (r) openSheet(k, r, k === "profile" ? !Object.keys(r).length : false); return; }
  if (n) { openSheet(n.dataset.new, KIND[n.dataset.new].make(), true); return; }
  if (!hb) return;
  const act = hb.dataset.home;
  const open = sortDesc("gyomu", SF.gyomu.filter(r => r.startAt && !r.endAt))[0];
  if (act === "mae" || act === "ato") { const r = KIND.tenko.make(); r.phase = act === "mae" ? "乗務前" : "乗務後"; openSheet("tenko", r, true); }
  else if (act === "tenken") openSheet("tenken", KIND.tenken.make(), true);
  else if (act === "start") openSheet("gyomu", KIND.gyomu.make(), true);
  else if (act === "end" && open) { const r = JSON.parse(JSON.stringify(open)); r.endAt = nowDT(); if (!r.endPlace) r.endPlace = P().basePlace || ""; (r.breaks || []).forEach(b => { if (b.s && !b.e) b.e = r.endAt; }); openSheet("gyomu", r, false); }
  else if (act === "brkStart" && open) { open.breaks = open.breaks || []; open.breaks.push({ s: nowDT(), e: "", p: "" }); open.u = Date.now(); await write("put", "gyomu", open.id); toast("休憩を始めました(" + nowTime() + ")"); }
  else if (act === "brkEnd" && open) { const b = (open.breaks || []).find(x => x.s && !x.e); if (b) { b.e = nowDT(); open.u = Date.now(); await write("put", "gyomu", open.id); toast("休憩を終わりました(" + hmj((dt(b.e) - dt(b.s)) / 60000) + ")"); } }
});

// メンテナンス / 安全管理 の切り替え(最後に開いた方を覚えておく)
function setMode(m) {
  document.querySelectorAll("#modes button").forEach(b => b.classList.toggle("on", b.dataset.m === m));
  $("modeMaint").classList.toggle("hide", m !== "maint");
  $("modeSafe").classList.toggle("hide", m !== "safe");
  $("appTitle").textContent = m === "safe" ? "🛡 安全管理(軽貨物)" : "🚗 社用車メンテナンス";
  try { localStorage.setItem("carMode", m); } catch (e) {}
}
document.querySelectorAll("#modes button").forEach(b => b.onclick = () => { setMode(b.dataset.m); $("modes").closest(".wrap").scrollTop = 0; });
let m0 = "maint"; try { m0 = localStorage.getItem("carMode") || "maint"; } catch (e) {}
setMode(m0 === "safe" ? "safe" : "maint");

// 1分ごとに「今日」の表示を更新(休憩・期限の残り時間など)
setInterval(() => { if (!draft && document.visibilityState === "visible") renderHome(); }, 60000);

// ---------- app.js から使う ----------
window.AZ = {
  data: () => JSON.parse(JSON.stringify(SF)),
  render: () => { renderAll(); syncNote(); },
  pull,
  // この端末の記録をサーバーに送る(サーバー側を置き換え)
  upload: async () => { if (!online()) return; await api("PUT", "/api/safety", SF); Q = []; saveQ(); srvOK = true; syncNote(); },
  // バックアップの取り込み(置き換え)
  replace: async d => {
    const n = normalizeSF(d);
    if (online()) { await api("PUT", "/api/safety", n); Q = []; saveQ(); }
    SF = n; await store(); renderAll(); syncNote();
  },
};

(async () => {
  let d = null;
  try { d = await idb("get"); } catch (e) {}
  if (!d) { try { const t = localStorage.getItem("carSafety"); if (t) d = JSON.parse(t); } catch (e) {} }
  if (d) SF = normalizeSF(d);
  renderAll(); syncNote();
  pull();
})();
})();
