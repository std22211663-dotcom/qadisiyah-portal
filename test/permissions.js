/* finer permissions: each action needs exactly its own permission, and accounts saved before the split are migrated */
const B = process.env.QP_BASE || 'http://localhost:3999'; let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL:', m, x ? JSON.stringify(x) : ''); } };
function client() {
  let ck = ''; const f = async (p, o = {}) => { const r = await fetch(B + p, Object.assign({}, o, { headers: Object.assign({ cookie: ck }, o.headers || {}) })); const sc = r.headers.get('set-cookie'); if (sc) ck = sc.split(';')[0]; return r; };
  return { f, act: async (a, b = {}) => (await f('/api/act', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'qp' }, body: JSON.stringify(Object.assign({ a }, b)) })).json(), state: async () => (await f('/api/state')).json() };
}
const NOPERM = 'ليست لديك صلاحية';
const denied = j => !j.ok && String(j.error || '').includes(NOPERM);
const PASS = 'Test@1234';
let n = 0;
async function account(ad, perms, role = 'officer') {
  const un = 'tester' + (++n), j = await ad.act('user_save', { name: 'موظف اختبار ' + n, dept: 'قسم الاختبار', username: un, phone: '', pass: PASS, role, perms });
  ok(j.ok, 'create account with ' + perms.join(','), j);
  const c = client(); const l = await c.act('login', { u: un, p: PASS }); ok(l.ok, 'login ' + un, l); return c;
}

(async () => {
  const ad = client(); await ad.act('login', { u: 'admin', p: 'Admin@123' });
  const st0 = await ad.state();
  const ALL = ['requests_view', 'requests_decide', 'requests_transfer', 'meetings', 'settings', 'users_manage', 'reviewers_manage', 'support_manage', 'svc_manage', 'stamps_manage', 'staff_import', 'backup_export', 'backup_restore', 'item_delete', 'item_restore', 'audit_view'];
  ok(ALL.every(p => st0.me.perms.includes(p)) && !st0.me.perms.includes('data_manage'), 'the director general holds every finer permission', st0.me.perms);

  /* a settings-only helper can switch services but nothing else */
  const svc = await account(ad, ['settings', 'svc_manage']);
  ok((await svc.act('svc_set', { req: false })).ok, 'svc_manage can switch the services');
  ok(denied(await svc.act('stamps_set', { gm: 'اسم', deputy_admin: 'اسم', deputy_tech: 'اسم' })), 'svc_manage cannot change the stamp names');
  ok(denied(await svc.act('support_status', { id: 1, done: true })), 'svc_manage cannot close support messages');
  ok(denied(await svc.act('rv_block', { id: 1 })), 'svc_manage cannot manage reviewers');
  ok(denied(await svc.act('staff_delete')), 'svc_manage cannot touch the staff list');
  ok(denied(await svc.act('user_save', { name: 'x y', dept: 'd', username: 'abcd', pass: PASS, role: 'officer', perms: [] })), 'svc_manage cannot create accounts');
  ok((await svc.f('/api/backup')).status === 403, 'svc_manage cannot download a backup');
  const sst = await svc.state(); ok(!sst.support && !sst.trash && !sst.staff, 'svc_manage receives no support messages, trash or staff list', Object.keys(sst));

  /* stamp names and support messages are separate from services */
  const stp = await account(ad, ['settings', 'stamps_manage', 'support_manage']);
  ok((await stp.act('stamps_set', { gm: 'اسم المدير', deputy_admin: 'اسم المعاون الاداري', deputy_tech: 'اسم المعاون الفني' })).ok, 'stamps_manage can change the stamp names');
  ok(denied(await stp.act('svc_set', { req: true })), 'stamps_manage cannot switch the services');
  ok(Array.isArray((await stp.state()).support), 'support_manage receives the support messages');

  /* reviewers only */
  const rv = await account(ad, ['settings', 'reviewers_manage']);
  ok(!denied(await rv.act('rv_block', { id: 99999 })), 'reviewers_manage can reach the reviewer actions');
  const rst = await rv.state(); ok(rst.users.every(u => u.type === 'reviewer' || u.phone === undefined), 'reviewers_manage does not see the staff contact details');
  ok(denied(await rv.act('user_del', { id: 1 })), 'reviewers_manage cannot delete staff accounts');

  /* approve/reject is separate from the hamish + transfer */
  const dec = await account(ad, ['requests_view', 'requests_decide', 'settings'], 'head');
  ok(denied(await dec.act('req_form', { id: 1 })), 'requests_decide alone cannot write the hamish / transfer');
  ok(!denied(await dec.act('req_decide', { id: 99999, ok: true })), 'requests_decide can approve or reject');
  const tr = await account(ad, ['requests_view', 'requests_transfer', 'settings'], 'head');
  ok(!denied(await tr.act('req_form', { id: 99999 })), 'requests_transfer can write the hamish / transfer');
  ok(denied(await tr.act('req_decide', { id: 99999, ok: true })), 'requests_transfer alone cannot approve or reject');

  /* data: export, restore, delete and trash are four permissions */
  const ex = await account(ad, ['settings', 'backup_export']);
  const bkRes = await ex.f('/api/backup'); ok(bkRes.status === 200, 'backup_export can download a backup');
  const bk = await bkRes.json();
  ok(denied(await ex.act('restore', { backup: bk, file: 'x.json' })), 'backup_export cannot restore');
  ok(denied(await ex.act('item_del', { kind: 'req', id: 1, reason: 'x' })), 'backup_export cannot delete requests');
  ok(denied(await ex.act('item_restore', { tid: 1 })), 'backup_export cannot bring items back from the trash');
  const del = await account(ad, ['settings', 'item_delete']);
  ok(!denied(await del.act('item_del', { kind: 'req', id: 99999, reason: 'اختبار' })), 'item_delete can delete requests');
  ok((await del.f('/api/backup')).status === 403, 'item_delete cannot download a backup');
  const trs = await account(ad, ['settings', 'item_restore']);
  ok(!denied(await trs.act('item_restore', { tid: 99999 })), 'item_restore can bring items back');
  ok(denied(await trs.act('item_del', { kind: 'req', id: 1, reason: 'x' })), 'item_restore cannot delete');
  ok(Array.isArray((await trs.state()).trash), 'item_restore sees the trash');

  /* accounts saved before the split are migrated, also when they arrive inside a backup */
  const old = JSON.parse(JSON.stringify(bk)), hash = old.data.users.find(u => u.username === 'admin').pass;
  old.data.users.push({ id: 9001, type: 'admin', role: 'head', name: 'مدير قديم', dept: 'قسم', username: 'oldmgr', phone: '', pass: hash, perms: ['requests_view', 'requests_decide', 'users_manage', 'data_manage'], created: new Date().toISOString() });
  const rj = await ad.act('restore', { backup: old, file: 'old.json' }); ok(rj.ok, 'restore a backup that holds an old-style account', rj);
  const oc = client(); const ol = await oc.act('login', { u: 'oldmgr', p: 'Admin@123' }); ok(ol.ok, 'old-style account can log in', ol);
  const op = (await oc.state()).me.perms;
  ok(['users_manage', 'reviewers_manage', 'support_manage', 'svc_manage', 'stamps_manage', 'staff_import', 'backup_export', 'backup_restore', 'item_delete', 'item_restore', 'requests_decide', 'requests_transfer'].every(p => op.includes(p)), 'old permissions expand to the finer ones they covered', op);
  ok(!op.includes('data_manage') && !op.includes('meetings') && !op.includes('audit_view'), 'nothing extra is granted, and data_manage is gone', op);

  console.log(`done: ${pass} passed, ${fail} failed`);
})().catch(e => console.log('CRASH', e));
