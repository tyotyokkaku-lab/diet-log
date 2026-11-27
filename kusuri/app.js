// おくすりチェック：処方された薬を「朝・夕・寝る前」ごとにチェックしていく
(() => {
  const APP_VERSION = '2026-11-27f';
  const $ = (id) => document.getElementById(id);

  // ---------- 薬（お薬手帳の No.1〜8） ----------
  // doses：飲む回数の合計（○日分 × 1日の回数）。null は点鼻薬など、回数で終わらないもの
  const MEDS = [
    { no: 1, name: 'セレスタミン配合錠', generic: 'ベタメタゾン・d-クロルフェニラミン配合錠', look: '白の錠剤（TTS 311）',
      kind: 'pill', amount: '1錠', slots: ['m', 'e'], doses: 30, period: '15日分',
      work: '炎症やアレルギーを抑える薬です。かゆみを抑える薬です。',
      notes: ['服用期間中、飲酒は避けてください。', '自己判断で用量の変更や服用の中止をせず、指示通りに服用してください。', '眠気等が起こることがあるので、車の運転等危険を伴う機械の操作は避けてください。', '予防接種の予定がある場合、お知らせください。', '発熱、のどの痛み、体がだるい、咳、痰等の症状が現れた時は、すぐにお知らせください。', '水痘や麻疹への感染が疑われる場合や感染した場合は、すぐに受診してください。', '光を避けて保存してください。'] },
    { no: 2, name: 'メキタジン錠3mg', generic: 'メキタジン錠', look: '白の錠剤（SW 150）',
      kind: 'pill', amount: '1錠', slots: ['m', 'e'], doses: 30, period: '15日分', after: 1,
      work: 'かゆみを抑える薬です。鼻炎の症状を和らげる薬です。喘息の発作を予防する薬です。',
      notes: ['服用期間中、飲酒は避けてください。', '眠気等が起こることがあるので、車の運転等危険を伴う機械の操作は避けてください。', '体がだるい、食欲不振、吐き気、嘔吐、皮膚のかゆみ、白目や皮膚が黄色くなる等の症状が現れた時は、すぐにお知らせください。', '光を避けて保存してください。'] },
    { no: 3, name: 'オロパタジン塩酸塩錠5mg', generic: 'オロパタジン塩酸塩錠', look: '淡黄赤の錠剤（KRM 147）',
      kind: 'pill', amount: '2錠', slots: ['b'], doses: 30, period: '30日分',
      work: 'かゆみを抑える薬です。鼻炎の症状を和らげる薬です。',
      notes: ['眠気等が起こることがあるので、車の運転等危険を伴う機械の操作は避けてください。', '体がだるい、食欲不振、吐き気、嘔吐、皮膚のかゆみ、白目や皮膚が黄色くなる等の症状が現れた時は、すぐにお知らせください。'] },
    { no: 4, name: 'クラリスロマイシン錠200mg', generic: 'クラリスロマイシン錠', look: '白の錠剤（200mg）',
      kind: 'pill', amount: '1錠', slots: ['m', 'e'], doses: 20, period: '10日分',
      work: '細菌感染を治療する薬です。',
      notes: ['発熱、のどの痛み、青あざができる、出血がとまりにくい、めまい、体がだるい等の症状が現れた時は、すぐにお知らせください。'] },
    { no: 5, name: 'レバミピド錠100mg', generic: 'レバミピド錠', look: '白の錠剤（MeP 09）',
      kind: 'pill', amount: '1錠', slots: ['m', 'e'], doses: 20, period: '10日分',
      work: '胃の粘膜を保護し、組織を修復する薬です。',
      notes: ['発熱、のどの痛み、青あざができる、出血がとまりにくい等の症状が現れた時は、すぐにお知らせください。'] },
    { no: 6, name: 'プリビナ液0.05%', generic: 'ナファゾリン硝酸塩外用液', look: '無色透明の点鼻液（50ml）',
      kind: 'nose', amount: '1〜2滴', slots: [], perDay: 2, doses: null, period: '1日2回',
      work: '鼻づまりを改善する薬です。',
      notes: ['急性充血期にのみ使用するか、又は適切な間隔をあけて使用してください。', '使用部位に刺激感等が起こることがあるので、気になる時は相談してください。', '1日2回（1〜2滴）'] },
    { no: 7, name: 'サンベタゾン眼耳鼻科用液0.1%', generic: 'ベタメタゾンリン酸エステルNa点眼点耳点鼻液', look: '無色〜微黄澄明の液（10ml）',
      kind: 'nose', amount: '点鼻', slots: [], perDay: 2, doses: null, period: '1日2回',
      work: '目の炎症を抑える薬です。鼻、耳の炎症やアレルギーを抑える薬です。',
      notes: ['まぶしい、涙が出る、目の異物感等の症状が現れた時は、すぐにお知らせください。', '光を避けて保存してください。', '1日2回'] },
    { no: 8, name: 'フルチカゾン点鼻液50μg', generic: 'フルチカゾンプロピオン酸エステル点鼻液', look: '白の点鼻剤（56噴霧用・2瓶）',
      kind: 'nose', amount: '噴霧', slots: [], perDay: 2, doses: null, period: '医師の指示どおり',
      work: '鼻炎の症状を和らげる薬です。',
      notes: ['よく振ってから使用してください。', '呼吸困難、全身が赤くなる、顔・舌・のど等のはれ、じんま疹等の症状が現れた時は、すぐにお知らせください。', '※薬の説明書に回数の記載がないため、このアプリでは1日2回を目安にしています。指示が違う場合はそれに合わせてください。'] },
  ];
  const SLOTS = [
    { id: 'm', label: '朝', sub: '朝食後' },
    { id: 'e', label: '夕', sub: '夕食後' },
    { id: 'b', label: '寝る前', sub: '就寝前' },
  ];

  // ---------- 保存 ----------
  const KEY = 'kusuri.v1';
  const DEFAULT_START = '2026-11-27';
  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)); } catch { state = null; }
  if (!state || typeof state !== 'object') state = {};
  state.start ||= DEFAULT_START;
  state.firstSlot ||= 'e'; // 1日目はどの時間帯から（受け取った日は夕食後から）
  state.log ||= {};      // { '2026-11-27': { '1m': '08:12', ... } }
  state.stopped ||= {};  // { 6: '2026-12-03' } もう使わない点鼻薬（その日から非表示）
  // 点鼻薬は時間帯ではなく、使った時刻のリスト rec['6n'] = ['08:10', '21:30']（または 'skip'）
  // 前の版の rec['6m'] / rec['6e'] を移す
  for (const rec of Object.values(state.log)) {
    for (const no of [6, 7, 8]) {
      const old = ['m', 'e', 'b'].map((x) => rec[`${no}${x}`]).filter(Boolean);
      for (const x of ['m', 'e', 'b']) delete rec[`${no}${x}`];
      if (!old.length || rec[`${no}n`]) continue;
      const times = old.filter((v) => v !== 'skip').sort();
      rec[`${no}n`] = times.length ? times : 'skip';
    }
  }
  const slotIdx = (id) => SLOTS.findIndex((x) => x.id === id);
  // 「1つ前に戻す」用に、変更前の状態を覚えておく（最大30回。アプリを閉じるまで）
  const undoStack = [];
  let lastSaved = JSON.stringify(state);
  const save = () => {
    const now = JSON.stringify(state);
    if (now === lastSaved) return;
    undoStack.push(lastSaved);
    if (undoStack.length > 30) undoStack.shift();
    lastSaved = now;
    try { localStorage.setItem(KEY, now); } catch {}
  };

  // ---------- 日付 ----------
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const W = ['日', '月', '火', '水', '木', '金', '土'];
  const label = (k) => { const d = parse(k); return `${d.getMonth() + 1}月${d.getDate()}日（${W[d.getDay()]}）`; };
  const short = (k) => { const d = parse(k); return `${d.getMonth() + 1}/${d.getDate()}（${W[d.getDay()]}）`; };
  const todayKey = () => keyOf(new Date());
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  let cur = todayKey();
  if (cur < state.start) cur = state.start;

  // rec[k] は飲んだ時刻、または 'skip'（今日はなしでOK）
  const SKIP = 'skip';
  const taken = (v) => !!v && v !== SKIP;

  // ---------- 何回飲んだか ----------
  const countTaken = (no, beforeKey) => {
    let n = 0;
    for (const [day, rec] of Object.entries(state.log)) {
      if (beforeKey && day >= beforeKey) continue;
      for (const s of SLOTS) if (taken(rec[`${no}${s.id}`])) n++;
    }
    return n;
  };
  // その日に出す薬と時間帯の一覧
  const itemsFor = (day) => {
    if (day < state.start) return [];
    const rec = state.log[day] || {};
    const items = [];
    for (const m of MEDS) {
      const stopped = state.stopped[m.no];
      for (const s of m.slots) {
        const k = `${m.no}${s}`;
        const checked = !!rec[k];
        const skipped = rec[k] === SKIP;
        if (!checked) {
          if (stopped && day >= stopped) continue;
          // 1日目は「どこから」より前の時間帯を出さない
          if (day === state.start && slotIdx(s) < slotIdx(state.firstSlot)) continue;
          if (m.doses != null) {
            // その日より前＋その日のこれより前の時間帯で飲んだ回数が合計に達していたら、もう出さない
            const earlier = m.slots.filter((x) => slotIdx(x) < slotIdx(s) && taken(rec[`${m.no}${x}`])).length;
            if (countTaken(m.no, day) + earlier >= m.doses) continue;
          }
          // after の薬を飲み終わるまでは出さない（その次の時間帯から）
          if (m.after) {
            const a = MEDS.find((x) => x.no === m.after);
            const aEarlier = a.slots.filter((x) => slotIdx(x) < slotIdx(s) && taken(rec[`${a.no}${x}`])).length;
            if (countTaken(a.no, day) + aEarlier < a.doses) continue;
          }
        }
        items.push({ med: m, slot: s, key: k, checked, skipped, time: rec[k] });
      }
    }
    return items;
  };

  // その日の点鼻薬
  const noseFor = (day) => {
    if (day < state.start) return [];
    const rec = state.log[day] || {};
    const out = [];
    for (const m of MEDS) {
      if (m.kind !== 'nose') continue;
      const v = rec[`${m.no}n`];
      const stopped = state.stopped[m.no];
      if (!v && stopped && day >= stopped) continue;
      out.push({ med: m, key: `${m.no}n`, skipped: v === SKIP, times: Array.isArray(v) ? v : [] });
    }
    return out;
  };
  // 進み具合：飲み薬は1回ずつ、点鼻薬は1日の目安の回数ぶん
  const dayStats = (day) => {
    const pills = itemsFor(day), nose = noseFor(day);
    let total = pills.length, done = pills.filter((i) => i.checked).length;
    let skip = pills.filter((i) => i.skipped).length;
    for (const n of nose) {
      total += n.med.perDay;
      done += n.skipped ? n.med.perDay : Math.min(n.times.length, n.med.perDay);
      if (n.skipped) skip++;
    }
    return { pills, nose, total, done, skip };
  };

  // ---------- 表示 ----------
  const SKIPMARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 12h12"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let render = () => {
    const today = todayKey();
    $('dateLabel').textContent = label(cur);
    const n = diffDays(state.start, cur) + 1;
    $('dayNo').textContent = cur === today ? `今日・${n}日目` : `${n}日目`;
    $('today').hidden = cur === today;
    $('prev').disabled = cur <= state.start;

    const st = dayStats(cur);
    const items = st.pills;
    const { total, done } = st;
    $('bar').style.width = total ? `${(done / total) * 100}%` : '0';
    const sum = $('summary');
    sum.classList.toggle('all', total > 0 && done === total);
    const skipNote = st.skip ? `・なし ${st.skip}` : '';
    sum.textContent = !total ? '' : done === total ? `ぜんぶできました（${done}/${total}${skipNote}）` : `${done} / ${total} できた${skipNote}`;

    const box = $('slots');
    box.innerHTML = '';
    if (!total) {
      box.innerHTML = '<p class="empty">この日の薬はありません</p>';
    }
    for (const s of SLOTS) {
      const list = items.filter((i) => i.slot === s.id);
      if (!list.length) continue;
      const pills = list.filter((i) => i.med.kind === 'pill');
      const sec = document.createElement('section');
      sec.className = 'slot';
      const allDone = list.every((i) => i.checked);
      sec.innerHTML = `<div class="slot-head"><h2>${s.label}<small>${s.sub}</small></h2>${allDone ? '' : '<button type="button" class="all-btn">まとめて ✓</button>'}</div><div class="cards"></div>`;
      const cards = sec.querySelector('.cards');
      for (const it of list) {
        const m = it.med;
        const left = m.doses != null ? `あと${Math.max(0, m.doses - countTaken(m.no))}回` : m.period;
        const el = document.createElement('div');
        el.className = `card ${m.kind}${it.skipped ? ' skipped' : it.checked ? ' done' : ''}`;
        el.innerHTML = `
          <span class="no">${m.no}</span>
          <button type="button" class="what">
            <div class="name">${esc(m.name)}</div>
            <div class="sub">${esc(m.amount)}・${esc(left)}${it.skipped ? '　<span class="time skip">今日はなし</span>' : it.checked ? `　<span class="time">✓ ${esc(it.time)}</span>` : ''}</div>
          </button>
          ${it.checked ? '' : `<button type="button" class="skip-btn" aria-label="${esc(m.name)}は今日はなし">なし</button>`}
          <button type="button" class="chk" aria-label="${esc(m.name)}を${it.checked ? '未チェックに戻す' : 'チェック'}">${it.skipped ? SKIPMARK : CHECK}</button>`;
        el.querySelector('.chk').onclick = () => toggle(it.key);
        el.querySelector(".skip-btn")?.addEventListener('click', () => setSkip(it.key));
        el.querySelector('.what').onclick = () => openInfo(m);
        cards.appendChild(el);
      }
      const all = sec.querySelector('.all-btn');
      if (all) all.onclick = () => {
        const target = list;
        const rec = (state.log[cur] ||= {});
        const t = nowTime();
        for (const i of target) if (!rec[i.key]) rec[i.key] = t;
        save(); render();
      };
      box.appendChild(sec);
    }
    if (st.nose.length) box.appendChild(renderNose(st.nose));
    renderHistory();
  };

  const toggle = (k) => {
    const rec = (state.log[cur] ||= {});
    if (rec[k]) delete rec[k];
    else rec[k] = nowTime();
    if (!Object.keys(rec).length) delete state.log[cur];
    save(); render();
  };

  const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
  // 点鼻薬は、ほかの点鼻薬を使ってから30分あける
  const GAP_MIN = 30;
  let lockTimer = null;
  const noseUses = () => {
    // 今日と昨日の点鼻薬の使用 [{no, at(Date)}]
    const t = todayKey(), out = [];
    for (const day of [addDays(t, -1), t]) {
      const rec = state.log[day] || {};
      for (const m of MEDS) {
        const v = rec[`${m.no}n`];
        if (!Array.isArray(v)) continue;
        for (const hm of v) {
          const [h, mi] = hm.split(':').map(Number);
          const d = parse(day); d.setHours(h, mi, 0, 0);
          out.push({ no: m.no, name: m.name, at: d });
        }
      }
    }
    return out;
  };
  // その薬が使えるようになる時刻（今すぐ使えるなら null）
  const lockOf = (no) => {
    if (cur !== todayKey()) return null;
    const now = new Date();
    let last = null;
    for (const u of noseUses()) {
      if (u.no === no || u.at > now) continue;
      if (!last || u.at > last.at) last = u;
    }
    if (!last) return null;
    const until = new Date(last.at.getTime() + GAP_MIN * 60000);
    return until > now ? { until, by: last } : null;
  };

  const renderNose = (list) => {
    const sec = document.createElement('section');
    sec.className = 'slot';
    clearTimeout(lockTimer);
    const locks = list.map((it) => lockOf(it.med.no));
    const anyLock = locks.find(Boolean);
    let banner = '';
    if (anyLock) {
      const left = Math.ceil((anyLock.until - new Date()) / 60000);
      const u = anyLock.until;
      banner = `<p class="lock-note">⏱ ${anyLock.by.no} ${esc(anyLock.by.name)}を使ったので、ほかの点鼻薬は <b>${pad(u.getHours())}:${pad(u.getMinutes())}</b> から（あと${left}分）</p>`;
      lockTimer = setTimeout(render, Math.min(30000, u - new Date() + 500));
    }
    sec.innerHTML = `<div class="slot-head"><h2>点鼻薬<small>使ったら＋（時刻はタップで変更）</small></h2></div>${banner}<div class="cards"></div>`;
    const cards = sec.querySelector('.cards');
    for (const it of list) {
      const m = it.med;
      const n = it.times.length;
      const reached = n >= m.perDay;
      const lock = it.skipped ? null : locks[list.indexOf(it)];
      const el = document.createElement('div');
      el.className = `card nose${it.skipped ? ' skipped' : reached ? ' done' : ''}`;
      el.innerHTML = `
        <span class="no">${m.no}</span>
        <button type="button" class="what">
          <div class="name">${esc(m.name)}</div>
          <div class="sub">${esc(m.amount)}・${it.skipped ? '<span class="time skip">今日はなし</span>' : `<span class="${reached ? 'time' : ''}">今日 ${n}/${m.perDay}回</span>`}</div>
        </button>
        ${it.skipped || n ? '' : `<button type="button" class="skip-btn" aria-label="${esc(m.name)}は今日はなし">なし</button>`}
        <button type="button" class="chk add${lock ? ' locked' : ''}"${lock ? ' disabled' : ''} aria-label="${esc(m.name)}を${it.skipped ? '「なし」から戻す' : '使った（今の時刻）'}">${it.skipped ? SKIPMARK : lock ? `<span class="wait">あと<br>${Math.ceil((lock.until - new Date()) / 60000)}分</span>` : PLUS}</button>
        ${n ? `<div class="times">${it.times.map((t, i) => `<span class="tchip"><input type="time" value="${esc(t)}" data-i="${i}" aria-label="${i + 1}回目の時刻"><button type="button" data-del="${i}" aria-label="${i + 1}回目を消す">×</button></span>`).join('')}</div>` : ''}`;
      el.querySelector('.what').onclick = () => openInfo(m);
      el.querySelector('.skip-btn')?.addEventListener('click', () => setSkip(it.key));
      el.querySelector('.chk').onclick = () => {
        if (lockOf(m.no) && !it.skipped) { render(); return; }
        const rec = (state.log[cur] ||= {});
        if (it.skipped) delete rec[it.key];
        else rec[it.key] = [...it.times, nowTime()].sort();
        save(); render();
      };
      el.querySelectorAll('.tchip input').forEach((inp) => {
        inp.onchange = () => {
          if (!inp.value) return;
          const times = [...it.times];
          times[+inp.dataset.i] = inp.value;
          state.log[cur][it.key] = times.sort();
          save(); render();
        };
      });
      el.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = () => {
          const rec = state.log[cur];
          const times = it.times.filter((_, i) => i !== +b.dataset.del);
          if (times.length) rec[it.key] = times; else delete rec[it.key];
          if (!Object.keys(rec).length) delete state.log[cur];
          save(); render();
        };
      });
      cards.appendChild(el);
    }
    return sec;
  };

  const setSkip = (k) => {
    (state.log[cur] ||= {})[k] = SKIP;
    save(); render();
  };

  const renderHistory = () => {
    const ol = $('history');
    ol.innerHTML = '';
    const today = todayKey();
    const last = today < state.start ? state.start : today;
    for (let d = last; d >= state.start; d = addDays(d, -1)) {
      const { total, done } = dayStats(d);
      const items = { length: total };
      if (!total && d !== today) continue;
      const pct = total ? (done / total) * 100 : 0;
      const li = document.createElement('li');
      if (d === cur) li.className = 'cur';
      const past = d < today;
      li.innerHTML = `<button type="button"><span>${short(d)}${d === today ? ' 今日' : ''}</span>
        <span class="hbar${past && done < items.length ? ' miss' : ''}"><i style="width:${pct}%"></i></span>
        <span class="hnum${items.length && done === items.length ? ' ok' : ''}">${items.length && done === items.length ? '✓' : `${done}/${items.length}`}</span></button>`;
      li.querySelector('button').onclick = () => { cur = d; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
      ol.appendChild(li);
    }
  };

  // ---------- 薬の説明 ----------
  const dlg = $('info');
  const openInfo = (m) => {
    const when = m.slots.map((s) => SLOTS.find((x) => x.id === s).sub).join('・');
    $('infoBody').innerHTML = `
      <h3>${m.no}. ${esc(m.name)}</h3>
      <p class="generic">${esc(m.generic)}</p>
      <dl>
        <dt>飲み方・使い方</dt><dd>${m.kind === 'nose' ? `鼻にさす薬・1日${m.perDay}回くらい・${esc(m.amount)}（${esc(m.period)}）` : `${esc(when)}に ${esc(m.amount)}（${esc(m.period)}）`}</dd>
        ${m.after ? `<dt>飲み始め</dt><dd>${m.after} ${esc(MEDS.find((x) => x.no === m.after).name)}を飲み終わってから（終わった次の回から表示されます）</dd>` : ''}
        <dt>見た目</dt><dd>${esc(m.look)}</dd>
        <dt>はたらき</dt><dd>${esc(m.work)}</dd>
        <dt>注意すること</dt><dd><ul>${m.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></dd>
      </dl>`;
    const btn = $('infoDone');
    if (m.kind === 'nose') {
      btn.hidden = false;
      const stopped = state.stopped[m.no];
      btn.textContent = stopped ? 'また使う' : 'もう使わない';
      btn.onclick = () => {
        if (stopped) delete state.stopped[m.no];
        else state.stopped[m.no] = cur;
        save(); dlg.close(); render();
      };
    } else {
      btn.hidden = true;
    }
    dlg.showModal();
  };
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  // ---------- 操作 ----------
  $('prev').onclick = () => { if (cur > state.start) { cur = addDays(cur, -1); render(); } };
  $('next').onclick = () => { cur = addDays(cur, 1); render(); };
  $('today').onclick = () => { cur = todayKey(); if (cur < state.start) cur = state.start; render(); };
  const start = $('start');
  start.value = state.start;
  const first = $('firstSlot');
  first.value = state.firstSlot;
  first.onchange = () => { state.firstSlot = first.value; save(); render(); };
  start.onchange = () => {
    if (!start.value) { start.value = state.start; return; }
    state.start = start.value;
    if (cur < state.start) cur = state.start;
    save(); render();
  };

  // 日付が変わったら今日に合わせる（開きっぱなしのとき）
  let lastToday = todayKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const t = todayKey();
    if (t !== lastToday) { if (cur === lastToday) cur = t; lastToday = t; }
    render();
  });

  // ---------- 1つ前に戻す ----------
  const undoBtn = $('undo');
  const updateUndo = () => { undoBtn.hidden = !undoStack.length; };
  undoBtn.onclick = () => {
    const prev = undoStack.pop();
    if (!prev) return;
    const before = state;
    state = JSON.parse(prev);
    lastSaved = prev;
    try { localStorage.setItem(KEY, prev); } catch {}
    // 変わった日を表示する
    const days = new Set([...Object.keys(before.log), ...Object.keys(state.log)]);
    const changed = [...days].filter((d) => JSON.stringify(before.log[d]) !== JSON.stringify(state.log[d]));
    if (changed.length === 1 && changed[0] !== cur && changed[0] >= state.start) cur = changed[0];
    if (cur < state.start) cur = state.start;
    start.value = state.start;
    first.value = state.firstSlot;
    render();
  };
  const render0 = render;
  render = () => { render0(); updateUndo(); };

  render();

  // 公開中の最新版と違えば、自動で読み込み直す（Safariが古いページを覚えていることがあるため）
  (async () => {
    try {
      const r = await fetch('version.txt?t=' + Date.now(), { cache: 'no-store' });
      const v = (await r.text()).trim();
      if (r.ok && v && v !== APP_VERSION && !sessionStorage.getItem('kusuri.reloaded.' + v)) {
        sessionStorage.setItem('kusuri.reloaded.' + v, '1');
        location.replace(location.pathname + '?v=' + Date.now());
      }
    } catch {}
  })();
  document.getElementById('appVersion').textContent = APP_VERSION;
})();
