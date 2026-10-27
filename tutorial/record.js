/* node tutorial/record.js manager|reviewer [--dry]
   Starts a throw-away portal (fresh database + demo data), opens it in Chrome, plays the scenes with the "director" and records the tab to
   tutorial/output/<name>.mp4 (+ the narration text). --dry plays the scenes fast without recording, to debug them. */
const { spawn } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { launch, sleep } = require('./cdp'); const seed = require('./seed');
const which = process.argv[2], dry = process.argv.includes('--dry'), PORT = 3997, base = 'http://localhost:' + PORT;
const NAMES = { manager: 'شرح-استخدام-المدير-والمعاونين-والأقسام', reviewer: 'شرح-استخدام-المراجع' };
if (!NAMES[which]) { console.log('usage: node tutorial/record.js manager|reviewer [--dry]'); process.exit(1); }
const out = path.join(__dirname, 'output'); fs.mkdirSync(out, { recursive: true });

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-tut-'));
  const srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: dir }), stdio: 'ignore' });
  let b;
  const cleanup = async () => { try { if (b) await b.close(); } catch (e) { } srv.kill(); await sleep(400); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } };
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch (e) { } await sleep(250); }
    await (which === 'manager' ? seed.seedManager(base) : seed.seedReviewer(base)); console.log('demo data ready');
    b = await launch(base + '/', { width: 1296, height: 815 }); await sleep(2500);
    const info = await b.evaluate('({w:innerWidth,h:innerHeight,dpr:devicePixelRatio})'); console.log('viewport', info);
    await b.evaluate(fs.readFileSync(path.join(__dirname, 'director.js'), 'utf8')); await b.evaluate(fs.readFileSync(path.join(__dirname, 'scenes-' + which + '.js'), 'utf8'));
    if (dry) await b.evaluate('D.speed=0.22');
    else { const r = await b.evaluate('D.rec.start()'); console.log('recording', r); }
    await b.evaluate("window.__done=null;window.__want=null;(async()=>{try{await window.RUN();window.__done='ok'}catch(e){window.__done='ERR: '+(e&&e.message)+' @ '+window.__cur}})();'started'");
    let last = ''; const t0 = Date.now();
    for (; ;) {
      await sleep(700);
      const st = await b.evaluate('({d:window.__done,w:window.__want,c:window.__cur})');
      if (st.c !== last) { last = st.c; console.log(((Date.now() - t0) / 1000 | 0) + 's  ' + st.c); }
      if (st.w) { console.log('   (behind the scenes: ' + st.w + ')'); await seed.managerProcess(base); await b.evaluate('window.__want=null'); }
      if (st.d) { if (st.d !== 'ok') { console.log('FAILED:', st.d); try { fs.writeFileSync(path.join(out, 'error.png'), Buffer.from((await b.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64')); } catch (e) { } process.exitCode = 1; } break; }
    }
    if (!dry && !process.exitCode) {
      const s = await b.evaluate('D.rec.stop()'); console.log('stopped', s); const ext = s.mime.startsWith('video/mp4') ? 'mp4' : 'webm', parts = [];
      for (let o = 0; o < s.size; o += 1048576) parts.push(Buffer.from(await b.evaluate(`(async()=>{const a=new Uint8Array(await window.__blob.slice(${o},${Math.min(o + 1048576, s.size)}).arrayBuffer());let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode.apply(null,a.subarray(i,i+8192));return btoa(s)})()`), 'base64'));
      const file = path.join(out, NAMES[which] + '.' + ext); fs.writeFileSync(file, Buffer.concat(parts)); console.log('saved', file, (Buffer.concat(parts).length / 1048576).toFixed(1) + ' MB');
      const script = await b.evaluate('D.script'); let txt = '', n = 0;
      script.forEach(x => { if (x.heading && x.step) txt += '\n\n== الخطوة ' + x.step + ': ' + x.title + ' ==\n'; else if (x.heading) txt += '\n[' + x.text + ']\n'; else txt += (++n) + '. ' + x.text + '\n'; });
      fs.writeFileSync(path.join(out, NAMES[which] + ' - نص الشرح.txt'), '﻿' + txt.trim() + '\n'); console.log('narration text saved');
    }
  } catch (e) { console.log('ERROR', e && e.message); process.exitCode = 1; } finally { await cleanup(); }
})();
