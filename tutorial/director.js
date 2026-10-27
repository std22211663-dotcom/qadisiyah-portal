/* Page-side "director": runs inside the portal page. Moves a visible cursor, clicks, types, shows Arabic captions,
   and records the tab with MediaRecorder. Injected by record.js; scenes are written against window.D. */
(function () {
  if (window.D) return;
  const D = window.D = { speed: 1, script: [], stepNo: 0 };
  const sl = ms => new Promise(r => setTimeout(r, Math.max(60, ms * D.speed)));
  D.sleep = sl;

  /* ---------- overlay ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #dr{position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:'Cairo','Segoe UI',Tahoma,sans-serif}
  #dr-cap{position:absolute;left:50%;bottom:26px;transform:translate(-50%,24px);max-width:min(1060px,92vw);padding:14px 30px;border-radius:18px;
    background:rgba(8,20,48,.88);color:#fff;font-size:27px;font-weight:700;line-height:1.7;text-align:center;opacity:0;transition:opacity .35s,transform .35s;
    box-shadow:0 10px 34px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18);direction:rtl}
  #dr-cap.on{opacity:1;transform:translate(-50%,0)}
  #dr-cap b{color:#facc6b}
  #dr-step{position:absolute;top:18px;right:18px;padding:8px 20px;border-radius:999px;background:linear-gradient(120deg,#0a2f6b,#0f4c9e);color:#fff;font-size:21px;font-weight:800;
    border:2px solid #c9a04a;box-shadow:0 6px 20px rgba(0,0,0,.35);opacity:0;transform:translateY(-14px);transition:opacity .35s,transform .35s;direction:rtl}
  #dr-step.on{opacity:1;transform:none}
  #dr-cur{position:absolute;left:0;top:0;width:34px;height:34px;transform:translate(640px,420px);transition:transform .7s;filter:drop-shadow(0 3px 5px rgba(0,0,0,.5));opacity:0}
  #dr-cur.on{opacity:1}
  .dr-rip{position:absolute;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:4px solid #facc6b;background:rgba(250,204,107,.35);animation:drrip .65s ease-out forwards}
  @keyframes drrip{to{transform:scale(4.2);opacity:0}}
  .dr-ring{position:absolute;border:4px solid #f59e0b;border-radius:14px;box-shadow:0 0 0 6px rgba(245,158,11,.25),0 0 24px rgba(245,158,11,.55);animation:drring 1.2s ease-in-out infinite}
  @keyframes drring{50%{box-shadow:0 0 0 12px rgba(245,158,11,.12),0 0 34px rgba(245,158,11,.8)}}
  #dr-card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:40px;direction:rtl;
    background:radial-gradient(900px 520px at 85% 0%,rgba(250,204,107,.25),transparent 70%),linear-gradient(135deg,#071a3f,#0b3a82 55%,#0e7a6c);color:#fff;opacity:0;transition:opacity .6s}
  #dr-card.on{opacity:1}
  #dr-card .lg{width:150px;height:150px}
  #dr-card h1{margin:6px 0 0;font-size:54px;font-weight:800;line-height:1.35;max-width:1000px}
  #dr-card h2{margin:0;font-size:30px;font-weight:600;opacity:.95;max-width:980px;line-height:1.6}
  #dr-card p{margin:14px 0 0;font-size:20px;opacity:.75;letter-spacing:.06em;direction:ltr}
  #dr-card .bar{width:160px;height:5px;border-radius:3px;background:#c9a04a;margin:12px 0}`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'dr';
  root.innerHTML = '<div id="dr-cap"></div><div id="dr-step"></div><div id="dr-cur"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg></div><div id="dr-card"></div>';
  document.documentElement.appendChild(root);
  const cap = root.querySelector('#dr-cap'), stepEl = root.querySelector('#dr-step'), cur = root.querySelector('#dr-cur'), card = root.querySelector('#dr-card');
  let cx = innerWidth * .55, cy = innerHeight * .62; cur.style.transform = `translate(${cx}px,${cy}px)`;

  /* ---------- helpers ---------- */
  function resolve(t) {
    const el = typeof t === 'function' ? t() : typeof t === 'string' ? document.querySelector(t) : t;
    if (!el) throw new Error('element not found: ' + (typeof t === 'string' ? t : String(t)));
    return el;
  }
  D.byText = (sel, text, root) => [...(root || document).querySelectorAll(sel)].find(e => e.offsetWidth > 0 && e.textContent.replace(/\s+/g, ' ').includes(text));
  const vis = el => el.closest('.cb') || (el.type === 'hidden' && el.previousElementSibling && el.previousElementSibling.classList.contains('dsel') ? el.previousElementSibling : el);
  async function scrollTo(el) {
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > innerHeight - 130) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sl(650); }
  }
  async function move(x, y) {
    const d = Math.hypot(x - cx, y - cy), ms = Math.min(1100, Math.max(380, d * 1.15));
    cur.classList.add('on'); cur.style.transition = `transform ${ms * D.speed}ms cubic-bezier(.4,0,.2,1)`; cur.style.transform = `translate(${x - 4}px,${y - 3}px)`; cx = x; cy = y; await sl(ms + 40);
  }
  function ripple(x, y) { const r = document.createElement('div'); r.className = 'dr-rip'; r.style.left = x + 'px'; r.style.top = y + 'px'; root.appendChild(r); setTimeout(() => r.remove(), 800) }
  function ring(el, ms) {
    const b = el.getBoundingClientRect(), g = document.createElement('div'); g.className = 'dr-ring';
    g.style.cssText = `left:${b.left - 6}px;top:${b.top - 6}px;width:${b.width + 12}px;height:${b.height + 12}px`; root.appendChild(g); setTimeout(() => g.remove(), ms || 1500);
  }
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] };
  D.cursor = (on) => cur.classList.toggle('on', on);

  /* ---------- actions ---------- */
  D.point = async (t, o = {}) => { const el = vis(resolve(t)); await scrollTo(el); const [x, y] = center(el); await move(x, y); if (o.ring !== false) ring(el, o.ringMs); await sl(o.after == null ? 500 : o.after); return el };
  D.click = async (t, o = {}) => {
    const target = resolve(t), el = vis(target); await scrollTo(el); const [x, y] = center(el); await move(x, y);
    ripple(x, y); if (o.ring !== false) ring(el, 900); await sl(280); target.click(); await sl(o.after == null ? 700 : o.after); return target;
  };
  D.type = async (t, text, o = {}) => {
    const el = resolve(t); await scrollTo(el); const [x, y] = center(vis(el)); await move(x, y); ripple(x, y); el.focus(); await sl(250);
    if (o.clear) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })) }
    for (const ch of String(text)) { el.value += ch; el.dispatchEvent(new Event('input', { bubbles: true })); await sl(o.per || 55) }
    el.dispatchEvent(new Event('change', { bubbles: true })); await sl(o.after == null ? 350 : o.after); return el;
  };
  D.choose = async (t, value, o = {}) => {
    const el = resolve(t), v = vis(el); await scrollTo(v); const [x, y] = center(v); await move(x, y); ripple(x, y); ring(v, 900); await sl(380);
    el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); await sl(o.after == null ? 550 : o.after); return el;
  };
  D.set = (t, value) => { const el = resolve(t); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })) };
  D.sign = async (canvasSel) => {
    const c = resolve(canvasSel); await scrollTo(c); c.setPointerCapture = function () { }; const r = c.getBoundingClientRect();
    const pt = (u, v) => [r.left + r.width * u, r.top + r.height * v];
    const path = []; for (let i = 0; i <= 46; i++) { const u = .12 + i * .0175; path.push([u, .52 + .22 * Math.sin(i / 3.1) * (1 - i / 80) - .08 * Math.sin(i / 1.2)]) }
    const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
    let [x, y] = pt(...path[0]); await move(x, y); ev('pointerdown', x, y);
    for (const p of path) { [x, y] = pt(...p); cur.style.transition = 'transform 60ms linear'; cur.style.transform = `translate(${x - 4}px,${y - 3}px)`; cx = x; cy = y; ev('pointermove', x, y); await sl(55) }
    ev('pointerup', x, y); await sl(500);
  };
  D.attach = async (inputSel, files, o = {}) => {
    const input = resolve(inputSel), area = input.closest('.upl') || input; await scrollTo(area); const [x, y] = center(area); await move(x, y); ripple(x, y); ring(area, 900); await sl(500);
    const dt = new DataTransfer();
    for (const f of files) {
      if (f.pdf) { dt.items.add(new File(['%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF'], f.name, { type: 'application/pdf' })); continue }
      const cv = document.createElement('canvas'); cv.width = 800; cv.height = 560; const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 560); g.fillStyle = f.color || '#0f4c9e'; g.fillRect(0, 0, 800, 90); g.fillStyle = '#c7d2e6';
      for (let i = 0; i < 9; i++) g.fillRect(60, 140 + i * 42, i % 3 === 2 ? 420 : 680, 16);
      g.fillStyle = '#e8eefb'; g.fillRect(560, 400, 180, 110);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png')); dt.items.add(new File([blob], f.name, { type: 'image/png' }));
    }
    input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); await sl(o.after == null ? 900 : o.after);
  };

  /* ---------- captions, steps, cards ---------- */
  D.say = async (text, o = {}) => {
    cap.innerHTML = text; cap.classList.add('on'); D.script.push({ step: D.stepNo, title: D.stepTitle || '', text: cap.textContent });
    await sl(o.ms || Math.max(2400, 1100 + cap.textContent.length * 62));
  };
  D.quiet = () => cap.classList.remove('on');
  D.step = async (title) => { D.stepNo++; D.stepTitle = title; stepEl.textContent = 'الخطوة ' + D.stepNo.toLocaleString('ar-IQ') + ' • ' + title; stepEl.classList.add('on'); D.script.push({ step: D.stepNo, title, text: '', heading: true }); await sl(400) };
  D.card = async (title, sub, ms, small) => {
    card.innerHTML = '<svg class="lg" viewBox="0 0 100 100"><use href="#emblem"/></svg><div class="bar"></div><h1>' + title + '</h1>' + (sub ? '<h2>' + sub + '</h2>' : '') + '<p>' + (small || 'ELC . Abbas Ali') + '</p>';
    D.quiet(); stepEl.classList.remove('on'); cur.classList.remove('on'); card.classList.add('on'); D.script.push({ step: 0, title: 'بطاقة', text: title + (sub ? ' — ' + sub : ''), heading: true });
    await sl(ms || 4500); card.classList.remove('on'); await sl(700);
  };
  D.show = (el) => { ring(resolve(el), 2200) };

  /* ---------- recording ---------- */
  D.rec = {
    async start() {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 25 }, audio: false, preferCurrentTab: true });
      const mt = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(s, { mimeType: mt, videoBitsPerSecond: 4000000, videoKeyFrameIntervalDuration: 2000 }), parts = [];
      rec.ondataavailable = e => e.data.size && parts.push(e.data); D.rec._stopped = new Promise(r => rec.onstop = r); rec.start(2000);
      D.rec._r = rec; D.rec._s = s; D.rec._p = parts; D.rec._mt = mt; await new Promise(r => setTimeout(r, 1800)); D.rec._size = innerWidth + "x" + innerHeight; return { mime: mt, w: innerWidth, h: innerHeight };
    },
    async stop() { D.rec._r.stop(); await D.rec._stopped; D.rec._s.getTracks().forEach(t => t.stop()); window.__blob = new Blob(D.rec._p, { type: D.rec._mt }); return { mime: D.rec._mt, size: window.__blob.size, startSize: D.rec._size, endSize: innerWidth + "x" + innerHeight } }
  };
})();
