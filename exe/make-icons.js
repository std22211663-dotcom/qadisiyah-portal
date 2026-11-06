/* node exe/make-icons.js
   Extracts the ministry emblem embedded in public/index.html (<symbol id="emblem">) and renders the app icons with Chrome (no dependencies):
   public/icons/icon-192.png, icon-512.png (transparent), maskable-512.png (Android adaptive, on brand colour), apple-touch-icon.png (180, opaque),
   favicon-32.png, and exe/app.ico (16-256, PNG-compressed) for the Windows launcher/installer. */
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { launch } = require('../tutorial/cdp');
const root = path.join(__dirname, '..'), html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const m = html.match(/<symbol id="emblem"[^>]*><image href="(data:image\/[a-z]+;base64,[^"]+)"/);
if (!m) throw new Error('emblem not found in public/index.html');
const BRAND = '#0a2f6b';
const page = path.join(os.tmpdir(), 'qp-icons.html'); fs.writeFileSync(page, '<!doctype html><meta charset=utf-8><body style="margin:0">');
const js = `(async()=>{
  const img=new Image(); img.src=${JSON.stringify(m[1])}; await img.decode();
  const draw=(size,{bg,pad})=>{const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.imageSmoothingQuality='high';
    if(bg){x.fillStyle=bg;x.fillRect(0,0,size,size)}
    const k=Math.min(1,(size*(1-2*pad))/Math.max(img.width,img.height)*1)||1, w=img.width/Math.max(img.width,img.height)*size*(1-2*pad), h=img.height/Math.max(img.width,img.height)*size*(1-2*pad);
    x.drawImage(img,(size-w)/2,(size-h)/2,w,h);return c.toDataURL('image/png').split(',')[1]};
  return {w:img.width,h:img.height,
    'icon-192':draw(192,{pad:.04}),'icon-512':draw(512,{pad:.04}),'maskable-512':draw(512,{bg:${JSON.stringify(BRAND)},pad:.17}),
    'apple-touch-icon':draw(180,{bg:'#ffffff',pad:.08}),'favicon-32':draw(32,{pad:0}),
    i16:draw(16,{pad:0}),i32:draw(32,{pad:0}),i48:draw(48,{pad:0}),i64:draw(64,{pad:0}),i128:draw(128,{pad:0}),i256:draw(256,{pad:.02})}})()`;
(async () => {
  const b = await launch('file:///' + page.replace(/\\/g, '/'), { port: 9334, width: 600, height: 400 });
  try {
    const r = await b.evaluate(js); console.log('emblem', r.w + 'x' + r.h);
    const out = path.join(root, 'public', 'icons'); fs.mkdirSync(out, { recursive: true });
    for (const k of ['icon-192', 'icon-512', 'maskable-512', 'apple-touch-icon', 'favicon-32']) fs.writeFileSync(path.join(out, k + '.png'), Buffer.from(r[k], 'base64'));
    const sizes = [16, 32, 48, 64, 128, 256], pngs = sizes.map(s => Buffer.from(r['i' + s], 'base64'));
    const head = Buffer.alloc(6 + 16 * sizes.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
    let off = head.length; sizes.forEach((s, i) => { const o = 6 + 16 * i; head[o] = s === 256 ? 0 : s; head[o + 1] = s === 256 ? 0 : s; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(pngs[i].length, o + 8); head.writeUInt32LE(off, o + 12); off += pngs[i].length; });
    fs.writeFileSync(path.join(__dirname, 'app.ico'), Buffer.concat([head, ...pngs])); console.log('icons written');
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
