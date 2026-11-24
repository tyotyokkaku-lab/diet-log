# 食事ログ

1日の目標カロリーとPFCバランスに沿って、食べたものを記録するスマホ向けWebアプリ。

- 食べたものを文字で入力 → マイ辞書にあればその値、なければClaude APIで推定
- 推定値は確認・修正してから記録。記録したメニューはマイ辞書に1人前の値で登録される
- 記録・APIキーはブラウザのlocalStorageにだけ保存（サーバーなし）
- 栄養の数値は目安

`vendor/anthropic-sdk-1.3.0.js` は `@anthropic-ai/sdk@1.3.0` を esbuild でブラウザ向けに1ファイルにまとめたもの。

---

# ふたりのシフト（`shift/`）

彼氏・彼女のシフトを1つのカレンダーで見比べて、会える日を相談するスマホ向けWebアプリ。`shift/index.html` を開く。

- **彼氏タブ／彼女タブ**：それぞれのシフトカレンダー。シフト表や他のカレンダーのスクショを選ぶと、Claude APIが読み取って日ごとに入れる（入れる前に確認・取捨選択できる）。日にちをタップすると手で修正できる
- **シフトの種類**：それぞれのカレンダーの下に、入っているシフト名（遅番など）が色付きで並ぶ。タップで名前・色・時間を変えられ（入っている日にもまとめて反映）、日にちを入れるときにボタンで選べる
- **ふたりタブ**：1日1行のリスト。左に彼氏、真ん中にすき間、右に彼女の予定。2人とも「休み」の日は真ん中が薄いピンクになる。それぞれ○（行ける）✕（無理）を選べて、2人とも○なら真ん中に♡。○✕も共有リンクで相手に送られる。ふたりタブではシフトは変更できない（見るだけ）
- 開いたときに `version.txt` を見て、古いページなら自動で読み込み直す（バージョンを上げるときは `APP_VERSION`・`index.html` と `app.js`・`sync.js` の import の `?v=`・`version.txt` を揃える）
- APIキーは設定画面で入力。同じサイトの食事ログに入れたキーがあればそれも使う
- **自動同期**：`shift/firebase-config.js` に Firebase の設定を入れると、設定画面の「自動で同期する」が使えるようになる。片方が合言葉を作って相手に送り、同じ合言葉を入れたふたりのアプリが Firestore の `rooms/{合言葉}` を通して自動で同じ内容になる（日にちごとに新しい方を使う）。Firestore のルールは `shift/firestore.rules`
- `vendor/firebase-firestore-13.4.0.js` は `firebase@13.4.0` の app と firestore を esbuild でブラウザ向けに1ファイルにまとめたもの（同期を使うときだけ読み込む）

---

# 麻雀 待ち牌判定（`mahjong/`）

13枚の手牌から待ち牌（あがり牌）を表示するスマホ向けWebアプリ。`mahjong/index.html` を開く。

- 牌の絵のボタンをタップして手牌に入れる（押した順に並び、「並び替え」で整列、手牌の牌をタップで外す、「消す」で全部消す）
- 13枚で待ち牌と残り枚数を表示。待ち牌をタップすると和了形を表示。通常形・七対子・国士無双に対応
- 14枚のときは、和了形か、どれを切るとテンパイになるかを表示
- 写真（カメラ／カメラロール）から牌を読み取って手牌に並べる（Claude API）。APIキーは画面下の「設定」で入力。同じサイトの食事ログ・シフトに入れたキーがあればそれも使う
- 牌の絵とアイコン（`icon.svg`、PNGはそこから書き出し）はSVGで自作
- 開いたときに `version.txt` を見て、古いページなら自動で読み込み直す（バージョンを上げるときは `app.js` の `APP_VERSION`・`index.html` の `?v=`・`version.txt` を揃える）。バージョンは「設定」に表示

---

# 社用車メンテナンス（`car/`）

社用車の走行距離・オイル交換・タイヤ交換を記録するスマホ向けWebアプリ（PWA）。`car/index.html` を開き、iPhoneのSafariで「ホーム画面に追加」すると独立したアプリとして起動する。

- **段階A（今）**：サーバーなし。データはその端末のブラウザ内（IndexedDB）にだけ保存。メーター写真の読み取りはまだなし（手入力）
- 旧アプリ（Claudeのチャット内のもの）の「データをコピー」で出したJSON `{km, oil, tire, set}` を「バックアップ・引っ越し」に貼り付けて取り込む
- Service Worker（`car/sw.js`）でオフラインでも開ける。ネットにつながるときは常に最新を取りに行く。中身を変えたら `sw.js` の `CACHE`・`app.js` の `APP_VERSION`・`index.html` の `?v=` を揃えて上げる
- **アイコン**：`car/icon-1024.png` を差し替えてGitHubに上げると、GitHub Actions（`.github/workflows/car-icons.yml`）が `icon-180/192/512.png` を作り直してコミットする。手元で作るときは `python car/tools/make_icons.py`（Pillowが必要）

## 段階B：サーバー（`worker/`）

Cloudflare Workers + D1（無料枠）。`car/` の画面の「サーバー連携」にURLと合言葉を入れると、記録がサーバーに保存され、スマホとパソコンで同じデータが見られる。写真からのメーター読み取りもサーバー経由（Claude Haiku 5.5）。

- 秘密の値は Cloudflare のシークレットに置く（コード・Gitには入れない）：`PASSCODE`（合言葉）、`ANTHROPIC_API_KEY`
- 普通の設定は `worker/wrangler.toml` の `[vars]`：`ALLOWED_ORIGIN`、`MODEL`（精度が足りなければ `claude-sonnet-5-5`）、`READ_LIMIT_PER_DAY`
- テーブルは `worker/schema.sql`。動作確認は `cd worker && node test/smoke.mjs`
- すべてのAPIは `Authorization: Bearer <合言葉>` が必要。合言葉の間違いが1日50回を超えるとその日は止まる

### API

| | |
|---|---|
| `POST /api/odometer` | 走行距離を1件登録。`{"date":"2026-11-22","odo":159333}`（`date` を省くと今日・日本時間）。前回より小さいと 409 `{needConfirm:true}`、そのまま記録するなら `"force":true` を付ける。1,500km以上増えたときは `warning` が返る |
| `GET /api/odometer/latest` | 最新の記録 |
| `DELETE /api/odometer/<日付>` | その日の記録を削除 |
| `POST /api/odometer/bulk` | `{rows:[{date,odo}]}` をまとめて追加（既存の日付は上書きしない） |
| `POST /api/oil` ・ `POST /api/tire` | 交換記録を追加 / `DELETE /api/oil/<id>` ・ `DELETE /api/tire/<id>` |
| `PUT /api/settings` | 交換の目安 `{oilKm, oilMo, tireKm, tireMo}` |
| `GET /api/data` ・ `PUT /api/data` | 全データ `{km, oil, tire, set}` の読み出し・置き換え |
| `POST /api/read-meter` | `{image: "data:image/jpeg;base64,..."}` → `{odometer, confidence, prev}` |

### Even G2（音声）

Even アプリの Add Agent に、URL `https://car-maint-api.tyotyokkaku.workers.dev/` とトークン（合言葉）を設定する。`POST /`・`/agent`・`…/chat/completions` に OpenAI 互換の形で届いた発話を `worker/src/agent.js` が処理し、必ず200で「メガネに表示する文章」を返す。

- 「今日の走行距離は85キロ」（前回の記録に足す）、「メーターは12万3456キロ」（総走行距離）、「昨日／おととい」にも対応
- 「取り消し」で直前の音声記録を戻す。「車の状況は？」でメーターとオイル・タイヤの時期を答える
- 距離と関係ない発話は Claude（ウェブ検索つき）が短く答える
- 届いた問い合わせは直近50件を `GET /api/debug` で見られる（合言葉そのものは残さない）

APIで直接送る場合の例：

```
curl -X POST https://<サーバー>/api/odometer \
  -H "Authorization: Bearer <合言葉>" -H "Content-Type: application/json" \
  -d '{"odo":159333}'
```

---

# 内税計算（`tax/`）

税込の金額から、含まれている消費税（内税）と税抜の金額を出すスマホ向けWebアプリ。`tax/index.html` を開く。

- 金額と税率を入れると、その場で「内税」と「税抜（金額−内税）」を表示。内税の端数は切り捨て
- 税率は 10% / 8%（軽減）のボタンでも切り替えられる。最後に入れた金額・税率は覚えておく
- 全角数字やカンマ付き（例：１，０８０）でも計算できる
- ダブルタップで拡大しない。ページ全体は固定で、タブの上の部分だけがスクロールする（下に引っ張っても上に余白が出ない）
- **現場計算タブ**：発泡スチロールの体積（㎥）を入れると、処分費（3,500円/㎥）＋運搬費（5,000円/台）の税込合計と、領収書に書く税抜金額・消費税額（合計から内税で計算、端数切り捨て）を表示
  - 体積は −／＋ で0.5㎥ずつ変えられる（直接入力も可）
  - 台数は「体積 ÷ 満車10㎥」の切り上げで自動。−／＋で変えられ、体積を入れ直すと自動に戻る
  - 単価・運搬費・満車の㎥・税率は「単価を変える」で変更でき、その端末に保存される
- アイコンは `icon.svg`（PNGはそこから書き出し）
