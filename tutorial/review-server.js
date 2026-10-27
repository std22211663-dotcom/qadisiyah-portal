/* serves tutorial/output on :3990 for reviewing the recorded videos in a browser (range requests supported) */
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'); const dir = path.join(__dirname, 'output');
http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0].slice(1));
  if (!name) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<meta charset=utf-8><body style="margin:0;background:#111"><video id=v controls style="width:100%"></video>'); }
  const f = path.join(dir, path.basename(name)); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, r = req.headers.range;
  if (r) { const [a, b] = r.replace('bytes=', '').split('-'), s = +a, e = b ? +b : size - 1; res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': 'video/mp4' }); fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  else { res.writeHead(200, { 'Content-Length': size, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(res); }
}).listen(3990, () => console.log('review server on 3990'));
