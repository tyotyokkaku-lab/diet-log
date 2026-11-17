// ふたりのシフトを Firebase（Firestore）で自動同期する
// rooms/{合言葉} の1つのドキュメントに、日にちごとの予定を入れる。
// 同じ日を両方が変えたときは、更新時刻 u が新しい方を使う。
import { FIREBASE_CONFIG } from "./firebase-config.js?v=2026-11-17t";

export const syncConfigured = !!(FIREBASE_CONFIG && FIREBASE_CONFIG.projectId);

let fb = null, db = null, ref = null, unsub = null;
let remote = null; // 最後に受け取ったサーバー側の内容

async function loadFirebase() {
  if (fb) return fb;
  fb = await import("../vendor/firebase-firestore-13.4.0.js");
  const app = fb.initializeApp(FIREBASE_CONFIG);
  db = fb.getFirestore(app);
  return fb;
}

export function stopSync() {
  if (unsub) unsub();
  unsub = null; ref = null; remote = null;
}

// onRemote(data): サーバーの内容が届いたとき。onStatus(text, ok): 状態の表示
export async function startSync(room, { onRemote, onStatus }) {
  stopSync();
  onStatus("接続中…", false);
  try { await loadFirebase(); }
  catch (e) { onStatus("同期の準備に失敗しました：" + e.message, false); return; }
  ref = fb.doc(db, "rooms", room);
  const myRef = ref;
  unsub = fb.onSnapshot(myRef, { includeMetadataChanges: true }, (snap) => {
    if (ref !== myRef) return;
    // サーバーから届いた内容だけを正とする（スマホに残っていた古い内容で上書きしないように）
    if (!snap.metadata.fromCache) {
      remote = snap.data() || {};
      onRemote(remote);
    }
    onStatus(snap.metadata.fromCache ? "オフライン（つながったら送ります）" : "自動で同期中", !snap.metadata.fromCache);
  }, (err) => {
    onStatus("同期できません：" + (err.code === "permission-denied" ? "Firebaseのルールを確認してください" : err.message), false);
  });
}

// ローカルの内容のうち、サーバーより新しいものだけを送る
export function pushDiff(state, people) {
  if (!ref || remote === null) return;
  const patch = {};
  const put = (path, v) => {
    let o = patch;
    for (const k of path.slice(0, -1)) o = o[k] ||= {};
    o[path[path.length - 1]] = v;
  };
  for (const kind of ["shifts", "avail", "types"]) {
    for (const p of people) {
      for (const [date, e] of Object.entries(state[kind][p] || {})) {
        const r = remote[kind]?.[p]?.[date];
        if (!r || (e.u || 0) > (r.u || 0)) put([kind, p, date], e);
      }
    }
  }
  for (const [label, c] of Object.entries(state.labelColors || {})) {
    if (remote.labelColors?.[label] !== c) put(["labelColors", label], c);
  }
  for (const p of people) {
    // 初期値の「彼氏」「彼女」のままなら送らない（相手が付けた名前を消さないように）
    const def = p === "him" ? "彼氏" : "彼女";
    if (state.names[p] && state.names[p] !== def && remote.names?.[p] !== state.names[p]) put(["names", p], state.names[p]);
  }
  if (!Object.keys(patch).length) return;
  // 送った内容を覚えておく（同じものを何度も送らないように）
  const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !("u" in v) ? merge(a[k] || {}, v) : v; return a; };
  merge(remote, JSON.parse(JSON.stringify(patch)));
  fb.setDoc(ref, { ...patch, updatedAt: fb.serverTimestamp() }, { merge: true }).catch(() => {});
}
