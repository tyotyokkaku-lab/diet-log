-- 社用車メンテナンスのデータベース(Cloudflare D1)
CREATE TABLE IF NOT EXISTS km (
  date TEXT PRIMARY KEY,      -- YYYY-MM-DD(1日1件)
  odo  INTEGER NOT NULL,      -- 総走行距離 km
  id   TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oil (
  id   TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  odo  INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS tire (
  id   TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  odo  INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
-- 1日ごとの回数(写真読み取り・合言葉の間違い)
CREATE TABLE IF NOT EXISTS counters (k TEXT PRIMARY KEY, n INTEGER NOT NULL);
-- Even G2 からの問い合わせの記録(直近50件。合言葉そのものは保存しない)
CREATE TABLE IF NOT EXISTS agentlog (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, info TEXT NOT NULL);
-- 安全管理の記録(点呼・日常点検・業務記録・事故など)。中身はJSON。サーバーが初めて使うときにも自動で作る
CREATE TABLE IF NOT EXISTS safety (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (kind, id));
