/* Entry point for Cloud Run: restores the data from Cloud Storage, starts the portal, and mirrors every change back (see persist.js). */
const path = require('node:path');
const persist = require('./persist');
const PORT = +process.env.PORT || 8080, HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
(async () => {
  await persist.restore(DATA_DIR);
  const { server, db, hooks } = require('./server');
  hooks.persist = () => persist.sync(db, DATA_DIR);
  await persist.sync(db, DATA_DIR);   // first start: stores the freshly created database
  server.listen(PORT, HOST, () => console.log('portal on ' + PORT + ' (data ' + DATA_DIR + ', bucket ' + (process.env.GCS_BUCKET || 'none') + ')'));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
})().catch(e => { console.error(e); process.exit(1); });
