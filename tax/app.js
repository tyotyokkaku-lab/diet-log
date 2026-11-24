// 内税計算：税込の金額から、含まれている消費税（内税）と税抜の金額を出す
(() => {
  const $ = (id) => document.getElementById(id);
  const amountEl = $('amount'), rateEl = $('rate'), taxEl = $('tax'), netEl = $('net');
  const chips = document.querySelectorAll('.chips button');

  // 全角数字・カンマも受け付ける
  const toNum = (s) => {
    const t = String(s)
      .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[,，\s円%％]/g, '');
    if (t === '' || !/^\d*\.?\d*$/.test(t)) return NaN;
    return Number(t);
  };
  const fmt = (n) => n.toLocaleString('ja-JP');

  function calc() {
    const amount = toNum(amountEl.value);
    const rate = toNum(rateEl.value);
    chips.forEach((b) => b.classList.toggle('on', Number(b.dataset.rate) === rate));
    if (!Number.isFinite(amount) || !Number.isFinite(rate)) {
      taxEl.textContent = ''; netEl.textContent = '';
      return;
    }
    // 内税 = 金額 × 税率 ÷ (100 + 税率)、端数は切り捨て（小さな誤差で1円ずれないよう少し足す）
    const tax = Math.floor((amount * rate) / (100 + rate) + 1e-9);
    taxEl.textContent = fmt(tax);
    netEl.textContent = fmt(amount - tax);
  }

  // 前回の値を覚えておく
  const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const r = load('tax.rate'); if (r !== null) rateEl.value = r;
  const a = load('tax.amount'); if (a !== null) amountEl.value = a;

  amountEl.addEventListener('input', () => { save('tax.amount', amountEl.value); calc(); });
  rateEl.addEventListener('input', () => { save('tax.rate', rateEl.value); calc(); });
  chips.forEach((b) => b.addEventListener('click', () => {
    rateEl.value = b.dataset.rate; save('tax.rate', rateEl.value); calc();
  }));
  amountEl.addEventListener('focus', () => amountEl.select());

  calc();
})();
