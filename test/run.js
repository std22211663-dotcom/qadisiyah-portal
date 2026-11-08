/* npm test — every suite runs against its own throw-away server (fresh database, random free port); nothing touches ./data */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const root = path.join(__dirname, '..');
const suites = [['smoke.js'], ['employee-login.js'], ['profile.js'], ['duplicates.js'], ['seed.js', 'backup.js']];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function up(base) { for (let i = 0; i < 60; i++) { try { if ((await fetch(base + '/healthz')).ok) return true; } catch (e) { } await sleep(250); } return false; }
(async () => {
  let failed = 0, passed = 0;
  for (let i = 0; i < suites.length; i++) {
    const port = 39100 + i, base = 'http://localhost:' + port, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-test-'));
    const srv = spawn(process.execPath, ['server.js'], { cwd: root, env: Object.assign({}, process.env, { PORT: String(port), DATA_DIR: dir }), stdio: 'ignore' });
    try {
      if (!(await up(base))) { console.log('FAIL: server did not start for', suites[i].join(' + ')); failed++; continue; }
      for (const f of suites[i]) {
        const r = spawnSync(process.execPath, [path.join(__dirname, f)], { env: Object.assign({}, process.env, { QP_BASE: base }), encoding: 'utf8' });
        const out = (r.stdout || '') + (r.stderr || ''), m = out.match(/done: (\d+) passed, (\d+) failed/);
        if (f === 'seed.js') continue;                      // helper: only prepares data for the next file
        console.log(f.padEnd(22), m ? m[0] : 'NO RESULT');
        if (!m || +m[2] || r.status) { failed++; console.log(out.split('\n').filter(l => /FAIL|CRASH|Error/.test(l)).join('\n')); } else passed += +m[1];
      }
    } finally { srv.kill(); await sleep(300); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } }
  }
  console.log(failed ? '\n' + failed + ' suite(s) failed' : '\nall ' + passed + ' checks passed');
  process.exit(failed ? 1 : 0);
})();
