/* tiny Chrome DevTools helper (no dependencies): launches Chrome, drives a page, records the tab to a video file */
const { spawn } = require('node:child_process'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function launch(url, { port = 9333, width = 1280, height = 800 } = {}) {
  if (!CHROME) throw new Error('Chrome/Edge not found');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qp-chrome-'));
  const proc = spawn(CHROME, ['--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--window-size=' + width + ',' + height, '--window-position=40,20', '--force-device-scale-factor=1.5',
    '--auto-accept-this-tab-capture', '--no-first-run', '--no-default-browser-check', '--disable-infobars', '--disable-features=Translate,CalculateNativeWinOcclusion',
    '--autoplay-policy=no-user-gesture-required', '--lang=ar', url], { stdio: 'ignore' });
  let list; for (let i = 0; i < 60; i++) { try { list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); if (list.some(t => t.type === 'page')) break; } catch (e) { } await sleep(250); }
  const t = list.find(t => t.type === 'page'); const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let id = 0; const wait = new Map(); ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}) => new Promise(ok => { const i = ++id; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression, opts = {}) => { const r = await send('Runtime.evaluate', Object.assign({ expression, awaitPromise: true, returnByValue: true, userGesture: true }, opts)); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails)); return r.result.result.value; };
  const close = async () => { try { await send('Browser.close'); } catch (e) { } try { proc.kill(); } catch (e) { } await sleep(600); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } };
  return { send, evaluate, close, proc };
}
module.exports = { launch, sleep };
