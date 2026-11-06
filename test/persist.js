/* cloud.js + persist.js against a fake Cloud Storage bucket: data written through the API survives a restart on an empty disk. Starts its own servers. */
const http = require('node:http'), { spawn } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = path.join(__dirname, '..'), sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL:', m, x ? JSON.stringify(x) : ''); } };

const store = new Map();   // object name -> Buffer
const gcs = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), chunks = [];
  req.on('data', c => chunks.push(c)); req.on('end', () => {
    if (req.headers.authorization !== 'Bearer test-token') { res.writeHead(401); return res.end('no auth'); }
    let m;
    if (req.method === 'POST' && u.pathname === '/upload/storage/v1/b/bk/o') { store.set(u.searchParams.get('name'), Buffer.concat(chunks)); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{}'); }
    if (req.method === 'GET' && u.pathname === '/storage/v1/b/bk/o') {
      const p = u.searchParams.get('prefix') || ''; res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ items: [...store.keys()].filter(k => k.startsWith(p)).map(name => ({ name })) }));
    }
    if (req.method === 'GET' && (m = u.pathname.match(/^\/storage\/v1\/b\/bk\/o\/(.+)$/)) && store.has(decodeURIComponent(m[1]))) { res.writeHead(200); return res.end(store.get(decodeURIComponent(m[1]))); }
    res.writeHead(404); res.end('nf');
  });
});

async function boot(port, dir, gport) {
  const srv = spawn(process.execPath, ['cloud.js'], { cwd: root, stdio: 'ignore', env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: dir, GCS_BUCKET: 'bk', GCS_API: 'http://127.0.0.1:' + gport, GCS_TOKEN: 'test-token' }) });
  for (let i = 0; i < 60; i++) { try { if ((await fetch('http://localhost:' + port + '/healthz')).ok) return srv; } catch (e) { } await sleep(250); }
  srv.kill(); throw new Error('server did not start');
}
function client(base) {
  let ck = ''; const f = async (p, o = {}) => { const r = await fetch(base + p, Object.assign({}, o, { headers: Object.assign({ cookie: ck }, o.headers || {}) })); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; return r; };
  return { f, act: async (a, b = {}) => (await f('/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'qp' }, body: JSON.stringify(Object.assign({ a }, b)) })).json() };
}

(async () => {
  await new Promise(r => gcs.listen(0, '127.0.0.1', r)); const gport = gcs.address().port;
  const d1 = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-pa-')), d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-pb-'));
  let s1, s2;
  try {
    s1 = await boot(39190, d1, gport);
    ok(store.has('data/portal.db'), 'first start stores the new database in the bucket');
    const c = client('http://localhost:39190');
    const sg = await c.act('support_submit', { name: 'حسن علي كريم', work: 'مدرسة', job: 'اداري', text: 'رسالة اختبار الحفظ', files: [{ name: 'a.png', type: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' }] });
    ok(sg.ok, 'support message accepted', sg);
    ok([...store.keys()].some(k => /^data\/uploads\/[0-9a-f-]{36}$/.test(k)), 'the uploaded file reached the bucket');
    const before = store.get('data/portal.db').length;
    const ad = client('http://localhost:39190'); const lg = await ad.act('login', { u: 'admin', p: 'Admin@123' }); ok(lg.ok, 'admin login', lg);
    s1.kill(); await sleep(500);
    // a brand-new empty disk: everything must come back from the bucket
    s2 = await boot(39191, d2, gport);
    const a2 = client('http://localhost:39191'); const l2 = await a2.act('login', { u: 'admin', p: 'Admin@123' }); ok(l2.ok, 'admin can log in after the restart on an empty disk', l2);
    const st = await (await a2.f('/api/state')).json();
    ok(st.support && st.support.length === 1 && st.support[0].text === 'رسالة اختبار الحفظ', 'the support message survived the restart', st.support);
    const fid = st.support[0].files[0].id, fr = await a2.f('/api/file/' + fid);
    ok(fr.status === 200 && (await fr.arrayBuffer()).byteLength > 50, 'the uploaded file is readable after the restart');
    ok(before > 0, 'database snapshot is not empty');
  } finally { try { s1 && s1.kill(); s2 && s2.kill(); } catch (e) { } gcs.close(); await sleep(300); for (const d of [d1, d2]) try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { } }
  console.log(`done: ${pass} passed, ${fail} failed`);
})().catch(e => { console.log('CRASH', e); });
