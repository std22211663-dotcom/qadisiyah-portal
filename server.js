/*
 * بوابة تربية القادسية الإلكترونية — الخادم
 * Qadisiyah Education Directorate portal — server
 *
 * No external packages: Node.js 22.5+ (built-in node:sqlite, node:http, node:crypto).
 * Run:  node server.js        (see README.md for settings)
 */
'use strict';
{ const [M, m] = process.versions.node.split('.').map(Number);
  if (M < 22 || (M === 22 && m < 13)) { console.error('\n  يحتاج الخادم Node.js الإصدار 22.13 أو أحدث (المثبت حالياً ' + process.versions.node + ').\n  نزّل الإصدار LTS من https://nodejs.org ثم أعد التشغيل.\n'); process.exit(1); } }
process.removeAllListeners('warning');
process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

/* ------------------------------------------------------------------ config */
const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_DAYS = +process.env.SESSION_DAYS || 7;
const SERVE_STATIC = process.env.SERVE_STATIC !== '0';   // 0 = API only (front end hosted elsewhere, e.g. Netlify)
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_BODY = 45 * 1024 * 1024;           // 5 files x 5 MB as base64 + form data
const MAX_FILE = 5 * 1024 * 1024, MAX_FILES = 5;
const VERSION = '2.0.0';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ORG = JSON.parse(fs.readFileSync(path.join(__dirname, 'org.json'), 'utf8'));

/* ---------------------------------------------------------------- database */
const db = new DatabaseSync(path.join(DATA_DIR, 'portal.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, phone TEXT, emp_id TEXT UNIQUE,
  type TEXT NOT NULL, role TEXT NOT NULL, pass TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY, no TEXT NOT NULL UNIQUE, uid INTEGER, status TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS interviews(id INTEGER PRIMARY KEY, no TEXT NOT NULL UNIQUE, uid INTEGER, target TEXT, status TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trash(tid INTEGER PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS log(id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, code TEXT, uid INTEGER, name TEXT, role TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, name TEXT, type TEXT, size INTEGER, created TEXT);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS staff(k TEXT PRIMARY KEY, row TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, uid INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(k TEXT PRIMARY KEY, n INTEGER, until INTEGER);
CREATE INDEX IF NOT EXISTS req_uid ON requests(uid);
CREATE INDEX IF NOT EXISTS int_uid ON interviews(uid);
`);
const q = (sql) => db.prepare(sql);
function tx(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }

const kvGet = (k, d) => { const r = q('SELECT v FROM kv WHERE k=?').get(k); return r ? JSON.parse(r.v) : d; };
const kvSet = (k, v) => q('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, JSON.stringify(v));

/* ------------------------------------------------------------------- roles */
const ADMINP = ['requests_view', 'requests_decide', 'meetings', 'settings', 'users_manage', 'data_manage', 'audit_view'];
const ROLES = {
  reviewer: { label: 'مراجع', perms: ['apply', 'interview', 'track'] },
  gm: { label: 'المدير العام', perms: ADMINP.slice() },
  deputy_admin: { label: 'المعاون الإداري', perms: ['requests_view', 'requests_decide', 'meetings', 'settings'] },
  deputy_tech: { label: 'المعاون الفني', perms: ['requests_view', 'requests_decide', 'meetings', 'settings'] },
  deputy: { label: 'معاون المدير العام', perms: ['requests_view', 'requests_decide', 'meetings', 'settings'] },
  head: { label: 'مدير قسم', perms: ['requests_view', 'requests_decide', 'settings'] },
  officer: { label: 'موظف مختص', perms: ['requests_view', 'settings'] },
  inquiry: { label: 'موظف استعلامات', perms: ['requests_view', 'settings'] },
  unit: { label: 'حساب قسم / شعبة', perms: ['unit_inbox', 'settings'] },
};
const ALL_PERMS = ADMINP.concat(['apply', 'interview', 'track', 'unit_inbox']);
const SUP_LABEL = { gm: 'المدير العام', deputy_admin: 'المعاون الإداري', deputy_tech: 'المعاون الفني' };
const SUP_BY_LABEL = { 'المدير العام': 'gm', 'المعاون الإداري': 'deputy_admin', 'المعاون الفني': 'deputy_tech' };
const ST = { p: 'قيد المراجعة', a: 'موافق عليه', r: 'مرفوض' };
const IS = { p: 'بانتظار تحديد الموعد', s: 'تم تحديد الموعد' };
const US = { w: 'قيد الإنجاز', d: 'تم الإنجاز' };
const KIND = { req: 'الطلبات', int: 'طلبات المقابلة' };
const GM_DEFAULT = 'أحمد خرباط عبدالسيد الجليحاوي';
const SVC_MSG = 'نعتذر منكم، تم إيقاف استقبال الطلبات والمقابلات مؤقتاً من قبل المديرية. يرجى المحاولة لاحقاً، وشكراً لتفهمكم.';

function orgFind(name) { for (const k in ORG) { const o = ORG[k].find(x => x.n === name); if (o) return { sup: k, o }; } return null; }
function deptsFor(supKey) { return supKey === 'gm' ? Object.values(ORG).flat().map(o => o.n) : (ORG[supKey] || []).map(o => o.n); }

/* --------------------------------------------------------------- passwords */
function hashPass(p) { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(String(p), salt, 64); return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex'); }
function checkPass(p, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, s, h] = stored.split('$'); const hb = Buffer.from(h, 'hex');
  const t = crypto.scryptSync(String(p), Buffer.from(s, 'hex'), hb.length);
  return crypto.timingSafeEqual(t, hb);
}

/* ------------------------------------------------------------------ models */
function rowUser(r) { if (!r) return null; const d = JSON.parse(r.data); return Object.assign(d, { id: r.id, username: r.username, phone: r.phone || '', empId: r.emp_id || undefined, type: r.type, role: r.role, created: r.created, _pass: r.pass }); }
const allUsers = () => q('SELECT * FROM users ORDER BY id').all().map(rowUser);
const userById = id => rowUser(q('SELECT * FROM users WHERE id=?').get(id));
function saveUser(u) {
  const { id, username, phone, empId, type, role, created, _pass, ...rest } = u;
  delete rest.pass;
  if (id) q('UPDATE users SET username=?,phone=?,emp_id=?,type=?,role=?,pass=?,data=? WHERE id=?').run(username, phone || null, empId || null, type, role, _pass, JSON.stringify(rest), id);
  else return Number(q('INSERT INTO users(username,phone,emp_id,type,role,pass,data,created) VALUES(?,?,?,?,?,?,?,?)').run(username, phone || null, empId || null, type, role, _pass, JSON.stringify(rest), created || new Date().toISOString()).lastInsertRowid);
  return id;
}
function pubUser(u) { if (!u) return null; const o = Object.assign({}, u); delete o._pass; return o; }
const hasPerm = (u, p) => !!u && Array.isArray(u.perms) && u.perms.includes(p);
const hasManager = list => list.some(u => u.type === 'admin' && hasPerm(u, 'users_manage'));

function rowRec(r) { return r ? Object.assign(JSON.parse(r.data), { id: r.id, no: r.no, uid: r.uid, status: r.status }) : null; }
const allReqs = () => q('SELECT * FROM requests ORDER BY id').all().map(rowRec);
const allInts = () => q('SELECT * FROM interviews ORDER BY id').all().map(r => Object.assign(rowRec(r), { target: r.target }));
function saveReq(r) { const { id, no, uid, status, ...d } = r; q('INSERT INTO requests(id,no,uid,status,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET no=excluded.no,uid=excluded.uid,status=excluded.status,data=excluded.data').run(id, no, uid ?? null, status, JSON.stringify(d)); }
function saveInt(r) { const { id, no, uid, status, target, ...d } = r; q('INSERT INTO interviews(id,no,uid,target,status,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET no=excluded.no,uid=excluded.uid,target=excluded.target,status=excluded.status,data=excluded.data').run(id, no, uid ?? null, target, status, JSON.stringify(d)); }
const allTrash = () => q('SELECT * FROM trash ORDER BY tid').all().map(r => Object.assign(JSON.parse(r.data), { tid: r.tid, kind: r.kind }));

function logAct(code, detail, actor) {
  const u = actor || null;
  q('INSERT INTO log(at,code,uid,name,role,detail) VALUES(?,?,?,?,?,?)').run(new Date().toISOString(), code, u ? u.id : null, u ? u.name : 'غير معروف', u && ROLES[u.role] ? ROLES[u.role].label : '', String(detail || '').slice(0, 1000));
}
function nextSeq(kind) {
  const key = 'seq_' + kind, t = kind === 'req' ? 'requests' : 'interviews';
  let mx = Math.max(kvGet(key, 0), (q(`SELECT MAX(id) m FROM ${t}`).get().m) || 0);
  allTrash().forEach(x => { if (x.kind === kind) mx = Math.max(mx, x.rec.n || x.rec.id || 0); });
  kvSet(key, mx + 1); return mx + 1;
}
const svc = () => { const d = kvGet('svc', {}); return { req: d.req !== false, int: d.int !== false, msg: d.msg || SVC_MSG }; };
const stamps = () => { const d = kvGet('stamps', {}); return { gm: d.gm || GM_DEFAULT, deputy_admin: d.deputy_admin || '', deputy_tech: d.deputy_tech || '' }; };

/* ------------------------------------------------------------- first start */
if (!q('SELECT COUNT(*) c FROM users').get().c) {
  const pw = process.env.ADMIN_PASSWORD || 'Admin@123';
  saveUser({ type: 'admin', role: 'gm', name: 'المدير العام', username: 'admin', phone: '', dept: 'مديرية تربية القادسية', perms: ADMINP.slice(), _pass: hashPass(pw) });
  console.log('\n  أُنشئ حساب المدير العام الافتراضي: admin / ' + (process.env.ADMIN_PASSWORD ? '(من ADMIN_PASSWORD)' : 'Admin@123') + ' — غيّر كلمة المرور فوراً من الإعدادات.\n');
}

/* ----------------------------------------------------------- small helpers */
class Fail extends Error { constructor(msg, field, status) { super(msg); this.field = field; this.status = status || 400; } }
const need = (cond, msg, field) => { if (!cond) throw new Fail(msg, field); };
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 2000);
const digits = s => String(s || '').replace(/[٠-٩]/g, c => c.charCodeAt(0) - 1632).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 1776);
const words = s => str(s).split(/\s+/).filter(Boolean).length;
const now = () => new Date().toISOString();
function sdate(iso) { const d = new Date(iso); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); }
function fwhen(iso) { const d = new Date(iso); try { return d.toLocaleString('ar-IQ', { dateStyle: 'full', timeStyle: 'short' }); } catch (e) { return iso; } }

/* staff-list matching (same rules as the page) */
const vnorm = v => digits(v == null ? '' : v).trim();
const pad2 = n => { n = String(+n); return n.length < 2 ? '0' + n : n; };
function vcands(v) {
  v = vnorm(v); if (!v) return []; const out = []; let m;
  if ((m = v.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) out.push(m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]));
  else if ((m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/))) { out.push(m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1])); out.push(m[3] + '-' + pad2(m[1]) + '-' + pad2(m[2])); }
  else if ((m = v.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2})$/))) { const y = +m[3] > 30 ? '19' + m[3] : '20' + m[3]; out.push(y + '-' + pad2(m[2]) + '-' + pad2(m[1])); out.push(y + '-' + pad2(m[1]) + '-' + pad2(m[2])); }
  const plain = v.replace(/\s+/g, '').toLowerCase(); out.push(plain); if (/^\d+$/.test(plain)) out.push(plain.replace(/^0+/, '') || '0');
  if (/^\+?964\d+$/.test(plain)) out.push(plain.replace(/^\+?964/, ''));
  return out;
}
const vmatch = (a, b) => { const A = vcands(a), B = vcands(b); return A.some(x => x && B.includes(x)); };
const idnorm = v => vnorm(v).replace(/\s+/g, '').replace(/^0+(?=\d)/, '').toLowerCase();

/* login throttling: 5 wrong tries -> 5 minutes */
function throttled(k) { const r = q('SELECT * FROM attempts WHERE k=?').get(k); return r && r.until > Date.now() ? Math.ceil((r.until - Date.now()) / 60000) : 0; }
function failed(k) { const r = q('SELECT * FROM attempts WHERE k=?').get(k) || { n: 0 }; let n = (r.n || 0) + 1, until = 0; if (n >= 5) { until = Date.now() + 5 * 60000; n = 0; } q('INSERT INTO attempts(k,n,until) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET n=excluded.n,until=excluded.until').run(k, n, until); }
const cleared = k => q('DELETE FROM attempts WHERE k=?').run(k);

/* attachments arrive as base64 inside the JSON body */
function takeFiles(list) {
  if (!Array.isArray(list)) return [];
  need(list.length <= MAX_FILES, 'الحد الأقصى 5 ملفات');
  return list.map(f => {
    const name = str(f && f.name, 200) || 'ملف', type = str(f && f.type, 100);
    const img = /^image\/(png|jpe?g|gif|webp|heic|heif|bmp)$/.test(type), pdf = type === 'application/pdf' || /\.pdf$/i.test(name);
    need(img || pdf, '«' + name + '» نوعه غير مدعوم (صور أو PDF فقط)');
    const buf = Buffer.from(String(f.data || ''), 'base64');
    need(buf.length > 0 && buf.length <= MAX_FILE, '«' + name + '» أكبر من 5 م.ب أو فارغ');
    if (pdf) need(buf.subarray(0, 5).toString() === '%PDF-', '«' + name + '» ليس ملف PDF صالحاً');
    const id = crypto.randomUUID();
    fs.writeFileSync(path.join(UPLOAD_DIR, id), buf);
    q('INSERT INTO files(id,name,type,size,created) VALUES(?,?,?,?,?)').run(id, name, pdf ? 'application/pdf' : type, buf.length, now());
    return { id, name, size: buf.length, type: pdf ? 'application/pdf' : type };
  });
}

/* ---------------------------------------------------------------- the view
   Each account receives only what its permissions allow. */
function stateFor(me) {
  const isAdmin = me.type === 'admin', P = p => hasPerm(me, p);
  const us = allUsers();
  let users;
  if (P('users_manage')) users = us.map(pubUser);
  else if (isAdmin) users = us.filter(u => u.type === 'admin').map(u => ({ id: u.id, type: u.type, role: u.role, name: u.name, unit: u.unit, holder: u.holder, perms: u.perms }));
  else users = [pubUser(me)];
  const R = allReqs(), I = allInts();
  let reqs = [], ints = [];
  if (isAdmin && (P('requests_view') || P('users_manage') || P('data_manage'))) reqs = R;
  else if (P('unit_inbox')) reqs = R.filter(r => r.form && r.form.dept === me.unit);
  else if (!isAdmin) reqs = R.filter(r => r.uid === me.id);
  if (isAdmin && (P('users_manage') || P('data_manage'))) ints = I;
  else if (P('meetings')) ints = I.filter(r => r.target === me.role);
  else if (!isAdmin) ints = I.filter(r => r.uid === me.id);
  const targets = {}; ['gm', 'deputy_admin', 'deputy_tech'].forEach(k => { targets[k] = us.some(u => u.type === 'admin' && u.role === k && hasPerm(u, 'meetings')); });
  const st = { me: pubUser(me), users, reqs, ints, svc: svc(), stamps: stamps(), org: ORG, targets, pub: pubState(), rvSeen: kvGet('rv_seen', {})[me.id] || '' };
  if (P('audit_view')) st.log = q('SELECT * FROM log ORDER BY id DESC LIMIT 3000').all().reverse();
  if (P('data_manage')) { st.trash = allTrash(); st.lastBackup = kvGet('last_backup', null); }
  if (P('users_manage')) { const m = kvGet('staff_meta', null); st.staff = m ? Object.assign({}, m, { rows: q('SELECT row FROM staff ORDER BY rowid').all().map(r => JSON.parse(r.row)) }) : null; }
  if (P('settings')) {
    const ad = us.filter(u => u.type === 'admin').length;
    st.counts = { ad, rv: us.length - ad, reqs: R.length, reqP: R.filter(r => r.status === ST.p).length, reqA: R.filter(r => r.status === ST.a).length, reqR: R.filter(r => r.status === ST.r).length,
      ints: I.length, intP: I.filter(r => r.status === IS.p).length, intS: I.filter(r => r.status === IS.s).length, trash: q('SELECT COUNT(*) c FROM trash').get().c, log: q('SELECT COUNT(*) c FROM log').get().c,
      kb: Math.round((fs.statSync(path.join(DATA_DIR, 'portal.db')).size + dirSize(UPLOAD_DIR)) / 1024), version: VERSION };
  }
  return st;
}
function dirSize(d) { let t = 0; try { for (const f of fs.readdirSync(d)) t += fs.statSync(path.join(d, f)).size; } catch (e) { } return t; }
function pubState() {
  const m = kvGet('staff_meta', null);
  if (!m) return { emp: null };
  const label = m.cols[m.map.ver] || 'رمز التحقق';
  return { emp: { label, isDate: /تولد|ميلاد|ولاد|date|dob/i.test(label) } };
}

/* ----------------------------------------------------------------- actions */
const A = {};
const perm = (me, p) => { if (!hasPerm(me, p)) throw new Fail('ليست لديك صلاحية لهذا الإجراء', null, 403); };

/* --- sign-in --- */
A.login = (me, b, ctx) => {
  const v = str(b.u, 80), p = String(b.p || ''); need(v && p, 'يرجى إدخال بيانات الدخول');
  const key = 'l:' + ctx.ip + ':' + v.toLowerCase(), wait = throttled(key);
  need(!wait, 'محاولات خاطئة كثيرة. حاول مرة أخرى بعد ' + wait + ' دقيقة.');
  const ph = digits(v);
  const u = rowUser(q('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(v)) || (/^07\d{9}$/.test(ph) ? rowUser(q('SELECT * FROM users WHERE phone=?').get(ph)) : null);
  if (!u || !checkPass(p, u._pass)) { failed(key); logAct('login_fail', 'المعرّف المُدخل: ' + v.slice(0, 40)); throw new Fail('بيانات الدخول غير صحيحة، يرجى المحاولة مرة أخرى.'); }
  cleared(key); ctx.startSession(u.id); logAct('login', '', u); return { me: u };
};
A.emp_login = (me, b, ctx) => {
  const m = kvGet('staff_meta', null); need(m, 'الدخول بالرقم الوظيفي غير مفعّل حالياً');
  const k = idnorm(b.id), ver = String(b.ver || ''); need(k, 'يرجى إدخال الرقم الوظيفي', 'e-id'); need(vnorm(ver), 'يرجى إدخال ' + (m.cols[m.map.ver] || 'رمز التحقق'), 'e-ver');
  const key = 'e:' + ctx.ip, wait = throttled(key);
  need(!wait, 'محاولات خاطئة كثيرة. حاول مرة أخرى بعد ' + wait + ' دقيقة.');
  const r = q('SELECT row FROM staff WHERE k=?').get(k), row = r && JSON.parse(r.row);
  if (!row || !vmatch(row[m.map.ver], ver)) { failed(key); logAct('login_fail', 'رقم وظيفي: ' + String(b.id).slice(0, 20)); throw new Fail('الرقم الوظيفي أو ' + (m.cols[m.map.ver] || 'بيانات التحقق') + ' غير صحيح.'); }
  cleared(key);
  const g = i => (i > -1 ? row[i] : '') || '', info = {}; m.cols.forEach((c, i) => { info[c] = row[i]; });
  const base = { name: g(m.map.name) || ('موظف ' + k), work: g(m.map.work), dept: g(m.map.work), job: g(m.map.job), appt: g(m.map.appt), info, infoCols: m.cols, infoKeys: { id: m.cols[m.map.id], ver: m.cols[m.map.ver] }, lastLogin: now() };
  const phone = digits(g(m.map.phone)).replace(/\s+/g, '');
  let u = rowUser(q('SELECT * FROM users WHERE emp_id=?').get(k));
  tx(() => {
    if (u) { Object.assign(u, base); if (/^07\d{9}$/.test(phone) && !q('SELECT 1 FROM users WHERE phone=? AND id<>?').get(phone, u.id)) u.phone = phone; saveUser(u); }
    else {
      let un = 'emp' + k.replace(/[^0-9a-z]/g, ''); while (q('SELECT 1 FROM users WHERE username=? COLLATE NOCASE').get(un)) un += '_';
      const ph = /^07\d{9}$/.test(phone) && !q('SELECT 1 FROM users WHERE phone=?').get(phone) ? phone : '';
      u = Object.assign({ type: 'reviewer', role: 'reviewer', empId: k, username: un, phone: ph, perms: ROLES.reviewer.perms.slice(), created: now(), _pass: hashPass(crypto.randomBytes(24).toString('hex')) }, base);
      u.id = saveUser(u); logAct('signup', base.name + ' — دخول بالرقم الوظيفي', u);
    }
  });
  u = userById(u.id); ctx.startSession(u.id); logAct('login', 'بالرقم الوظيفي', u); return { me: u };
};
A.signup = (me, b) => {
  const n = str(b.name, 80), w = str(b.work, 120), j = str(b.job, 40), birth = str(b.birth, 10), a = str(b.appt, 40), ph = digits(str(b.phone, 20)), un = str(b.username, 20), p = String(b.pass || '');
  need(words(n) >= 2, 'يرجى كتابة الاسم الثنائي على الأقل', 's-name'); need(w, 'يرجى كتابة مكان العمل', 's-work');
  need(['مدرس', 'معلم', 'إداري'].includes(j), 'يرجى اختيار العنوان الوظيفي', 's-job');
  const age = (Date.now() - new Date(birth)) / 31557600000; need(birth && age >= 18 && age <= 75, 'تاريخ التولد غير صحيح', 's-birth');
  need(['ملاك دائم', 'عقد', 'أجور', 'محاضر مجاني'].includes(a), 'يرجى اختيار نوع التعيين', 's-appt');
  need(/^07\d{9}$/.test(ph), 'رقم الهاتف غير صحيح (يبدأ بـ 07 ويتكون من 11 رقماً)', 's-phone');
  need(/^[A-Za-z0-9_.]{4,20}$/.test(un), 'اسم المستخدم: أحرف إنجليزية وأرقام فقط (4 إلى 20)', 's-user');
  need(p.length >= 6, 'كلمة المرور يجب ألا تقل عن 6 أحرف', 's-pass');
  need(!q('SELECT 1 FROM users WHERE username=? COLLATE NOCASE').get(un), 'اسم المستخدم مستخدم مسبقاً', 's-user');
  need(!q('SELECT 1 FROM users WHERE phone=?').get(ph), 'رقم الهاتف مسجل مسبقاً', 's-phone');
  const u = { type: 'reviewer', role: 'reviewer', name: n, work: w, job: j, birth, appt: a, phone: ph, username: un, dept: w, perms: ROLES.reviewer.perms.slice(), created: now(), _pass: hashPass(p) };
  u.id = saveUser(u); logAct('signup', n + ' — ' + w, u); return { username: un };
};
A.logout = (me, b, ctx) => { if (me) logAct('logout', '', me); ctx.endSession(); return {}; };
A.change_pass = (me, b) => {
  need(checkPass(String(b.old || ''), me._pass), 'كلمة المرور الحالية غير صحيحة', 'cp-old');
  need(String(b.new || '').length >= 8, 'كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف', 'cp-new');
  me._pass = hashPass(String(b.new)); saveUser(me); logAct('pass_change', '', me); return {};
};

/* --- reviewer --- */
function closedFor(me, k) { const c = svc(); if (!c[k]) return 'استقبال ' + KIND[k] + ' متوقف حالياً. ' + c.msg; if (me.block && me.block[k]) return 'تم إيقاف تقديم ' + KIND[k] + ' على حسابك مؤقتاً من قبل المديرية.'; return ''; }
A.req_submit = (me, b) => {
  perm(me, 'apply'); need(me.type !== 'admin', 'هذا الإجراء للمراجعين فقط'); const cl = closedFor(me, 'req'); need(!cl, cl);
  const type = str(b.type, 80), text = str(b.text, 3000), sig = String(b.sig || '');
  need(type, 'يرجى اختيار نوع الطلب', 'r-type'); need(text.replace('يرجى التفضل بالموافقة على', '').trim().length >= 5, 'يرجى إكمال نص الطلب', 'r-text');
  need(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length < 400000, 'يرجى التوقيع داخل المربع قبل الإرسال', 'sig');
  return tx(() => {
    const files = takeFiles(b.files), n = nextSeq('req');
    const rec = { id: n, n, no: 'QD-' + new Date().getFullYear() + '-' + String(n).padStart(5, '0'), uid: me.id, applicant: { name: me.name, work: me.work || me.dept, job: me.job, appt: me.appt },
      type, text, files, date: now(), status: ST.p, sig };
    saveReq(rec); logAct('req_submit', rec.no + ' — ' + rec.type, me); return { no: rec.no };
  });
};
A.int_submit = (me, b) => {
  perm(me, 'interview'); need(me.type !== 'admin', 'هذا الإجراء للمراجعين فقط'); const cl = closedFor(me, 'int'); need(!cl, cl);
  const target = str(b.target, 20), reason = str(b.reason, 1000);
  need(SUP_LABEL[target], 'يرجى اختيار الجهة المراد مقابلتها', 'i-with'); need(reason.length >= 5, 'يرجى كتابة سبب المقابلة', 'i-reason');
  return tx(() => {
    const files = takeFiles(b.files), n = nextSeq('int');
    const rec = { id: n, n, no: 'MQ-' + new Date().getFullYear() + '-' + String(n).padStart(5, '0'), uid: me.id, applicant: { name: me.name, work: me.work || me.dept, job: me.job, appt: me.appt },
      target, reason, files, date: now(), status: IS.p, sched: null, seen: true };
    saveInt(rec); logAct('int_submit', rec.no + ' — إلى ' + SUP_LABEL[target], me); return { no: rec.no, to: SUP_LABEL[target] };
  });
};
A.seen = (me, b) => {
  if (me.type === 'admin') return {};
  tx(() => {
    if (b.kind !== 'int') allReqs().forEach(r => { if (r.uid === me.id && r.status !== ST.p && !r.seen) { r.seen = true; saveReq(r); } });
    if (b.kind !== 'req') allInts().forEach(r => { if (r.uid === me.id && r.status === IS.s && !r.seen) { r.seen = true; saveInt(r); } });
  });
  return {};
};

/* --- staff decisions --- */
const reqById = id => rowRec(q('SELECT * FROM requests WHERE id=?').get(+id));
A.req_decide = (me, b) => {
  perm(me, 'requests_decide'); const r = reqById(b.id); need(r, 'الطلب غير موجود'); need(r.status === ST.p, 'تم اتخاذ قرار في هذا الطلب مسبقاً');
  const note = str(b.note, 300), ok = b.act === 'approve'; need(ok || b.act === 'reject', 'إجراء غير معروف');
  need(ok || note.length >= 3, 'يرجى كتابة سبب الرفض', 'n-' + r.id);
  r.status = ok ? ST.a : ST.r; r.decision = { by: me.id, byName: me.name, role: ROLES[me.role].label, at: now(), note }; r.seen = false;
  saveReq(r); logAct(ok ? 'req_approve' : 'req_reject', r.no + ' — ' + r.type + ' — ' + r.applicant.name + (note ? ' — ملاحظة: ' + note : ''), me); return {};
};
A.req_form = (me, b) => {
  perm(me, 'requests_decide'); const r = reqById(b.id); need(r, 'هذا الطلب لم يعد موجوداً.');
  const to = str(b.to, 30), ham = str(b.ham, 200), dept = str(b.dept, 120), sec = str(b.sec, 160), supKey = SUP_BY_LABEL[to];
  need(supKey, 'اختر الجهة الموجه إليها الطلب', 'f-to'); need(ham, 'يرجى اختيار الهامش أو كتابته قبل التنفيذ.', 'f-ham'); need(dept, 'يرجى اختيار القسم المعني بالتحويل.', 'f-dept');
  const known = deptsFor(supKey);
  need(known.includes(dept) || !orgFind(dept), 'هذا القسم ليس من أقسام ' + to, 'f-dept');
  if (r.form && r.form.dept !== dept) delete r.unitWork;
  let stampName = stamps()[supKey]; if (!stampName && me.role === supKey) stampName = me.name;
  r.form = { to, ham, dept, sec, by: me.id, byName: me.name, at: now(), stampName: stampName || '' };
  saveReq(r); logAct('req_form', r.no + ' — هامش: ' + ham + ' — تحويل إلى: ' + dept + (sec ? ' / ' + sec : ''), me); return {};
};
A.unit_work = (me, b) => {
  perm(me, 'unit_inbox'); const r = reqById(b.id); need(r && r.form && r.form.dept === me.unit, 'هذا الطلب ليس محوّلاً إلى قسمك');
  need(!(r.unitWork && r.unitWork.status === US.d), 'تم إنجاز هذا الطلب مسبقاً');
  const sec = str(b.sec, 160), note = str(b.note, 300), done = b.act === 'done';
  need(done || sec, 'اختر الشعبة أو الوحدة أولاً');
  const o = orgFind(me.unit); if (sec) need(o && o.o.s.includes(sec), 'الشعبة غير تابعة لقسمك');
  r.unitWork = { status: done ? US.d : US.w, sec, note, by: me.id, byName: me.unit, holder: me.holder || '', at: now() }; r.seen = false;
  saveReq(r); logAct(done ? 'unit_done' : 'unit_route', r.no + ' — ' + me.unit + (sec ? ' / ' + sec : ''), me); return {};
};
A.int_schedule = (me, b) => {
  perm(me, 'meetings'); const r = (() => { const x = q('SELECT * FROM interviews WHERE id=?').get(+b.id); return x && Object.assign(rowRec(x), { target: x.target }); })();
  need(r && r.target === me.role, 'هذا الطلب غير موجه إليك');
  const when = new Date(String(b.when || '')); need(!isNaN(when) && when.getTime() > Date.now(), 'يجب أن يكون الموعد في وقت قادم', 'mt-' + r.id);
  const again = r.status === IS.s; r.status = IS.s; r.seen = false;
  r.sched = { when: when.toISOString(), note: str(b.note, 300), by: me.id, byName: me.name, role: ROLES[me.role].label, at: now() };
  saveInt(r); logAct(again ? 'int_resched' : 'int_schedule', r.no + ' — ' + r.applicant.name + ' — ' + fwhen(r.sched.when), me); return { again };
};

/* --- accounts --- */
function cleanPerms(list) { return Array.isArray(list) ? [...new Set(list.filter(p => ADMINP.includes(p)))] : []; }
A.user_save = (me, b) => {
  perm(me, 'users_manage');
  const id = b.id ? +b.id : null, n = str(b.name, 80), d = str(b.dept, 120), un = str(b.username, 20), ph = digits(str(b.phone, 20)), p = String(b.pass || ''), role = str(b.role, 20);
  need(words(n) >= 2, 'يرجى كتابة الاسم الثنائي على الأقل', 'u-name'); need(d, 'يرجى كتابة القسم أو الجهة', 'u-dept');
  need(/^[A-Za-z0-9_.]{4,20}$/.test(un), 'أحرف إنجليزية وأرقام فقط (4 إلى 20)', 'u-user'); need(!ph || /^07\d{9}$/.test(ph), 'رقم الهاتف غير صحيح', 'u-phone');
  need((id && !p) || p.length >= 8, 'كلمة المرور يجب ألا تقل عن 8 أحرف', 'u-pass');
  need(ROLES[role] && role !== 'reviewer' && role !== 'unit', 'الدور الوظيفي غير صحيح', 'u-role');
  need(!q('SELECT 1 FROM users WHERE username=? COLLATE NOCASE AND id<>?').get(un, id || 0), 'اسم المستخدم مستخدم مسبقاً', 'u-user');
  need(!ph || !q('SELECT 1 FROM users WHERE phone=? AND id<>?').get(ph, id || 0), 'رقم الهاتف مسجل مسبقاً', 'u-phone');
  const prev = id ? userById(id) : null; if (id) need(prev && prev.type === 'admin' && prev.role !== 'unit', 'المستخدم غير موجود');
  const rec = Object.assign(prev || { created: now() }, { type: 'admin', role, name: n, dept: d, username: un, phone: ph, perms: cleanPerms(b.perms) });
  if (p) rec._pass = hashPass(p);
  const after = allUsers().filter(u => u.id !== id).concat([rec]); need(hasManager(after), 'يجب أن يبقى حساب واحد على الأقل بصلاحية إدارة المستخدمين');
  saveUser(rec); logAct(id ? 'user_edit' : 'user_add', n + ' (' + ROLES[role].label + ')', me); return {};
};
A.user_del = (me, b) => {
  perm(me, 'users_manage'); const u = userById(b.id); need(u, 'المستخدم غير موجود'); need(u.id !== me.id, 'لا يمكنك حذف حسابك');
  need(hasManager(allUsers().filter(x => x.id !== u.id)), 'لا يمكن حذف آخر حساب يملك صلاحية إدارة المستخدمين');
  q('DELETE FROM users WHERE id=?').run(u.id); q('DELETE FROM sessions WHERE uid=?').run(u.id);
  logAct('user_del', u.role === 'unit' ? u.unit + ' (حساب قسم/شعبة)' : u.name + ' (' + (u.type === 'admin' ? ROLES[u.role].label : 'مراجع') + ')', me); return {};
};
A.unit_save = (me, b) => {
  perm(me, 'users_manage');
  const unit = str(b.unit, 160), f = orgFind(unit); need(f && f.o.acc, 'القسم أو الشعبة غير موجودة في الهيكل');
  const un = str(b.username, 20), p = String(b.pass || ''), h = str(b.holder, 60);
  const prev = rowUser(q("SELECT * FROM users WHERE role='unit' AND json_extract(data,'$.unit')=?").get(unit));
  need(words(h) >= 2, 'يرجى كتابة اسم المسؤول (الاسم الثنائي على الأقل)', 'uc-name');
  need(/^[A-Za-z0-9_.]{4,20}$/.test(un), 'أحرف إنجليزية وأرقام فقط (4 إلى 20)', 'uc-user');
  need((prev && !p) || p.length >= 8, 'كلمة المرور يجب ألا تقل عن 8 أحرف', 'uc-pass');
  need(!q('SELECT 1 FROM users WHERE username=? COLLATE NOCASE AND id<>?').get(un, prev ? prev.id : 0), 'اسم المستخدم مستخدم مسبقاً', 'uc-user');
  const rec = Object.assign(prev || { type: 'admin', role: 'unit', name: unit, dept: unit, unit, sup: f.sup, phone: '', perms: ROLES.unit.perms.slice(), created: now() }, { username: un, holder: h });
  if (p) rec._pass = hashPass(p);
  saveUser(rec); logAct(prev ? 'user_edit' : 'user_add', unit + ' (حساب قسم/شعبة)', me); return {};
};
A.rv_block = (me, b) => {
  perm(me, 'users_manage'); const u = userById(b.id); need(u && u.type === 'reviewer', 'المراجع غير موجود'); const k = b.k === 'int' ? 'int' : 'req';
  u.block = Object.assign({}, u.block || {}); u.block[k] = !u.block[k]; saveUser(u);
  logAct('rv_block', (u.block[k] ? 'إيقاف ' : 'تفعيل ') + KIND[k] + ' — ' + u.name, me); return { on: u.block[k] };
};
A.rv_seen = (me, b) => { perm(me, 'users_manage'); const m = kvGet('rv_seen', {}); const at = str(b.at, 40); if (at && (!m[me.id] || at > m[me.id])) { m[me.id] = at; kvSet('rv_seen', m); } return {}; };

/* --- settings --- */
A.svc_set = (me, b) => {
  perm(me, 'users_manage'); const d = kvGet('svc', {});
  ['req', 'int'].forEach(k => { if (typeof b[k] === 'boolean') { d[k] = b[k]; logAct('svc_toggle', (b[k] ? 'تفعيل' : 'إيقاف') + ' استقبال ' + KIND[k] + ' لجميع المراجعين', me); } });
  if (typeof b.msg === 'string') { const m = str(b.msg, 400); need(!m || m.length >= 5, 'اكتب رسالة اعتذار أوضح'); d.msg = m; logAct('svc_msg', '', me); }
  kvSet('svc', d); return {};
};
A.stamps_set = (me, b) => {
  perm(me, 'users_manage'); const g = str(b.gm, 60), da = str(b.deputy_admin, 60), dt = str(b.deputy_tech, 60);
  need(words(g) >= 2, 'اكتب اسم المدير العام كاملاً', 'stp-gm');
  need(!da || words(da) >= 2, 'اكتب اسم المعاون الإداري كاملاً أو اتركه فارغاً', 'stp-da'); need(!dt || words(dt) >= 2, 'اكتب اسم المعاون الفني كاملاً أو اتركه فارغاً', 'stp-dt');
  const old = stamps(), nw = { gm: g, deputy_admin: da, deputy_tech: dt };
  const ch = Object.keys(nw).filter(k => old[k] !== nw[k]).map(k => SUP_LABEL[k] + ': ' + (nw[k] || '—'));
  kvSet('stamps', nw); logAct('stamp_names', ch.join(' • ') || 'بدون تغيير', me); return {};
};
A.staff_import = (me, b) => {
  perm(me, 'users_manage');
  const cols = Array.isArray(b.cols) ? b.cols.map(c => str(c, 120)) : [], rows = Array.isArray(b.rows) ? b.rows : [], m = b.map || {};
  need(cols.length && cols.length <= 200 && rows.length && rows.length <= 100000, 'الملف غير صالح أو كبير جداً');
  const map = {}; ['id', 'ver', 'name', 'work', 'job', 'appt', 'phone'].forEach(k => { const v = +m[k]; map[k] = Number.isInteger(v) && v >= 0 && v < cols.length ? v : -1; });
  need(map.id > -1 && map.ver > -1 && map.id !== map.ver, 'حدّد عمود الرقم الوظيفي وعمود التحقق');
  let dup = 0, empty = 0;
  tx(() => {
    q('DELETE FROM staff').run(); const ins = q('INSERT OR IGNORE INTO staff(k,row) VALUES(?,?)');
    rows.forEach(r => { const row = cols.map((_, i) => str(Array.isArray(r) ? r[i] : '', 500)); const k = idnorm(row[map.id]); if (!k) { empty++; return; } if (!ins.run(k, JSON.stringify(row)).changes) dup++; });
    kvSet('staff_meta', { file: str(b.file, 200), cols, map, at: b.keepDate && kvGet('staff_meta', null) ? kvGet('staff_meta').at : now(), by: me.name });
  });
  logAct('staff_import', str(b.file, 200) + ' — ' + rows.length + ' موظف، ' + cols.length + ' عمود', me); return { dup, empty, n: rows.length };
};
A.staff_delete = (me) => { perm(me, 'users_manage'); tx(() => { q('DELETE FROM staff').run(); q("DELETE FROM kv WHERE k='staff_meta'").run(); }); logAct('staff_delete', '', me); return {}; };
A.log = (me, b) => { const code = b.code === 'req_pdf' || b.code === 'req_print' ? b.code : null; need(code && me.type === 'admin', 'غير مسموح'); logAct(code, str(b.detail, 200), me); return {}; };

/* --- data: delete, restore, backup --- */
A.item_del = (me, b) => {
  perm(me, 'data_manage'); const kind = b.kind === 'int' ? 'int' : 'req', t = kind === 'req' ? 'requests' : 'interviews', reason = str(b.reason, 120);
  need(reason.length >= 3, 'يرجى كتابة سبب الحذف'); const row = q(`SELECT * FROM ${t} WHERE id=?`).get(+b.id); need(row, 'السجل غير موجود');
  const rec = kind === 'int' ? Object.assign(rowRec(row), { target: row.target }) : rowRec(row);
  tx(() => { q(`DELETE FROM ${t} WHERE id=?`).run(rec.id); q('INSERT INTO trash(kind,data) VALUES(?,?)').run(kind, JSON.stringify({ rec, by: { id: me.id, name: me.name, role: ROLES[me.role].label }, at: now(), reason })); });
  logAct('item_del', (kind === 'req' ? 'طلب ' : 'مقابلة ') + rec.no + ' — ' + rec.applicant.name + ' — السبب: ' + reason, me); return { no: rec.no };
};
A.item_restore = (me, b) => {
  perm(me, 'data_manage'); const t = allTrash().find(x => x.tid === +b.tid); need(t, 'العنصر غير موجود');
  const tbl = t.kind === 'req' ? 'requests' : 'interviews';
  need(!q(`SELECT 1 FROM ${tbl} WHERE id=? OR no=?`).get(t.rec.id, t.rec.no), 'تعذّر الاسترجاع: يوجد سجل بالرقم نفسه.');
  tx(() => { (t.kind === 'req' ? saveReq : saveInt)(t.rec); q('DELETE FROM trash WHERE tid=?').run(t.tid); });
  logAct('item_restore', (t.kind === 'req' ? 'طلب ' : 'مقابلة ') + t.rec.no + ' — ' + t.rec.applicant.name, me); return { no: t.rec.no, kind: t.kind };
};
function buildBackup(me) {
  return { app: 'qadisiyah-portal', backupVersion: 2, systemVersion: VERSION, exportedAt: now(), exportedBy: me.name,
    data: { users: allUsers().map(u => Object.assign(pubUser(u), { pass: u._pass })), staff: (() => { const m = kvGet('staff_meta', null); return m ? Object.assign({}, m, { rows: q('SELECT row FROM staff ORDER BY rowid').all().map(r => JSON.parse(r.row)) }) : null; })(),
      requests: allReqs(), interviews: allInts(), trash: allTrash(), log: q('SELECT * FROM log ORDER BY id').all(),
      settings: { svc: kvGet('svc', {}), stamps: kvGet('stamps', {}) }, seq: { req: kvGet('seq_req', 0), int: kvGet('seq_int', 0) } } };
}
/* restore: accepts backups from this server AND from the earlier browser-only portal */
A.restore = (me, b, ctx) => {
  perm(me, 'data_manage'); const bk = b.backup; need(bk && bk.app === 'qadisiyah-portal' && bk.data, 'هذا الملف ليس نسخة احتياطية لبوابة تربية القادسية.');
  const d = bk.data; ['requests', 'interviews', 'trash', 'log'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  need(Array.isArray(d.users) && d.users.length, 'النسخة لا تحتوي حسابات مستخدمين.');
  need(d.users.every(u => u && Number.isInteger(u.id) && typeof u.name === 'string' && typeof u.username === 'string' && typeof u.pass === 'string' && ROLES[u.role] && Array.isArray(u.perms) && (u.type === 'admin' || u.type === 'reviewer')), 'بيانات المستخدمين في النسخة غير صالحة.');
  need(hasManager(d.users), 'النسخة لا تحتوي حساباً يملك صلاحية إدارة المستخدمين.');
  const okRec = r => r && Number.isInteger(r.id) && typeof r.no === 'string' && r.applicant && Array.isArray(r.files);
  need(d.requests.every(okRec) && d.interviews.every(okRec), 'بيانات الطلبات أو المقابلات في النسخة غير صالحة.');
  const by = { id: me.id, name: me.name, role: ROLES[me.role].label }, why = 'استُبدل أثناء استعادة نسخة احتياطية', at = now();
  const curReqs = allReqs(), curInts = allInts(), curTrash = allTrash();
  tx(() => {
    const has = (arr, no) => arr.some(r => r.no === no), tr = d.trash.filter(t => t && t.rec && okRec(t.rec)), inTr = no => tr.some(t => t.rec.no === no);
    curTrash.forEach(t => { if (!has(d.requests, t.rec.no) && !has(d.interviews, t.rec.no) && !inTr(t.rec.no)) tr.push(t); });
    curReqs.forEach(r => { if (!has(d.requests, r.no) && !inTr(r.no)) tr.push({ kind: 'req', rec: r, by, at, reason: why }); });
    curInts.forEach(r => { if (!has(d.interviews, r.no) && !inTr(r.no)) tr.push({ kind: 'int', rec: r, by, at, reason: why }); });
    ['users', 'requests', 'interviews', 'trash', 'sessions'].forEach(t => q('DELETE FROM ' + t).run());
    d.users.forEach(u => {
      const pass = u.pass.startsWith('scrypt$') ? u.pass : hashPass(u.pass);   // browser-era backups hold plain passwords
      const { id, username, phone, empId, type, role, created, pass: _p, ...rest } = u;
      q('INSERT INTO users(id,username,phone,emp_id,type,role,pass,data,created) VALUES(?,?,?,?,?,?,?,?,?)').run(id, username, phone || null, empId || null, type, role === 'deputy' ? 'deputy_admin' : role, pass, JSON.stringify(rest), created || at);
    });
    d.requests.forEach(saveReq); d.interviews.forEach(r => saveInt(r));
    tr.forEach(t => q('INSERT INTO trash(kind,data) VALUES(?,?)').run(t.kind, JSON.stringify({ rec: t.rec, by: t.by, at: t.at, reason: t.reason })));
    const seen = new Set(q('SELECT at,code,name,detail FROM log').all().map(l => l.at + '|' + l.code + '|' + l.name + '|' + l.detail));
    d.log.filter(l => l && typeof l.code === 'string' && typeof l.at === 'string').forEach(l => { const k = l.at + '|' + l.code + '|' + l.name + '|' + (l.detail || ''); if (!seen.has(k)) { seen.add(k); q('INSERT INTO log(at,code,uid,name,role,detail) VALUES(?,?,?,?,?,?)').run(l.at, l.code, l.uid ?? null, l.name, l.role || '', l.detail || ''); } });
    if (d.staff && Array.isArray(d.staff.cols) && Array.isArray(d.staff.rows) && d.staff.map) {
      q('DELETE FROM staff').run(); const ins = q('INSERT OR IGNORE INTO staff(k,row) VALUES(?,?)');
      d.staff.rows.forEach(r => { const k = idnorm(r[d.staff.map.id]); if (k) ins.run(k, JSON.stringify(r)); });
      kvSet('staff_meta', { file: d.staff.file, cols: d.staff.cols, map: d.staff.map, at: d.staff.at || at, by: d.staff.by || '' });
    }
    if (d.settings) { if (d.settings.svc) kvSet('svc', d.settings.svc); if (d.settings.stamps) kvSet('stamps', d.settings.stamps); }
    if (d.seq) { kvSet('seq_req', Math.max(+d.seq.req || 0, kvGet('seq_req', 0))); kvSet('seq_int', Math.max(+d.seq.int || 0, kvGet('seq_int', 0))); }
  });
  logAct('restore', 'الملف: ' + str(b.file, 200) + ' — نسخة بتاريخ ' + str(bk.exportedAt, 40), me);
  ctx.endSession(); return { relogin: true };
};

/* ------------------------------------------------------------------- HTTP */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
function baseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', CSP); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}
function sendJSON(res, code, obj) { const body = JSON.stringify(obj); res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); }
function cookies(req) { const o = {}; (req.headers.cookie || '').split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); }); return o; }
function clientIp(req) { return (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || ''; }
function sessionUser(req) {
  const t = cookies(req).qp_sid; if (!t) return null;
  const s = q('SELECT * FROM sessions WHERE token=?').get(crypto.createHash('sha256').update(t).digest('hex'));
  if (!s || s.expires < Date.now()) return null; return userById(s.uid);
}
function readBody(req) {
  return new Promise((ok, no) => { let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { no(new Fail('حجم البيانات أكبر من المسموح', null, 413)); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { no(new Fail('طلب غير صالح')); } }); req.on('error', no); });
}
function serveStatic(req, res, p) {
  let f = path.normalize(path.join(PUBLIC_DIR, p === '/' ? 'index.html' : decodeURIComponent(p)));
  if (!f.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { f = path.join(PUBLIC_DIR, 'index.html'); }
    const ext = path.extname(f); res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
    fs.createReadStream(f).pipe(res);
  });
}
function canSeeFile(me, fid) {
  if (!me) return false;
  const P = p => hasPerm(me, p), inFiles = r => (r.files || []).some(f => f.id === fid);
  const r = allReqs().find(inFiles);
  if (r) return r.uid === me.id || (me.type === 'admin' && (P('requests_view') || P('data_manage'))) || (P('unit_inbox') && r.form && r.form.dept === me.unit);
  const i = allInts().find(inFiles);
  if (i) return i.uid === me.id || (me.type === 'admin' && (P('data_manage') || P('users_manage') || (P('meetings') && i.target === me.role)));
  return me.type === 'admin' && P('data_manage') && allTrash().some(t => inFiles(t.rec));
}

const server = http.createServer(async (req, res) => {
  baseHeaders(res);
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  const secure = COOKIE_SECURE || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
  const ctx = {
    ip: clientIp(req),
    startSession(uid) {
      const t = crypto.randomBytes(32).toString('hex'), exp = Date.now() + SESSION_DAYS * 864e5;
      q('INSERT INTO sessions(token,uid,expires) VALUES(?,?,?)').run(crypto.createHash('sha256').update(t).digest('hex'), uid, exp);
      res.setHeader('Set-Cookie', `qp_sid=${t}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
    },
    endSession() {
      const t = cookies(req).qp_sid; if (t) q('DELETE FROM sessions WHERE token=?').run(crypto.createHash('sha256').update(t).digest('hex'));
      res.setHeader('Set-Cookie', `qp_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
    },
  };
  try {
    if (p === '/api/public' && req.method === 'GET') return sendJSON(res, 200, pubState());
    if (p === '/api/state' && req.method === 'GET') { const me = sessionUser(req); return sendJSON(res, 200, me ? stateFor(me) : { me: null }); }
    if (p === '/api/act' && req.method === 'POST') {
      if (req.headers['x-requested-with'] !== 'qp') return sendJSON(res, 403, { ok: false, error: 'طلب غير مسموح' });   // blocks cross-site form posts
      const b = await readBody(req), fn = A[b.a];
      if (!fn || b.a === '__proto__') return sendJSON(res, 400, { ok: false, error: 'إجراء غير معروف' });
      let me = sessionUser(req);
      if (!me && !['login', 'emp_login', 'signup', 'logout'].includes(b.a)) return sendJSON(res, 401, { ok: false, error: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.' });
      const out = fn(me, b, ctx) || {};
      const who = out.me ? userById(out.me.id) : (out.relogin || b.a === 'logout' ? null : (me && userById(me.id)));
      delete out.me;
      return sendJSON(res, 200, Object.assign({ ok: true }, out, who ? { state: stateFor(who) } : {}));
    }
    if (p === '/api/backup' && req.method === 'GET') {
      const me = sessionUser(req); if (!me || !hasPerm(me, 'data_manage')) return sendJSON(res, 403, { error: 'غير مسموح' });
      const d = new Date(), name = `qadisiyah-backup-${d.toISOString().slice(0, 10)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.json`;
      kvSet('last_backup', now()); logAct('backup', name, me);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(buildBackup(me), null, 1));
    }
    const fm = p.match(/^\/api\/file\/([0-9a-f-]{36})$/);
    if (fm && req.method === 'GET') {
      const me = sessionUser(req), f = q('SELECT * FROM files WHERE id=?').get(fm[1]);
      if (!f || !canSeeFile(me, f.id)) return sendJSON(res, 404, { error: 'الملف غير موجود' });
      res.writeHead(200, { 'Content-Type': f.type || 'application/octet-stream', 'Content-Length': f.size, 'Cache-Control': 'private, max-age=600',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" });
      return fs.createReadStream(path.join(UPLOAD_DIR, f.id)).pipe(res);
    }
    if (p === '/healthz') return sendJSON(res, 200, { ok: true });
    if (p.startsWith('/api/') || !SERVE_STATIC) return sendJSON(res, 404, { error: 'غير موجود' });
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, p);
  } catch (e) {
    if (e instanceof Fail) return sendJSON(res, e.status, { ok: false, error: e.message, field: e.field || undefined });
    console.error(e); return sendJSON(res, 500, { ok: false, error: 'حدث خطأ في الخادم' });
  }
});
setInterval(() => { q('DELETE FROM sessions WHERE expires<?').run(Date.now()); }, 3600e3).unref();
if (require.main === module) server.listen(PORT, HOST, () => console.log(`بوابة تربية القادسية تعمل على http://localhost:${PORT}  (البيانات في ${DATA_DIR})`));
module.exports = { server, db };
