// サーバーの動作確認(ローカルのD1で、写真読み取り以外を試す)
// 実行: node test/smoke.mjs   (worker フォルダで)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

// D1 の代わりに Node 内蔵の SQLite を使う簡易版(prepare/bind/first/all/run/batch だけ)
function fakeD1() {
  const sql = new DatabaseSync(":memory:");
  const stmt = (q, args = []) => ({
    bind: (...a) => stmt(q, a),
    _exec() {
      const st = sql.prepare(q);
      if (/^\s*select/i.test(q)) return { results: st.all(...args), meta: {} };
      const r = st.run(...args); return { results: [], meta: { changes: Number(r.changes) } };
    },
    async first() { return this._exec().results[0] || null; },
    async all() { return this._exec(); },
    async run() { return this._exec(); },
  });
  return {
    sql,
    prepare: q => stmt(q),
    async batch(list) {
      sql.exec("BEGIN");
      try { const out = list.map(s => s._exec()); sql.exec("COMMIT"); return out; }
      catch (e) { sql.exec("ROLLBACK"); throw e; }
    },
  };
}

const out = new URL("../.wrangler/smoke/", import.meta.url).pathname;
execSync(`npx wrangler deploy --dry-run --outdir ${out}`, { stdio: "ignore" });
const worker = (await import(out + "index.js")).default;
const DB = fakeD1();
DB.sql.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
const env = { DB, PASSCODE: "test-passcode-123", ALLOWED_ORIGIN: "https://tyotyokkaku-lab.github.io", READ_LIMIT_PER_DAY: "2" };
const mf = { dispatchFetch: (u, init) => worker.fetch(new Request(u, init), env), dispose: async () => {} };

const H = { Authorization: "Bearer test-passcode-123", "Content-Type": "application/json", Origin: "https://tyotyokkaku-lab.github.io" };
let fails = 0;
async function call(method, path, body, headers = H) {
  const r = await mf.dispatchFetch("http://x" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, cors: r.headers.get("access-control-allow-origin"), data: r.status === 204 ? null : await r.json() };
}
function check(name, cond, info) { console.log((cond ? "OK  " : "NG  ") + name + (cond ? "" : "  " + JSON.stringify(info))); if (!cond) fails++; }

let r = await call("GET", "/api/data", null, { Origin: H.Origin });
check("合言葉なしは401", r.status === 401, r);
r = await call("GET", "/api/data", null, { ...H, Authorization: "Bearer wrong" });
check("合言葉違いは401", r.status === 401, r);

const km = []; let odo = 100000;
for (let i = 0; i < 1160; i++) { const d = new Date(Date.UTC(2023, 8, 9) + i * 86400000); odo += 50; km.push({ id: "i" + i, date: d.toISOString().slice(0, 10), odo }); }
r = await call("PUT", "/api/data", { km, oil: [{ id: "o1", date: "2026-06-01", odo: 150000, note: "メモ" }], tire: [{ id: "t1", date: "2025-01-01", odo: 140000, type: "交換(冬タイヤ)" }], set: { oilKm: 4000 } });
check("全件置き換え 1160件", r.status === 200 && r.data.count.km === 1160, r);
check("CORSヘッダー", r.cors === "https://tyotyokkaku-lab.github.io", r.cors);
r = await call("GET", "/api/data");
check("読み出し", r.data.km.length === 1160 && r.data.oil[0].note === "メモ" && r.data.set.oilKm === 4000 && r.data.set.tireKm === 40000, r.data.set);

const last = km[km.length - 1];
const next = new Date(Date.parse(last.date) + 86400000).toISOString().slice(0, 10);
r = await call("POST", "/api/odometer", { date: next, odo: last.odo + 80 });
check("1件登録・差分", r.status === 200 && r.data.diff === 80 && !r.data.warning, r);
r = await call("POST", "/api/odometer", { date: next, odo: last.odo - 5 });
check("前回より小さいと409", r.status === 409 && r.data.needConfirm, r);
r = await call("POST", "/api/odometer", { date: next, odo: last.odo - 5, force: true });
check("force で上書き", r.status === 200 && r.data.odo === last.odo - 5, r);
r = await call("POST", "/api/odometer", { date: next, odo: last.odo + 2000 });
check("1500km超は警告", r.status === 200 && !!r.data.warning, r);
r = await call("POST", "/api/odometer", { odo: "999,999" });
check("日付なしは今日・カンマ付き数字OK", r.status === 200 && r.data.odo === 999999 && /^\d{4}-\d{2}-\d{2}$/.test(r.data.date), r);
r = await call("POST", "/api/odometer", { date: "2026-02-30", odo: 1 });
check("ありえない日付は400", r.status === 400, r);
r = await call("GET", "/api/odometer/latest");
check("最新の取得", r.data.latest && r.data.latest.odo === 999999, r);
r = await call("DELETE", "/api/odometer/" + r.data.latest.date);
check("削除", r.status === 200, r);

r = await call("POST", "/api/odometer/bulk", { rows: [{ date: km[0].date, odo: 1 }, { date: "2020-01-01", odo: 5000 }] });
check("Excel取り込みは既存日付を上書きしない", r.data.added === 1, r);
r = await call("POST", "/api/oil", { date: "2026-11-01", odo: 160000, note: "x" });
check("オイル追加", r.status === 200, r);
r = await call("DELETE", "/api/oil/" + r.data.row.id);
check("オイル削除", r.status === 200, r);
r = await call("PUT", "/api/settings", { oilKm: 6000, oilMo: 0 });
check("設定(不正値は既定に)", r.data.set.oilKm === 6000 && r.data.set.oilMo === 6, r);
r = await call("POST", "/api/read-meter", { image: "abc" });
check("APIキーなしの写真読み取りは500で説明", r.status === 500 && /APIキー/.test(r.data.error), r);
r = await call("OPTIONS", "/api/data", null, { Origin: H.Origin });
check("プリフライト", r.status === 204 || r.status === 200, r);


// ---- 安全管理 ----
r = await call("GET", "/api/safety");
check("安全管理:最初は空", r.status === 200 && Array.isArray(r.data.tenko) && r.data.tenko.length === 0 && typeof r.data.profile === "object", r);
r = await call("PUT", "/api/safety/tenko/t1", { date: "2026-11-28", phase: "乗務前", alcohol: "なし" });
check("安全管理:1件保存", r.status === 200, r);
r = await call("PUT", "/api/safety/profile/main", { driver: "山田" });
check("安全管理:プロフィール保存", r.status === 200, r);
r = await call("PUT", "/api/safety/bad/t1", { a: 1 });
check("安全管理:知らない種類は400", r.status === 400, r);
r = await call("PUT", "/api/safety/tenko/" + encodeURIComponent("a b"), { a: 1 });
check("安全管理:おかしなIDは400", r.status === 400, r);
r = await call("GET", "/api/safety");
check("安全管理:読み出し", r.data.tenko.length === 1 && r.data.tenko[0].id === "t1" && r.data.tenko[0].alcohol === "なし" && r.data.profile.driver === "山田", r.data);
const many = Array.from({ length: 3000 }, (_, i) => ({ id: "g" + i, startAt: "2026-01-01T08:00", waypoints: "あ".repeat(100) }));
r = await call("PUT", "/api/safety", { tenko: [{ id: "t2", date: "2026-11-27" }], gyomu: many, profile: { driver: "佐藤" } });
check("安全管理:全件置き換え 3001件+プロフィール", r.status === 200 && r.data.count === 3002, r);
r = await call("GET", "/api/safety");
check("安全管理:置き換え後", r.data.tenko.length === 1 && r.data.tenko[0].id === "t2" && r.data.gyomu.length === 3000 && r.data.profile.driver === "佐藤", { t: r.data.tenko, g: r.data.gyomu.length });
r = await call("DELETE", "/api/safety/tenko/t2");
r = await call("GET", "/api/safety");
check("安全管理:削除", r.data.tenko.length === 0, r.data.tenko);
r = await call("GET", "/api/safety", null, { Origin: H.Origin });
check("安全管理:合言葉なしは401", r.status === 401, r);

// ---- Even G2(音声) ----
async function say(text, token = "test-passcode-123", extra = {}) {
  const r = await mf.dispatchFetch("http://x/", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ model: "x", messages: [{ role: "user", content: text }], ...extra }) });
  if (extra.stream) return { status: r.status, text: await r.text() };
  const d = await r.json(); return { status: r.status, text: d.choices[0].message.content };
}
await call("PUT", "/api/data", { km: [{ date: "2026-01-01", odo: 150000 }], oil: [], tire: [], set: {} });
r = await say("今日の走行距離は八十五キロ");
check("音声:1日の距離(漢数字)", r.status === 200 && /走行85km/.test(r.text) && /150,085/.test(r.text), r);
r = await say("取り消し");
check("音声:取り消し", /取り消しました/.test(r.text), r);
r = await say("メーターは15万200キロ");
check("音声:総走行距離", /メーター150,200km/.test(r.text) && /前回から200km/.test(r.text), r);
r = await say("メーターは１４９，０００キロ");
check("音声:前回より小さいと記録しない", /記録しませんでした/.test(r.text), r);
r = await say("車の状況は？");
check("音声:状況の報告", /メーターは150,200km/.test(r.text), r);
r = await say("今日の走行距離は10キロ", "wrongpass");
check("音声:合言葉違いでも200で説明", r.status === 200 && /トークンが違います/.test(r.text), r);
r = await say("車の状況は？", "test-passcode-123", { stream: true });
check("音声:stream(SSE)", /data: \[DONE\]/.test(r.text) && /150,200/.test(r.text), r);
r = await mf.dispatchFetch("http://x/v1/chat/completions", { method: "POST", headers: { "x-api-key": "test-passcode-123" }, body: JSON.stringify({ messages: [{ role: "user", content: "車の状況" }] }) });
check("音声:/chat/completions と x-api-key", (await r.json()).choices[0].message.content.includes("150,200"), null);
r = await call("GET", "/api/debug");
check("音声:ログ", Array.isArray(r.data) && r.data.length >= 5 && !JSON.stringify(r.data).includes("test-passcode-123"), r.data.length);

await mf.dispose();
console.log(fails ? `\n${fails}件 NG` : "\nすべてOK");
process.exit(fails ? 1 : 0);
