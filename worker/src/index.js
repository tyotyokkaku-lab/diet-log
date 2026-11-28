// 社用車メンテナンス 段階B のサーバー(Cloudflare Workers + D1)
//
// 秘密の値は Cloudflare の「シークレット」に入れる(コードには書かない):
//   PASSCODE          … アプリ・グラスから使う合言葉
//   ANTHROPIC_API_KEY … 写真読み取りに使う Anthropic の API キー
// 普通の設定値は wrangler.toml の [vars]:
//   ALLOWED_ORIGIN … 画面を置いているサイト(CORS)
//   MODEL          … 写真読み取りに使う Claude のモデル
//   READ_LIMIT_PER_DAY … 1日に写真読み取りできる回数の上限(使いすぎ防止)

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { agentEntry, isAgentPath } from "./agent.js";

const DEFAULT_SET = { oilKm: 5000, oilMo: 6, tireKm: 40000, tireMo: 36 };
const MAX_FAILS_PER_DAY = 50; // 合言葉の間違いがこれを超えた日は、その日いっぱい受け付けない
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- 共通 ----------
class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
function corsHeaders(env, req) {
  const origin = req.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function json(data, status, env, req) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(env, req) },
  });
}
function todayJST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function validDate(s) {
  if (!DATE_RE.test(s || "")) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function toOdo(v) {
  const n = typeof v === "string" ? parseInt(v.replace(/[^\d]/g, ""), 10) : Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 9999999) return null;
  return n;
}
const str = (v, max) => String(v == null ? "" : v).slice(0, max || 200);
async function body(req) {
  try { return await req.json(); } catch (e) { throw new HttpError(400, "JSONの形式が正しくありません"); }
}

// ---------- 合言葉 ----------
async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function counter(env, key) {
  const r = await env.DB.prepare("SELECT n FROM counters WHERE k = ?").bind(key).first();
  return r ? r.n : 0;
}
async function bump(env, key) {
  await env.DB.prepare("INSERT INTO counters (k, n) VALUES (?, 1) ON CONFLICT(k) DO UPDATE SET n = n + 1").bind(key).run();
}
async function checkAuth(req, env) {
  if (!env.PASSCODE || env.PASSCODE.length < 8) throw new HttpError(500, "サーバーの合言葉(PASSCODE)が設定されていません");
  const failKey = "fail:" + todayJST();
  if (await counter(env, failKey) >= MAX_FAILS_PER_DAY) throw new HttpError(429, "合言葉の間違いが多すぎるため、今日は受け付けを止めています");
  const m = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m || !(await sameSecret(m[1].trim(), env.PASSCODE))) {
    await bump(env, failKey);
    throw new HttpError(401, "合言葉が違います");
  }
}

// ---------- データ ----------
async function loadAll(env) {
  const [km, oil, tire, set] = await env.DB.batch([
    env.DB.prepare("SELECT id, date, odo FROM km ORDER BY date"),
    env.DB.prepare("SELECT id, date, odo, note FROM oil ORDER BY date"),
    env.DB.prepare("SELECT id, date, odo, type, note FROM tire ORDER BY date"),
    env.DB.prepare("SELECT v FROM settings WHERE k = 'set'"),
  ]);
  let s = { ...DEFAULT_SET };
  try { if (set.results[0]) s = Object.assign(s, JSON.parse(set.results[0].v)); } catch (e) {}
  return { km: km.results, oil: oil.results, tire: tire.results, set: s };
}
function cleanSet(v) {
  const g = (x, d) => { const n = parseInt(x, 10); return Number.isFinite(n) && n >= 1 ? n : d; };
  v = v || {};
  return { oilKm: g(v.oilKm, DEFAULT_SET.oilKm), oilMo: g(v.oilMo, DEFAULT_SET.oilMo), tireKm: g(v.tireKm, DEFAULT_SET.tireKm), tireMo: g(v.tireMo, DEFAULT_SET.tireMo) };
}
// 1文のパラメータは100個まで(D1の制限)なので、行を分けて INSERT する
function chunkedInsert(env, sql, cols, rows) {
  const per = Math.floor(100 / cols.length), out = [];
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const ph = part.map(() => "(" + cols.map(() => "?").join(",") + ")").join(",");
    out.push(env.DB.prepare(sql + " VALUES " + ph).bind(...part.flatMap(r => cols.map(c => r[c]))));
  }
  return out;
}
function cleanKmRows(list) {
  const map = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    const odo = toOdo(r && r.odo);
    if (!r || !validDate(r.date) || odo == null) continue;
    map.set(r.date, { id: str(r.id || "k" + r.date, 64), date: r.date, odo });
  }
  return [...map.values()];
}
function cleanRecRows(list, withType) {
  const out = [];
  for (const r of Array.isArray(list) ? list : []) {
    const odo = toOdo(r && r.odo);
    if (!r || !validDate(r.date) || odo == null) continue;
    const row = { id: str(r.id || crypto.randomUUID(), 64), date: r.date, odo, note: str(r.note) };
    if (withType) row.type = str(r.type, 50);
    out.push(row);
  }
  return out;
}
async function replaceAll(env, d) {
  const km = cleanKmRows(d.km), oil = cleanRecRows(d.oil), tire = cleanRecRows(d.tire, true);
  if (km.length > 20000) throw new HttpError(400, "件数が多すぎます");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM km"),
    env.DB.prepare("DELETE FROM oil"),
    env.DB.prepare("DELETE FROM tire"),
    env.DB.prepare("INSERT INTO settings (k, v) VALUES ('set', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(cleanSet(d.set))),
    ...chunkedInsert(env, "INSERT INTO km (id, date, odo)", ["id", "date", "odo"], km),
    ...chunkedInsert(env, "INSERT INTO oil (id, date, odo, note)", ["id", "date", "odo", "note"], oil),
    ...chunkedInsert(env, "INSERT INTO tire (id, date, odo, type, note)", ["id", "date", "odo", "type", "note"], tire),
  ]);
  return { km: km.length, oil: oil.length, tire: tire.length };
}
async function prevOf(env, date) {
  return env.DB.prepare("SELECT date, odo FROM km WHERE date < ? ORDER BY date DESC LIMIT 1").bind(date).first();
}

// 走行距離を1件登録(アプリとスマートグラスの両方から使う)
async function addOdometer(env, b) {
  const date = b.date == null || b.date === "" ? todayJST() : String(b.date);
  const odo = toOdo(b.odo);
  if (!validDate(date)) throw new HttpError(400, "日付は YYYY-MM-DD の形で送ってください");
  if (odo == null) throw new HttpError(400, "距離(odo)は数字で送ってください");
  const prev = await prevOf(env, date);
  const diff = prev ? odo - prev.odo : null;
  if (prev && diff < 0 && !b.force) {
    throw new HttpError(409, `前回(${prev.date} ${prev.odo.toLocaleString("ja-JP")}km)より小さい値です。このまま記録するなら force: true を付けて送ってください`, { needConfirm: true, prev, date, odo });
  }
  const id = str(b.id || String(Date.now()), 64);
  await env.DB.prepare("INSERT INTO km (id, date, odo) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET odo = excluded.odo, id = excluded.id").bind(id, date, odo).run();
  const warning = prev && diff > 1500 ? `前回から ${diff.toLocaleString("ja-JP")}km 増えています。値を確認してください` : null;
  return { ok: true, id, date, odo, prev, diff, warning };
}

// ---------- 写真からメーターを読む ----------
const MeterResult = z.object({
  odometer: z.number().int().nullable(),
  confidence: z.enum(["high", "low"]),
});
const METER_PROMPT = "この画像は車のメーターパネルです。総走行距離(ODO、単位km)の表示を、左から1桁ずつ慎重に読み取ってください。" +
  "同じ数字が続いていても、実際に見えている桁数ちょうどで答え、桁を足したり省いたりしないでください(多くの車は6桁以下です)。" +
  "トリップメーター(TRIP A/B)や時計、燃料計、外気温の数字は含めないでください。" +
  "odometer には読み取った総走行距離を整数で、読み取れない場合は null を入れてください。少しでも迷った桁があれば confidence を low にしてください。";

async function readMeter(env, b) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(500, "サーバーに Anthropic の APIキーが設定されていません");
  const m = String(b.image || "").match(/^(?:data:(image\/(?:jpeg|png|webp));base64,)?([A-Za-z0-9+/=]+)$/);
  if (!m) throw new HttpError(400, "画像(image)を base64 で送ってください");
  const data = m[2], mediaType = m[1] || "image/jpeg";
  if (data.length > 7_000_000) throw new HttpError(413, "画像が大きすぎます。長辺1920pxに縮小して送ってください");

  const limit = parseInt(env.READ_LIMIT_PER_DAY || "30", 10);
  const useKey = "read:" + todayJST();
  if (await counter(env, useKey) >= limit) throw new HttpError(429, `今日の写真読み取りは上限(${limit}回)に達しました。手入力してください`);
  await bump(env, useKey);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let res;
  try {
    res = await client.messages.parse({
      model: env.MODEL || "claude-haiku-5-5",
      max_tokens: 4000,
      output_config: { format: zodOutputFormat(MeterResult) },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: METER_PROMPT },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new HttpError(502, "Anthropic の APIキーが正しくありません");
    if (e instanceof Anthropic.RateLimitError) throw new HttpError(503, "読み取りが混み合っています。少し待ってからお試しください");
    if (e instanceof Anthropic.APIError) throw new HttpError(502, "読み取りに失敗しました(" + (e.status || "通信エラー") + ")");
    throw e;
  }
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new HttpError(502, "読み取れませんでした。手入力してください");

  let { odometer, confidence } = res.parsed_output;
  // 前回の記録と比べて不自然なら「自信なし」にする
  const date = validDate(b.date) ? b.date : todayJST();
  const prev = await prevOf(env, date);
  if (odometer != null && prev && (odometer < prev.odo || odometer - prev.odo > 1500)) confidence = "low";
  return { odometer, confidence, prev };
}

// ---------- 安全管理(軽貨物の点呼・日常点検・業務記録・事故・指導監督・台帳) ----------
// 記録は種類(kind)ごとに1行1件で、中身はJSONのまま保存する。profile は1件だけ(id = main)
const SAFETY_KINDS = ["tenko", "tenken", "gyomu", "jiko", "shido", "kenshin", "tekisei", "tokubetsu", "koshu", "profile"];
const SAFETY_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFETY_MAX_BYTES = 32000;
let safetyReady = false;
async function ensureSafety(env) {
  if (safetyReady) return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS safety (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (kind, id))").run();
  safetyReady = true;
}
function safetyRow(kind, id, rec) {
  if (!SAFETY_KINDS.includes(kind)) throw new HttpError(400, "記録の種類が正しくありません");
  if (!SAFETY_ID_RE.test(id || "")) throw new HttpError(400, "記録のIDが正しくありません");
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) throw new HttpError(400, "記録の中身はオブジェクトで送ってください");
  const data = JSON.stringify({ ...rec, id });
  if (data.length > SAFETY_MAX_BYTES) throw new HttpError(413, "記録が大きすぎます");
  return { kind, id, data, updated: Date.now() };
}
async function loadSafety(env) {
  await ensureSafety(env);
  const rows = await env.DB.prepare("SELECT kind, data FROM safety ORDER BY kind, id").all();
  const out = { profile: {} };
  for (const k of SAFETY_KINDS) if (k !== "profile") out[k] = [];
  for (const r of rows.results) {
    let d; try { d = JSON.parse(r.data); } catch (e) { continue; }
    if (r.kind === "profile") out.profile = d; else if (out[r.kind]) out[r.kind].push(d);
  }
  return out;
}
// 全件置き換え。D1は1回の呼び出しで使える文の数が少ないので、json_each で1文にまとめて入れる
async function replaceSafety(env, d) {
  await ensureSafety(env);
  if (!d || typeof d !== "object") throw new HttpError(400, "JSONの形式が正しくありません");
  const rows = [];
  for (const k of SAFETY_KINDS) {
    if (k === "profile") { if (d.profile && typeof d.profile === "object" && Object.keys(d.profile).length) rows.push(safetyRow(k, "main", d.profile)); continue; }
    for (const r of Array.isArray(d[k]) ? d[k] : []) rows.push(safetyRow(k, String(r && r.id || ""), r));
  }
  if (rows.length > 50000) throw new HttpError(400, "件数が多すぎます");
  const stmts = [env.DB.prepare("DELETE FROM safety")];
  let part = [], size = 0;
  const flush = () => {
    if (!part.length) return;
    stmts.push(env.DB.prepare("INSERT INTO safety (kind, id, data, updated) SELECT json_extract(value, '$.kind'), json_extract(value, '$.id'), json_extract(value, '$.data'), json_extract(value, '$.updated') FROM json_each(?)").bind(JSON.stringify(part)));
    part = []; size = 0;
  };
  for (const r of rows) { part.push(r); size += r.data.length + 100; if (size > 400000) flush(); }
  flush();
  await env.DB.batch(stmts);
  return rows.length;
}

// ---------- 振り分け ----------
async function route(req, env) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/\/+$/, "");
  const M = req.method;

  if (p === "" || p === "/api") return { ok: true, name: "社用車メンテナンス API" };
  if (!p.startsWith("/api/")) throw new HttpError(404, "見つかりません");
  await checkAuth(req, env);

  if (p === "/api/data" && M === "GET") return loadAll(env);
  if (p === "/api/debug" && M === "GET") {
    const rows = await env.DB.prepare("SELECT at, info FROM agentlog ORDER BY id DESC LIMIT 20").all();
    return rows.results.map(r => ({ at: r.at, ...JSON.parse(r.info) }));
  }
  if (p === "/api/data" && M === "PUT") { const n = await replaceAll(env, await body(req)); return { ok: true, count: n }; }

  if (p === "/api/odometer" && M === "POST") return addOdometer(env, await body(req));
  if (p === "/api/odometer/latest" && M === "GET") {
    const r = await env.DB.prepare("SELECT date, odo FROM km ORDER BY date DESC LIMIT 1").first();
    return { latest: r || null };
  }
  let mt = p.match(/^\/api\/odometer\/(\d{4}-\d{2}-\d{2})$/);
  if (mt && M === "DELETE") { await env.DB.prepare("DELETE FROM km WHERE date = ?").bind(mt[1]).run(); return { ok: true }; }

  // Excelからの取り込み(すでにある日付は上書きしない)
  if (p === "/api/odometer/bulk" && M === "POST") {
    const rows = cleanKmRows((await body(req)).rows);
    if (!rows.length) throw new HttpError(400, "取り込める行がありません");
    const r = await env.DB.batch(chunkedInsert(env, "INSERT OR IGNORE INTO km (id, date, odo)", ["id", "date", "odo"], rows));
    return { ok: true, added: r.reduce((s, x) => s + (x.meta.changes || 0), 0) };
  }

  for (const kind of ["oil", "tire"]) {
    if (p === "/api/" + kind && M === "POST") {
      const [row] = cleanRecRows([await body(req)], kind === "tire");
      if (!row) throw new HttpError(400, "日付と距離を送ってください");
      if (kind === "oil") await env.DB.prepare("INSERT INTO oil (id, date, odo, note) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET date=excluded.date, odo=excluded.odo, note=excluded.note").bind(row.id, row.date, row.odo, row.note).run();
      else await env.DB.prepare("INSERT INTO tire (id, date, odo, type, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET date=excluded.date, odo=excluded.odo, type=excluded.type, note=excluded.note").bind(row.id, row.date, row.odo, row.type, row.note).run();
      return { ok: true, row };
    }
    mt = p.match(new RegExp("^/api/" + kind + "/([^/]+)$"));
    if (mt && M === "DELETE") { await env.DB.prepare(`DELETE FROM ${kind} WHERE id = ?`).bind(decodeURIComponent(mt[1])).run(); return { ok: true }; }
  }

  if (p === "/api/settings" && M === "PUT") {
    const s = cleanSet(await body(req));
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('set', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(s)).run();
    return { ok: true, set: s };
  }

  if (p === "/api/read-meter" && M === "POST") return readMeter(env, await body(req));

  if (p === "/api/safety" && M === "GET") return loadSafety(env);
  if (p === "/api/safety" && M === "PUT") return { ok: true, count: await replaceSafety(env, await body(req)) };
  mt = p.match(/^\/api\/safety\/([a-z]+)\/([^/]+)$/);
  if (mt && (M === "PUT" || M === "DELETE")) {
    await ensureSafety(env);
    const kind = mt[1], id = decodeURIComponent(mt[2]);
    if (M === "DELETE") {
      if (!SAFETY_KINDS.includes(kind)) throw new HttpError(400, "記録の種類が正しくありません");
      await env.DB.prepare("DELETE FROM safety WHERE kind = ? AND id = ?").bind(kind, id).run();
      return { ok: true };
    }
    const row = safetyRow(kind, id, await body(req));
    await env.DB.prepare("INSERT INTO safety (kind, id, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET data = excluded.data, updated = excluded.updated").bind(row.kind, row.id, row.data, row.updated).run();
    return { ok: true };
  }

  throw new HttpError(404, "見つかりません");
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env, req) });
    const url = new URL(req.url);
    // Even G2(Even AI の Add Agent)からの音声入力は POST / などで届く
    if (isAgentPath(req, url.pathname.replace(/\/+$/, ""))) return agentEntry(req, env, url, {
      sameSecret,
      locked: async () => (await counter(env, "fail:" + todayJST())) >= MAX_FAILS_PER_DAY,
      onFail: () => bump(env, "fail:" + todayJST()),
    });
    try {
      return json(await route(req, env), 200, env, req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status, env, req);
      console.error(e);
      return json({ error: "サーバーでエラーが起きました" }, 500, env, req);
    }
  },
};
