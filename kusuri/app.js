// おくすりチェック：処方された薬を「朝・夕・寝る前」ごとにチェックしていく
(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- 薬（お薬手帳の No.1〜8） ----------
  // doses：飲む回数の合計（○日分 × 1日の回数）。null は点鼻薬など、回数で終わらないもの
  const MEDS = [
    { no: 1, name: 'セレスタミン配合錠', generic: 'ベタメタゾン・d-クロルフェニラミン配合錠', look: '白の錠剤（TTS 311）',
      kind: 'pill', amount: '1錠', slots: ['m', 'e'], doses: 30, period: '15日分',
      work: '炎症やアレルギーを抑える薬です。かゆみを抑える薬です。',
      notes: ['服用期間中、飲酒は避けてください。', '自己判断で用量の変更や服用の中止をせず、指示通りに服用してください。', '眠気等が起こることがあるので、車の運転等危険を伴う機械の操作は避けてください。', '予防接種の予定がある場合、お知らせください。', '発熱、のどの痛み、体がだるい、咳、痰等の症状が現れた時は、すぐにお知らせください。', '水痘や麻疹への感染が疑われる場合や感染した場合は、すぐに受診してください。', '光を避けて保存してください。'] },
    { no: 2, name: 'メキタジン錠3mg', generic: 'メキタジン錠', look: '白の錠剤（SW 150）',
      kind: 'pill', amount: '1錠', slots: ['m', 'e'], doses: 30, period: '15日分',
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
      kind: 'nose', amount: '1〜2滴', slots: ['m', 'e'], doses: null, period: '1日2回',
      work: '鼻づまりを改善する薬です。',
      notes: ['急性充血期にのみ使用するか、又は適切な間隔をあけて使用してください。', '使用部位に刺激感等が起こることがあるので、気になる時は相談してください。', '1日2回（1〜2滴）'] },
    { no: 7, name: 'サンベタゾン眼耳鼻科用液0.1%', generic: 'ベタメタゾンリン酸エステルNa点眼点耳点鼻液', look: '無色〜微黄澄明の液（10ml）',
      kind: 'nose', amount: '点鼻', slots: ['m', 'e'], doses: null, period: '1日2回',
      work: '目の炎症を抑える薬です。鼻、耳の炎症やアレルギーを抑える薬です。',
      notes: ['まぶしい、涙が出る、目の異物感等の症状が現れた時は、すぐにお知らせください。', '光を避けて保存してください。', '1日2回'] },
    { no: 8, name: 'フルチカゾン点鼻液50μg', generic: 'フルチカゾンプロピオン酸エステル点鼻液', look: '白の点鼻剤（56噴霧用・2瓶）',
      kind: 'nose', amount: '噴霧', slots: ['m', 'e'], doses: null, period: '医師の指示どおり',
      work: '鼻炎の症状を和らげる薬です。',
      notes: ['よく振ってから使用してください。', '呼吸困難、全身が赤くなる、顔・舌・のど等のはれ、じんま疹等の症状が現れた時は、すぐにお知らせください。', '※薬の説明書に回数の記載がないため、このアプリでは朝・夕にしています。指示が違う場合はそれに合わせてください。'] },
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
  const slotIdx = (id) => SLOTS.findIndex((x) => x.id === id);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

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

  // ---------- 何回飲んだか ----------
  const countTaken = (no, beforeKey) => {
    let n = 0;
    for (const [day, rec] of Object.entries(state.log)) {
      if (beforeKey && day >= beforeKey) continue;
      for (const s of SLOTS) if (rec[`${no}${s.id}`]) n++;
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
        if (!checked) {
          if (stopped && day >= stopped) continue;
          // 1日目は「どこから」より前の時間帯を出さない
          if (day === state.start && slotIdx(s) < slotIdx(state.firstSlot)) continue;
          if (m.doses != null) {
            // その日より前＋その日のこれより前の時間帯で飲んだ回数が合計に達していたら、もう出さない
            const earlier = m.slots.filter((x) => slotIdx(x) < slotIdx(s) && rec[`${m.no}${x}`]).length;
            if (countTaken(m.no, day) + earlier >= m.doses) continue;
          }
        }
        items.push({ med: m, slot: s, key: k, checked, time: rec[k] });
      }
    }
    return items;
  };

  // ---------- 表示 ----------
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const render = () => {
    const today = todayKey();
    $('dateLabel').textContent = label(cur);
    const n = diffDays(state.start, cur) + 1;
    $('dayNo').textContent = cur === today ? `今日・${n}日目` : `${n}日目`;
    $('today').hidden = cur === today;
    $('prev').disabled = cur <= state.start;

    const items = itemsFor(cur);
    const done = items.filter((i) => i.checked).length;
    $('bar').style.width = items.length ? `${(done / items.length) * 100}%` : '0';
    const sum = $('summary');
    sum.classList.toggle('all', items.length > 0 && done === items.length);
    sum.textContent = !items.length ? '' : done === items.length ? `ぜんぶできました（${done}/${items.length}）` : `${done} / ${items.length} できた`;

    const box = $('slots');
    box.innerHTML = '';
    if (!items.length) {
      box.innerHTML = '<p class="empty">この日の薬はありません</p>';
    }
    for (const s of SLOTS) {
      const list = items.filter((i) => i.slot === s.id);
      if (!list.length) continue;
      const pills = list.filter((i) => i.med.kind === 'pill');
      const sec = document.createElement('section');
      sec.className = 'slot';
      const allDone = list.every((i) => i.checked);
      sec.innerHTML = `<div class="slot-head"><h2>${s.label}<small>${s.sub}</small></h2>${allDone ? '' : `<button type="button" class="all-btn">${pills.length && pills.length < list.length && pills.some((i) => !i.checked) ? '飲み薬をまとめて ✓' : 'まとめて ✓'}</button>`}</div><div class="cards"></div>`;
      const cards = sec.querySelector('.cards');
      for (const it of list) {
        const m = it.med;
        const left = m.doses != null ? `あと${Math.max(0, m.doses - countTaken(m.no))}回` : m.period;
        const el = document.createElement('div');
        el.className = `card ${m.kind}${it.checked ? ' done' : ''}`;
        el.innerHTML = `
          <span class="no">${m.no}</span>
          <button type="button" class="what">
            <div class="name">${esc(m.name)}</div>
            <div class="sub">${m.kind === 'nose' ? '鼻にさす・' : ''}${esc(m.amount)}・${esc(left)}${it.checked ? `　<span class="time">✓ ${esc(it.time)}</span>` : ''}</div>
          </button>
          <button type="button" class="chk" aria-label="${esc(m.name)}を${it.checked ? '未チェックに戻す' : 'チェック'}">${CHECK}</button>`;
        el.querySelector('.chk').onclick = () => toggle(it.key);
        el.querySelector('.what').onclick = () => openInfo(m);
        cards.appendChild(el);
      }
      const all = sec.querySelector('.all-btn');
      if (all) all.onclick = () => {
        const target = pills.some((i) => !i.checked) && pills.length < list.length ? pills : list;
        const rec = (state.log[cur] ||= {});
        const t = nowTime();
        for (const i of target) if (!rec[i.key]) rec[i.key] = t;
        save(); render();
      };
      box.appendChild(sec);
    }
    renderHistory();
  };

  const toggle = (k) => {
    const rec = (state.log[cur] ||= {});
    if (rec[k]) delete rec[k];
    else rec[k] = nowTime();
    if (!Object.keys(rec).length) delete state.log[cur];
    save(); render();
  };

  const renderHistory = () => {
    const ol = $('history');
    ol.innerHTML = '';
    const today = todayKey();
    const last = today < state.start ? state.start : today;
    for (let d = last; d >= state.start; d = addDays(d, -1)) {
      const items = itemsFor(d);
      if (!items.length && d !== today) continue;
      const done = items.filter((i) => i.checked).length;
      const pct = items.length ? (done / items.length) * 100 : 0;
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
        <dt>飲み方・使い方</dt><dd>${esc(when)}に ${esc(m.amount)}（${esc(m.period)}）</dd>
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

  render();
})();
