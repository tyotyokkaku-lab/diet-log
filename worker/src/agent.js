// Even G2(Even AI の「Add Agent」)からの音声入力
// 旧サーバー(car-maint)の仕組みをこちらのデータベースに合わせて移したもの。
// Even からの問い合わせには、エラーでも必ず 200 で「メガネに表示できる文章」を
// OpenAI 互換(chat.completion)の形で返す。

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_SET = { oilKm: 5000, oilMo: 6, tireKm: 40000, tireMo: 36 };
const fmt = n => Number(n).toLocaleString("ja-JP");
const md = d => d.slice(5).replace("-", "/");

function todayJST(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

// 合言葉は Authorization(Bearer あり/なし)、x-api-key、api-key、?token= のどれでも受け付ける
export function agentToken(req, url) {
  const h = (req.headers.get("authorization") || "").trim();
  if (h) return h.replace(/^(Bearer|Token|Basic)\s+/i, "").trim();
  const k = req.headers.get("x-api-key") || req.headers.get("api-key");
  if (k) return k.trim();
  return (url && url.searchParams.get("token")) || "";
}

export function isAgentPath(req, path) {
  return req.method === "POST" && (path === "" || path === "/agent" || path.endsWith("/chat/completions"));
}

// 届いた問い合わせを記録(合言葉そのものは保存しない)。直近50件だけ残す
async function logAgent(env, info) {
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO agentlog (at, info) VALUES (?, ?)")
        .bind(new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace("Z", "+09:00"), JSON.stringify(info)),
      env.DB.prepare("DELETE FROM agentlog WHERE id <= (SELECT MAX(id) - 50 FROM agentlog)"),
    ]);
  } catch (e) {}
}

export async function agentEntry(req, env, url, { sameSecret, locked, onFail }) {
  let raw = "", body = {};
  try { raw = await req.text(); body = JSON.parse(raw || "{}"); } catch (e) {}
  const got = agentToken(req, url);
  const want = String(env.PASSCODE || "").trim();
  const headers = {};
  for (const [k, v] of req.headers) headers[k] = /authorization|api-key|cookie/i.test(k) ? `(${v.length}文字)` : v.slice(0, 200);
  const isLocked = await locked();
  const tokenOk = !isLocked && !!want && !!got && await sameSecret(got, want);
  if (!isLocked && want && !tokenOk) await onFail();
  const info = { method: req.method, path: url.pathname, query: url.search ? "(あり)" : "", headers, tokenLen: got.length, tokenOk, body: raw.slice(0, 1500) };

  let reply;
  if (!want) reply = "サーバー設定エラー: 合言葉(PASSCODE)が設定されていません。";
  else if (isLocked) reply = "合言葉の間違いが多すぎるため、今日は受け付けを止めています。";
  else if (!tokenOk) {
    reply = got
      ? `トークンが違います(受け取った長さ${got.length}文字、正しくは${want.length}文字)。Even アプリのトークン欄を確認してください。`
      : "トークンが届いていません。Even アプリのトークン欄に合言葉を入れてください。";
  } else {
    try { reply = await answer(lastUserText(body), env); }
    catch (e) { reply = "エラーで記録できませんでした: " + String((e && e.message) || e).slice(0, 120); }
  }
  info.reply = reply;
  await logAgent(env, info);
  return agentResponse(reply, body);
}

function lastUserText(body) {
  const msgs = Array.isArray(body && body.messages) ? body.messages : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (!m || m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.map(p => (typeof p === "string" ? p : p && p.text) || "").join(" ");
  }
  if (typeof body.prompt === "string") return body.prompt;
  if (typeof body.input === "string") return body.input;
  return "";
}

// OpenAI 互換(chat.completion)の形で返す。stream:true なら SSE で返す
function agentResponse(content, body) {
  const id = "chatcmpl-" + crypto.randomUUID();
  const created = Math.floor(Date.now() / 1000);
  const model = (body && body.model) || "car-maintenance";
  if (body && body.stream === true) {
    const chunk = { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] };
    const end = { id, object: "chat.completion.chunk", created, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
    const sse = "data: " + JSON.stringify(chunk) + "\n\n" + "data: " + JSON.stringify(end) + "\n\n" + "data: [DONE]\n\n";
    return new Response(sse, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" } });
  }
  return new Response(JSON.stringify({
    id, object: "chat.completion", created, model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

// 全角→半角、数字の間のカンマ・空白を除去
function normalize(t) {
  return String(t || "")
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ｋＫ]/g, "k").replace(/[ｍＭ]/g, "m").replace(/[．]/g, ".")
    .replace(/(\d)[,，、\s](?=\d{3}(\D|$))/g, "$1")
    .trim();
}

const KD = { "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
const KU = { "十": 10, "百": 100, "千": 1000 };
function numFromToken(tok) {
  if (/^\d+(\.\d+)?$/.test(tok)) return Math.round(parseFloat(tok));
  let total = 0, section = 0, num = 0, digitRun = "";
  const flushRun = () => { if (digitRun) { num = parseFloat(digitRun); digitRun = ""; } };
  for (const ch of tok) {
    if (/[\d.]/.test(ch)) { digitRun += ch; continue; }
    if (ch in KD) { flushRun(); num = num * 10 + KD[ch]; continue; }
    flushRun();
    if (ch in KU) { section += (num || 1) * KU[ch]; num = 0; continue; }
    if (ch === "万") { total += (section + num) * 10000; section = 0; num = 0; continue; }
  }
  flushRun();
  const v = Math.round(total + section + num);
  return isFinite(v) ? v : null;
}

export function extractNumber(t) {
  const N = "[\\d.〇零一二三四五六七八九十百千万]+";
  const withUnit = t.match(new RegExp("(" + N + ")\\s*(?:km|キロ|きろ|ｷﾛ|kilo)", "i"));
  if (withUnit) return numFromToken(withUnit[1]);
  const toks = t.match(new RegExp(N, "g")) || [];
  const arabic = toks.find(x => /\d/.test(x));
  if (arabic) return numFromToken(arabic);
  const kanji = toks.filter(x => /[十百千万]/.test(x) || x.length >= 2).sort((a, b) => b.length - a.length)[0];
  return kanji ? numFromToken(kanji) : null;
}

// ---- データベース ----
async function getSet(env) {
  const r = await env.DB.prepare("SELECT v FROM settings WHERE k = 'set'").first();
  try { return Object.assign({ ...DEFAULT_SET }, r ? JSON.parse(r.v) : {}); } catch (e) { return { ...DEFAULT_SET }; }
}
async function latestKm(env) { return env.DB.prepare("SELECT id, date, odo FROM km ORDER BY date DESC LIMIT 1").first(); }
async function lastOf(env, table) { return env.DB.prepare(`SELECT date, odo FROM ${table} ORDER BY date DESC LIMIT 1`).first(); }

async function statusLine(env, title, table, limKm, limMo, cur) {
  const last = await lastOf(env, table);
  if (!last) return "";
  const used = Math.max(0, (cur ? cur.odo : 0) - last.odo);
  const remKm = limKm - used;
  const remMo = limMo - (Date.now() - new Date(last.date).getTime()) / (86400000 * 30.4);
  if (remKm <= 0 || remMo <= 0) return `${title}交換の時期を過ぎています。`;
  if (remKm <= limKm * 0.1 || remMo <= 1) return `${title}交換まであと${fmt(Math.max(0, remKm))}km。`;
  return "";
}
async function warnings(env) {
  const set = await getSet(env), cur = await latestKm(env);
  return (await statusLine(env, "オイル", "oil", set.oilKm, set.oilMo, cur)) + (await statusLine(env, "タイヤ", "tire", set.tireKm, set.tireMo, cur));
}

async function answer(raw, env) {
  let t = normalize(raw);
  const orig = t;
  if (!t) return "走行距離を教えてください。例:今日の走行距離は85キロ";

  // 日付
  let offset = 0, dayWord = "今日";
  if (/一昨日|おととい/.test(t)) { offset = -2; dayWord = "おととい"; }
  else if (/昨日|きのう/.test(t)) { offset = -1; dayWord = "昨日"; }
  t = t.replace(/一昨日|おととい|昨日|きのう|今日|きょう|本日/g, " ");
  const date = todayJST(offset);

  // 取り消し
  if (/取り?消|キャンセル/.test(t) || (t.length <= 15 && /間違|まちが|やり直|削除/.test(t))) return await undo(env);

  const n = extractNumber(t);
  const hasKmHint = /km|キロ|きろ|メーター|めーたー|走行|走った|走って|ODO|オド|トータル|累計/i.test(t);

  // 車の状況の問い合わせ
  if (n == null && /走行距離|総走行|メーター|何キロ走|なんキロ走|車の状況|(オイル|タイヤ).*(時期|状況|いつ|どう)/.test(t)) return await report(env);

  // 距離の記録でなければ Claude に任せる(天気・一般的な質問・相談など)
  if (n == null || !hasKmHint) return await askClaude(orig, env);
  if (n <= 0) return "0キロより大きい数字で教えてください。";

  const base = await env.DB.prepare("SELECT date, odo FROM km WHERE date < ? ORDER BY date DESC LIMIT 1").bind(date).first();
  // 「メーター」「総」などの言葉があるか、1日では走れない大きな数字なら総走行距離として扱う
  const isTotal = /メーター|めーたー|総|ODO|オド|トータル|累計|合計/i.test(t) || n > 3000;

  let odo, msg;
  if (isTotal) {
    odo = n;
    if (base && odo < base.odo) return `${fmt(odo)}kmは前回(${md(base.date)}の${fmt(base.odo)}km)より小さいので記録しませんでした。`;
    const diff = base ? odo - base.odo : null;
    msg = `${dayWord}のメーター${fmt(odo)}kmを記録しました。` + (diff != null ? `前回から${fmt(diff)}km。` : "");
  } else {
    if (!base) return "前日までの記録がないので、最初はメーターの総走行距離を教えてください。例:メーターは12万3456キロ";
    odo = base.odo + n;
    const gap = Math.round((new Date(date) - new Date(base.date)) / 86400000);
    msg = `${dayWord}の走行${fmt(n)}kmを記録しました。メーター${fmt(odo)}km。`;
    if (gap > 1) msg += `(前回記録の${md(base.date)}からの距離として計算)`;
  }

  const prevSame = await env.DB.prepare("SELECT id, date, odo FROM km WHERE date = ?").bind(date).first();
  const lastVoice = { date, prev: prevSame || null, at: Date.now() };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO km (id, date, odo) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET odo = excluded.odo, id = excluded.id").bind(String(Date.now()), date, odo),
    env.DB.prepare("INSERT INTO settings (k, v) VALUES ('lastVoice', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(lastVoice)),
  ]);
  return msg + await warnings(env);
}

async function undo(env) {
  const r = await env.DB.prepare("SELECT v FROM settings WHERE k = 'lastVoice'").first();
  let lv = null; try { lv = r ? JSON.parse(r.v) : null; } catch (e) {}
  if (!lv || Date.now() - lv.at > 24 * 3600 * 1000) return "取り消せる音声の記録がありません。";
  const ops = [env.DB.prepare("DELETE FROM km WHERE date = ?").bind(lv.date), env.DB.prepare("DELETE FROM settings WHERE k = 'lastVoice'")];
  if (lv.prev) ops.push(env.DB.prepare("INSERT INTO km (id, date, odo) VALUES (?, ?, ?)").bind(String(lv.prev.id || "k" + lv.prev.date), lv.prev.date, lv.prev.odo));
  await env.DB.batch(ops);
  return `${md(lv.date)}の音声記録を取り消しました。`;
}

async function report(env) {
  const rows = (await env.DB.prepare("SELECT date, odo FROM km ORDER BY date DESC LIMIT 2").all()).results;
  if (!rows.length) return "まだ記録がありません。";
  const [last, prev] = rows;
  let msg = `メーターは${fmt(last.odo)}km(${md(last.date)})。`;
  if (prev) msg += `前回から${fmt(last.odo - prev.odo)}km。`;
  return msg + ((await warnings(env)) || "オイル・タイヤは問題なし。");
}

// 距離の記録以外の発話は Claude に答えてもらう(メガネ表示向けに短く)
async function askClaude(text, env) {
  if (!env.ANTHROPIC_API_KEY) return "走行距離の記録用です。普通の質問に答えるには、Cloudflareに ANTHROPIC_API_KEY を設定してください。";
  const system =
    "あなたはスマートグラスEven G2に表示される音声アシスタントです。今日は" + todayJST() + "(日本時間)です。" +
    "利用者は日本在住です。日本語で、1〜2文・100文字程度で結論から答えてください。" +
    "記号、箇条書き、マークダウン、URL、出典表記は使わないでください。" +
    "天気や最新情報はウェブ検索で調べてください。天気で場所の指定がなければ、地名を付けてもう一度聞いてほしいと答えてください。" +
    "音声の聞き取りミスらしい言葉は、文脈から自然に解釈してください。";
  const client = new Anthropic({ apiKey: String(env.ANTHROPIC_API_KEY).replace(/\s+/g, ""), timeout: 20000, maxRetries: 1 });
  try {
    const messages = [{ role: "user", content: text }];
    let msg = null;
    // 検索の途中で一時停止(pause_turn)したら、続きを最大3回まで促す
    for (let i = 0; i < 4; i++) {
      msg = await client.messages.create({
        model: env.CHAT_MODEL || "claude-haiku-5-5",
        max_tokens: 1500,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2, user_location: { type: "approximate", country: "JP", timezone: "Asia/Tokyo" } }],
        messages,
      });
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content });
    }
    // 最後のまとまった文章だけを使う(検索前の「調べます」などは除く)
    const out = msg.content.filter(b => b.type === "text").map(b => b.text).join("").replace(/[*#`>_~]/g, "").replace(/\s+/g, " ").trim();
    if (!out) return "うまく答えられませんでした。(返答が空: " + (msg.stop_reason || "?") + ")";
    return out.length > 300 ? out.slice(0, 300) + "…" : out;
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionTimeoutError) return "時間がかかって答えられませんでした。もう一度お試しください。";
    if (e instanceof Anthropic.APIError) return "うまく答えられませんでした。(エラー " + (e.status || "通信") + ")";
    return "うまく答えられませんでした。(" + String((e && e.message) || e).slice(0, 80) + ")";
  }
}
