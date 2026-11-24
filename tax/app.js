// 内税計算 ＋ 現場計算（発泡スチロール処分費・運搬費）
(() => {
  const $ = (id) => document.getElementById(id);

  // 全角数字・カンマも受け付ける
  const toNum = (s) => {
    const t = String(s)
      .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[,，\s円%％㎥]/g, '');
    if (t === '' || !/^\d*\.?\d*$/.test(t) || t === '.') return NaN;
    return Number(t);
  };
  const fmt = (n) => n.toLocaleString('ja-JP');
  // 内税 = 金額 × 税率 ÷ (100 + 税率)、端数切り捨て（小さな誤差で1円ずれないよう少し足す）
  const innerTax = (amount, rate) => Math.floor((amount * rate) / (100 + rate) + 1e-9);

  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  // ---------- タブ ----------
  const tabs = document.querySelectorAll('.tabbar button');
  function show(view) {
    document.querySelectorAll("main.view").forEach((v) => { v.hidden = v.id !== 'view-' + view; });
    tabs.forEach((b) => b.classList.toggle('on', b.dataset.view === view));
    save('tax.view', view);
  }
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  show(load('tax.view') === 'site' ? 'site' : 'tax');

  // ---------- 内税計算 ----------
  {
    const amountEl = $('amount'), rateEl = $('rate'), taxEl = $('tax'), netEl = $('net');
    const chips = document.querySelectorAll('.chips button');
    const calc = () => {
      const amount = toNum(amountEl.value), rate = toNum(rateEl.value);
      chips.forEach((b) => b.classList.toggle('on', Number(b.dataset.rate) === rate));
      if (!Number.isFinite(amount) || !Number.isFinite(rate)) { taxEl.textContent = ''; netEl.textContent = ''; return; }
      const tax = innerTax(amount, rate);
      taxEl.textContent = fmt(tax);
      netEl.textContent = fmt(amount - tax);
    };
    const r = load('tax.rate'); if (r !== null) rateEl.value = r;
    const a = load('tax.amount'); if (a !== null) amountEl.value = a;
    amountEl.addEventListener('input', () => { save('tax.amount', amountEl.value); calc(); });
    rateEl.addEventListener('input', () => { save('tax.rate', rateEl.value); calc(); });
    chips.forEach((b) => b.addEventListener('click', () => { rateEl.value = b.dataset.rate; save('tax.rate', rateEl.value); calc(); }));
    amountEl.addEventListener('focus', () => amountEl.select());
    calc();
  }

  // ---------- 現場計算 ----------
  {
    const DEFAULTS = { unitPrice: '3500', carryPrice: '5000', fullM3: '10', siteRate: '10' };
    const m3El = $('m3'), trucksEl = $('trucks');
    const fields = Object.keys(DEFAULTS).map((k) => [k, $(k)]);
    fields.forEach(([k, el]) => { el.value = load('site.' + k) ?? DEFAULTS[k]; });

    // 台数は自分で変えるまでは「体積 ÷ 満車㎥（切り上げ）」に合わせる
    let trucksTouched = false;

    function calc() {
      const m3 = toNum(m3El.value);
      const unit = toNum($('unitPrice').value) || 0;
      const carry = toNum($('carryPrice').value) || 0;
      const full = toNum($('fullM3').value) || 0;
      const rate = toNum($('siteRate').value) || 0;
      const vol = Number.isFinite(m3) ? m3 : 0;

      const auto = full > 0 && vol > 0 ? Math.ceil(vol / full - 1e-9) : 1;
      if (!trucksTouched) trucksEl.value = String(auto);
      const trucks = Math.max(0, Math.floor(toNum(trucksEl.value) || 0));
      $('truckHint').textContent = full > 0
        ? (trucksTouched && trucks !== auto ? `満車${full}㎥で計算すると ${auto} 台` : `満車${full}㎥で自動計算`)
        : '';

      // 小数の㎥（例 7.5）でも誤差なく掛けるため、0.01㎥単位の整数にしてから計算
      const disposal = Math.floor((Math.round(vol * 100) * unit) / 100);
      const carriage = trucks * carry;
      const total = disposal + carriage;
      const tax = innerTax(total, rate);

      $('dispDetail').textContent = `${vol || 0}㎥ × ${fmt(unit)}円`;
      $('carryDetail').textContent = `${trucks}台 × ${fmt(carry)}円`;
      $('dispAmt').textContent = fmt(disposal);
      $('carryAmt').textContent = fmt(carriage);
      $('total').textContent = fmt(total);
      $('totalNet').textContent = fmt(total - tax);
      $('totalTax').textContent = fmt(tax);
      $('siteRateLabel').textContent = rate;
    }

    // 体積を入れ直したら台数は自動に戻す（前の現場で変えた台数が残らないように）
    m3El.addEventListener('input', () => { trucksTouched = false; calc(); });
    m3El.addEventListener('focus', () => m3El.select());
    // −／＋で0.5㎥ずつ（0より下にはしない）
    const stepM3 = (d) => {
      const v = toNum(m3El.value);
      const next = Math.max(0, Math.round(((Number.isFinite(v) ? v : 0) + d) * 100) / 100);
      m3El.value = String(next);
      trucksTouched = false;
      calc();
    };
    $('m3Minus').addEventListener('click', () => stepM3(-0.5));
    $('m3Plus').addEventListener('click', () => stepM3(0.5));
    trucksEl.addEventListener('input', () => { trucksTouched = true; calc(); });
    trucksEl.addEventListener('focus', () => trucksEl.select());
    const step = (d) => {
      trucksTouched = true;
      trucksEl.value = String(Math.max(0, (Math.floor(toNum(trucksEl.value)) || 0) + d));
      calc();
    };
    $('truckMinus').addEventListener('click', () => step(-1));
    $('truckPlus').addEventListener('click', () => step(1));

    fields.forEach(([k, el]) => el.addEventListener('input', () => { save('site.' + k, el.value); calc(); }));
    $('resetPrices').addEventListener('click', () => {
      fields.forEach(([k, el]) => { el.value = DEFAULTS[k]; save('site.' + k, el.value); });
      calc();
    });
    calc();
  }
})();
