/* Demo data for the tutorial videos. Runs against a throw-away server; never touches ./data */
const zlib = require('node:zlib');
const org = require('../org.json');

function client(base) {
  let ck = '';
  const f = async (p, o = {}) => { const r = await fetch(base + p, Object.assign({}, o, { headers: Object.assign({ cookie: ck }, o.headers || {}) })); const sc = r.headers.get('set-cookie'); if (sc) { const m = sc.match(/qp_sid=([^;]*)/); ck = m && m[1] ? 'qp_sid=' + m[1] : ''; } return r; };
  const act = async (a, b = {}) => (await f('/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'qp' }, body: JSON.stringify(Object.assign({ a }, b)) })).json();
  return { act, state: async () => (await f('/api/state')).json() };
}

/* tiny PNG writer */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); }
function png(w, h, fn) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b, a] = fn(x, y), o = y * (w * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const docPng = (tint = [15, 76, 158]) => png(520, 360, (x, y) => y < 56 ? [...tint, 255] : (y > 100 && (y - 100) % 34 < 12 && x > 40 && x < (((y - 100) / 34 | 0) % 3 === 2 ? 300 : 470)) ? [199, 210, 230, 255] : (x > 340 && x < 480 && y > 250 && y < 330) ? [232, 238, 251, 255] : [255, 255, 255, 255]);
const sigPng = () => { const pts = []; for (let i = 0; i < 260; i++) { const x = 20 + i; pts.push([x, 50 + 24 * Math.sin(i / 17) * (1 - i / 330) - 8 * Math.sin(i / 5)]); }
  return png(300, 100, (x, y) => pts.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < 5.5) ? [11, 31, 92, 255] : [0, 0, 0, 0]); };
const dataUrl = b => 'data:image/png;base64,' + b.toString('base64');
const b64 = b => b.toString('base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF');

const PASS = 'Demo@12345', UNIT_DEPT = org.gm.find(x => x.acc).n;
const SUBS = org.gm.find(x => x.acc).s;

/* accounts every video needs: stamp names, deputies, a head, a section account */
async function seedBase(base) {
  const ad = client(base); await ad.act('login', { u: 'admin', p: 'Admin@123' });
  await ad.act('stamps_set', { gm: 'أحمد خرباط عبدالسيد الجليحاوي', deputy_admin: 'سعد حميد الزبيدي', deputy_tech: 'عمار فاضل الجبوري' });
  await ad.act('user_save', { name: 'سعد حميد الزبيدي', dept: 'ديوان المديرية', username: 'dep_admin', pass: PASS, role: 'deputy_admin', perms: ['requests_view', 'requests_decide', 'meetings', 'settings'] });
  await ad.act('user_save', { name: 'عمار فاضل الجبوري', dept: 'ديوان المديرية', username: 'dep_tech', pass: PASS, role: 'deputy_tech', perms: ['requests_view', 'requests_decide', 'meetings', 'settings'] });
  await ad.act('user_save', { name: 'علي كاظم الشمري', dept: 'قسم التخطيط التربوي', username: 'head_plan', pass: PASS, role: 'head', perms: ['requests_view', 'requests_decide', 'settings'] });
  await ad.act('unit_save', { unit: UNIT_DEPT, username: 'sec_super', pass: PASS, holder: 'كريم ناصر محمد' });
  return ad;
}

const PEOPLE = [
  { name: 'علي حسين كاظم', work: 'ثانوية الفجر للبنين', job: 'مدرس', birth: '1988-03-14', appt: 'ملاك دائم', phone: '07701230001', username: 'ali_h', empNo: '4101', nid: '198803140001' },
  { name: 'زينب علي حسن', work: 'متوسطة النور للبنات', job: 'مدرس', birth: '1991-07-02', appt: 'عقد', phone: '07701230002', username: 'zainab_a', empNo: '4102', nid: '199107020002' },
  { name: 'كريم صالح مهدي', work: 'ابتدائية الرسالة', job: 'معلم', birth: '1985-11-23', appt: 'ملاك دائم', phone: '07701230003', username: 'karim_s', empNo: '4103', nid: '198511230003' },
  { name: 'ليلى حسن كاظم', work: 'قسم الشؤون الإدارية', job: 'إداري', birth: '1990-01-30', appt: 'أجور', phone: '07701230004', username: 'laila_h', empNo: '4104', nid: '199001300004' },
];

/* the manager video: pending requests with attachments, two interviews, one support message */
async function seedManager(base) {
  await seedBase(base);
  const reqs = [
    [0, 'نقل', 'يرجى التفضل بالموافقة على نقلي من مدرسة الفجر إلى مدرسة أقرب لمحل سكني', [{ name: 'تأييد السكن.png', type: 'image/png', data: b64(docPng([15, 76, 158])) }, { name: 'طلب النقل.pdf', type: 'application/pdf', data: b64(PDF) }]],
    [1, 'إجازة', 'يرجى التفضل بالموافقة على منحي إجازة اعتيادية لمدة عشرة أيام', [{ name: 'تقرير طبي.png', type: 'image/png', data: b64(docPng([14, 159, 110])) }]],
    [2, 'تأييد خدمة', 'يرجى التفضل بالموافقة على إصدار تأييد خدمة لتقديمه إلى جهة خارجية', []],
    [3, 'وثيقة', 'يرجى التفضل بالموافقة على إصدار وثيقة تخرج بدل مفقود', [{ name: 'بيان ضياع.png', type: 'image/png', data: b64(docPng([201, 160, 74])) }]],
  ];
  for (let i = 0; i < PEOPLE.length; i++) {
    const c = client(base); const p = PEOPLE[i]; await c.act('signup', Object.assign({}, p, { pass: PASS }));
    await c.act('login', { u: p.username, p: PASS });
    const r = reqs[i]; await c.act('req_submit', { type: r[1], text: r[2], sig: dataUrl(sigPng()), files: r[3] });
    if (i < 2) await c.act('int_submit', { target: i ? 'deputy_admin' : 'gm', reason: i ? 'أرغب بمقابلة المعاون لمناقشة موضوع التكليف' : 'أرغب بمقابلة المدير العام بخصوص طلب النقل', files: [] });
  }
  await client(base).act('support_submit', { name: 'سارة حيدر كاظم', work: 'متوسطة الغدير', job: 'مدرسة', text: 'عند تقديم الطلب لا أستطيع رفع المرفقات وتظهر رسالة خطأ.', files: [{ name: 'خطأ.png', type: 'image/png', data: b64(docPng([198, 40, 40])) }] });
}

/* the reviewer video starts empty (only the base accounts) */
async function seedReviewer(base) { await seedBase(base); }

/* "behind the scenes": the manager handles the request the reviewer just sent */
async function managerProcess(base) {
  const ad = client(base); await ad.act('login', { u: 'admin', p: 'Admin@123' });
  const st = await ad.state(); const r = st.reqs[st.reqs.length - 1];
  await ad.act('req_decide', { id: r.id, act: 'approve', note: '' });
  await ad.act('req_form', { id: r.id, to: 'المدير العام', ham: st.users ? 'إجراء اللازم بموجب الضوابط والتعليمات' : '', dept: UNIT_DEPT, sec: SUBS[0] });
  const un = client(base); await un.act('login', { u: 'sec_super', p: PASS }); await un.act('unit_work', { id: r.id, act: 'route', sec: SUBS[0], note: 'قيد المتابعة' });
}

module.exports = { client, seedManager, seedReviewer, managerProcess, PASS, UNIT_DEPT };
