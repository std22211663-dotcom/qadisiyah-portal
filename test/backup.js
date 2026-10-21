const B=process.env.QP_BASE||'http://localhost:3999';let pass=0,fail=0;const ok=(c,m,x)=>{if(c)pass++;else{fail++;console.log('FAIL:',m,x?JSON.stringify(x):'')}};
function client(){let ck='';const f=async(p,o={})=>{const r=await fetch(B+p,Object.assign({},o,{headers:Object.assign({cookie:ck},o.headers||{})}));const sc=r.headers.get('set-cookie');if(sc){const m=sc.match(/qp_sid=([^;]*)/);ck=m&&m[1]?'qp_sid='+m[1]:''}return r};
 return{f,act:async(a,b={})=>(await f('/api/act',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'qp'},body:JSON.stringify(Object.assign({a},b))})).json(),state:async()=>(await f('/api/state')).json()}}
(async()=>{const ad=client();await ad.act('login',{u:'admin',p:'Admin@123'});
 let st=await ad.state();ok(st.support.length===1,'one support msg before');
 await ad.act('support_status',{id:st.support[0].id,done:true});
 const bk=await (await ad.f('/api/backup')).json();ok(Array.isArray(bk.data.support)&&bk.data.support.length===1&&bk.data.support[0].status==='تمت المعالجة','backup carries support messages',bk.data.support);
 ok(!JSON.stringify(bk.data.support).includes('127.0.0.1'),'backup does not contain ip addresses');
 // a new message arrives after the backup was taken
 await client().act('support_submit',{name:'حسن علي كريم',work:'مدرسة',job:'اداري',text:'رسالة بعد النسخة الاحتياطية',files:[]});
 st=await ad.state();ok(st.support.length===2,'two messages now');
 let j=await ad.act('restore',{backup:bk,file:'b.json'});ok(j.ok,'restore',j);await ad.act('login',{u:'admin',p:'Admin@123'});
 st=await ad.state();ok(st.support.length===1&&st.support[0].status==='تمت المعالجة','restore brings back exactly the backed-up support messages',st.support.map(m=>m.id+m.status));
 // an older backup without the support key leaves current messages alone
 const old=JSON.parse(JSON.stringify(bk));delete old.data.support;
 j=await ad.act('restore',{backup:old,file:'old.json'});ok(j.ok,'restore old backup',j);await ad.act('login',{u:'admin',p:'Admin@123'});
 st=await ad.state();ok(st.support.length===1,'old backup does not wipe support messages');
 // malformed support rows are ignored, not crashing
 const bad=JSON.parse(JSON.stringify(bk));bad.data.support=[null,{id:'x'},{id:5,text:'سليمة',name:'ن',work:'ع',job:'و',status:'جديدة',created:'2026-01-01T00:00:00.000Z',files:[{id:'zz'},5]}];
 j=await ad.act('restore',{backup:bad,file:'bad.json'});ok(j.ok,'restore with malformed support rows',j);await ad.act('login',{u:'admin',p:'Admin@123'});
 st=await ad.state();ok(st.support.length===1&&st.support[0].id===5&&st.support[0].files.length===1,'only the valid row was kept',st.support);
 console.log(`done: ${pass} passed, ${fail} failed`)})().catch(e=>console.log('CRASH',e));
