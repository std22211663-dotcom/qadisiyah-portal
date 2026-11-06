/* Durable storage for hosts with an ephemeral disk (Google Cloud Run). No dependencies.
   The local DATA_DIR stays the working copy; with GCS_BUCKET set, everything in it is mirrored to that Cloud Storage bucket:
   - restore(dataDir): before the database is opened, download portal.db and uploads/* from the bucket
   - sync(db, dataDir): after every request that changed data, write a consistent snapshot of the database (VACUUM INTO) and any new upload
   Auth: the Cloud Run service account through the metadata server (or GCS_TOKEN for tests); GCS_API overrides the endpoint (tests use a fake bucket). */
const fs = require('node:fs'), path = require('node:path');
const BUCKET = process.env.GCS_BUCKET, API = (process.env.GCS_API || 'https://storage.googleapis.com').replace(/\/$/, ''), PREFIX = 'data/';
const enabled = () => !!BUCKET;

let tok = null;
async function token() {
  if (process.env.GCS_TOKEN) return process.env.GCS_TOKEN;
  if (tok && tok.exp > Date.now() + 60e3) return tok.v;
  const r = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error('metadata token ' + r.status);
  const j = await r.json(); tok = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 }; return tok.v;
}
async function gcs(url, opts = {}) {
  const r = await fetch(API + url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + await token() }, opts.headers || {}) }));
  if (!r.ok) throw new Error('gcs ' + r.status + ' ' + (await r.text()).slice(0, 160));
  return r;
}
const obj = name => encodeURIComponent(PREFIX + name);

async function list() {
  const out = []; let page = '';
  do {
    const j = await (await gcs('/storage/v1/b/' + BUCKET + '/o?prefix=' + encodeURIComponent(PREFIX) + (page ? '&pageToken=' + encodeURIComponent(page) : ''))).json();
    (j.items || []).forEach(i => out.push(i.name.slice(PREFIX.length))); page = j.nextPageToken || '';
  } while (page);
  return out;
}
async function put(name, file) {
  await gcs('/upload/storage/v1/b/' + BUCKET + '/o?uploadType=media&name=' + encodeURIComponent(PREFIX + name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(file) });
}

const known = new Set();   // upload ids already in the bucket
async function restore(dataDir) {
  if (!enabled()) return;
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  const names = await list(); let n = 0;
  for (const name of names) {
    if (!/^(portal\.db|uploads\/[0-9a-f-]{36})$/.test(name)) continue;
    const buf = Buffer.from(await (await gcs('/storage/v1/b/' + BUCKET + '/o/' + obj(name) + '?alt=media')).arrayBuffer());
    fs.writeFileSync(path.join(dataDir, name), buf); if (name.startsWith('uploads/')) known.add(name.slice(8)); n++;
  }
  console.log('persist: restored ' + n + ' file(s) from gs://' + BUCKET);
}

let chain = Promise.resolve();
function sync(db, dataDir) {
  if (!enabled()) return Promise.resolve();
  chain = chain.then(async () => {
    const up = path.join(dataDir, 'uploads');
    for (const id of fs.readdirSync(up)) if (!known.has(id) && /^[0-9a-f-]{36}$/.test(id)) { await put('uploads/' + id, path.join(up, id)); known.add(id); }
    const snap = path.join(dataDir, 'snapshot.db'); try { fs.unlinkSync(snap); } catch (e) { }
    db.exec("VACUUM INTO '" + snap.replace(/'/g, "''") + "'");
    try { await put('portal.db', snap); } finally { try { fs.unlinkSync(snap); } catch (e) { } }
  }).catch(e => { console.error('persist: sync failed -', e.message); });
  return chain;
}
module.exports = { enabled, restore, sync };
