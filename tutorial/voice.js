/* Narration clips for the tutorial videos. Pick an engine with TTS_ENGINE=azure|google|windows (auto-detected when unset):
     azure   : official Azure Speech REST API  -> AZURE_SPEECH_KEY, AZURE_SPEECH_REGION   (voice: TTS_VOICE, default ar-SA-HamedNeural)
     google  : official Google Cloud Text-to-Speech -> GOOGLE_TTS_KEY                      (voice: TTS_VOICE, default ar-XA-Wavenet-B)
     windows : a local Arabic voice (WinRT, see winrt-tts.ps1) (installed in Windows Settings > Time & language > Speech)
   Keys can be put in tutorial/.env.local (git-ignored), one KEY=VALUE per line.
   Clips are cached in output/audio/<hash>.<ext>, so unchanged sentences are never synthesised twice. */
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path'), { spawnSync } = require('node:child_process');
const DIR = path.join(__dirname, 'output', 'audio');
try {
  fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8').split('\n').forEach(line => {
    const i = line.indexOf('='); if (i < 1) return;
    const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (/^[A-Z_]+$/.test(k) && !(k in process.env)) process.env[k] = v;
  });
} catch (e) { /* no env file */ }
const speechText = t => String(t).replace(/\s*—\s*/g, '. ').replace(/\s+/g, ' ').trim();
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const PS1 = path.join(__dirname, 'winrt-tts.ps1');
function localArabicVoice() {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-List'], { encoding: 'utf8' });
  return (r.stdout || '').split('\n').map(x => x.trim()).filter(x => / \| ar/i.test(x)).map(x => x.split('|')[0].trim())[0] || null;
}
function engine() {
  const e = (process.env.TTS_ENGINE || '').toLowerCase();
  if (e) return e;
  if (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) return 'azure';
  if (process.env.GOOGLE_TTS_KEY) return 'google';
  if (localArabicVoice()) return 'windows';
  return null;
}
const rate = () => process.env.TTS_RATE || '-6%';

async function synthAzure(text, file) {
  const voice = process.env.TTS_VOICE || 'ar-SA-HamedNeural';
  const r = await fetch('https://' + process.env.AZURE_SPEECH_REGION + '.tts.speech.microsoft.com/cognitiveservices/v1', {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'qadisiyah-tutorial' },
    body: "<speak version='1.0' xml:lang='ar-SA'><voice name='" + voice + "'><prosody rate='" + rate() + "'>" + esc(text) + '</prosody></voice></speak>'
  });
  if (!r.ok) throw new Error('azure tts ' + r.status + ' ' + (await r.text()).slice(0, 120));
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
async function synthGoogle(text, file) {
  const voice = process.env.TTS_VOICE || 'ar-XA-Wavenet-B', pct = 1 + (parseFloat(rate()) || 0) / 100;
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(process.env.GOOGLE_TTS_KEY), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice: { languageCode: 'ar-XA', name: voice }, audioConfig: { audioEncoding: 'MP3', speakingRate: pct } })
  });
  const j = await r.json(); if (!r.ok) throw new Error('google tts ' + r.status + ' ' + JSON.stringify(j).slice(0, 120));
  fs.writeFileSync(file, Buffer.from(j.audioContent, 'base64'));
}
function synthWindows(text, file) {
  const voice = process.env.TTS_VOICE || localArabicVoice(); if (!voice) throw new Error('no Arabic Windows voice installed');
  const tmp = file + '.txt'; fs.writeFileSync(tmp, text, 'utf8');
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-TextFile', tmp, '-Out', file, '-Voice', voice.replace(/^Microsoft /, ''), '-Rate', String(process.env.TTS_WIN_RATE || 0.9)], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch (e) { }
  if (r.status !== 0 || !fs.existsSync(file)) throw new Error('windows tts failed: ' + (r.stderr || r.stdout || '').slice(0, 160));
}

/* returns { sentence -> { file, ext } } for every distinct sentence */
async function clips(texts, log = console.log) {
  const eng = engine(); if (!eng) return null; fs.mkdirSync(DIR, { recursive: true });
  const ext = eng === 'windows' ? 'wav' : 'mp3', out = {}; let made = 0, cached = 0;
  for (const t of [...new Set(texts)]) {
    const sp = speechText(t), h = crypto.createHash('sha1').update(JSON.stringify([eng, process.env.TTS_VOICE || '', rate(), sp])).digest('hex').slice(0, 16), file = path.join(DIR, h + '.' + ext);
    if (!fs.existsSync(file)) {
      let last; for (let i = 0; i < 3; i++) { try { eng === 'azure' ? await synthAzure(sp, file) : eng === 'google' ? await synthGoogle(sp, file) : synthWindows(sp, file); last = null; break; } catch (e) { last = e; await new Promise(r => setTimeout(r, 1500)); } }
      if (last) throw last; made++;
    } else cached++;
    out[t] = { file, ext };
  }
  log('voice (' + eng + '): ' + made + ' new clips, ' + cached + ' cached'); return out;
}
module.exports = { engine, clips, speechText, localArabicVoice };
