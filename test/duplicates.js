const B=process.env.QP_BASE||'http://localhost:3999';let pass=0,fail=0;const ok=(c,m,x)=>{if(c)pass++;else{fail++;console.log('FAIL:',m,x?JSON.stringify(x):'')}};
function client(){let ck='';const f=async(p,o={})=>{const r=await fetch(B+p,Object.assign({},o,{headers:Object.assign({cookie:ck},o.headers||{})}));const sc=r.headers.get('set-cookie');if(sc){const m=sc.match(/qp_sid=([^;]*)/);ck=m&&m[1]?'qp_sid='+m[1]:''}return r};
 const act=async(a,b={})=>(await f('/api/act',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'qp'},body:JSON.stringify(Object.assign({a},b))})).json();return{act}}
let n=0;const mk=(o={})=>{n++;return Object.assign({name:'أحمد إبراهيم علي',work:'مدرسة',job:'مدرس',birth:'1990-05-20',appt:'عقد',phone:'0770000'+String(1000+n),username:'user_'+n,pass:'secret12',empNo:String(100+n),nid:String(100000000000+n)},o)};
(async()=>{const ad=client();await ad.act('login',{u:'admin',p:'Admin@123'});
 let j=await client().act('signup',mk());ok(j.ok,'first account',j);
 j=await client().act('signup',mk());ok(!j.ok&&j.field==='s-name','same name + birth rejected',j);
 j=await client().act('signup',mk({name:'احمد ابراهيم علي'}));ok(!j.ok&&j.field==='s-name','hamza variants (أ/ا, إ/ا) rejected',j);
 j=await client().act('signup',mk({name:'  أحمد   إبراهيم  علي '}));ok(!j.ok&&j.field==='s-name','extra spaces rejected',j);
 j=await client().act('signup',mk({name:'أَحْمَد إبراهيم علي'}));ok(!j.ok&&j.field==='s-name','diacritics rejected',j);
 j=await client().act('signup',mk({birth:'1991-05-20'}));ok(j.ok,'same name, different birth date allowed (another person)',j);
 j=await client().act('signup',mk({name:'سعد إبراهيم علي'}));ok(j.ok,'different name same birth allowed',j);
 // manager add + edit paths
 j=await ad.act('rv_save',mk());ok(!j.ok&&j.field==='rf-name','manager cannot add the duplicate',j);
 j=await ad.act('rv_save',mk({name:'ليلى حسن كاظم',birth:'1985-01-01'}));ok(j.ok,'manager adds a new person',j);
 // reviewer edits profile into a collision
 const r=client();const mine=mk({name:'كريم صالح مهدي',birth:'1980-02-02'});j=await r.act('signup',mine);ok(j.ok,'reviewer signup');
 await r.act('login',{u:mine.username,p:mine.pass});
 const prof=(o={})=>Object.assign({name:mine.name,work:mine.work,job:mine.job,birth:mine.birth,appt:mine.appt,phone:mine.phone,username:mine.username,empNo:mine.empNo,nid:mine.nid,curPass:mine.pass},o);
 j=await r.act('profile_save',prof({name:'أحمد إبراهيم علي',birth:'1990-05-20'}));ok(!j.ok&&j.field==='pf-name','profile edit into duplicate rejected',j);
 j=await r.act('profile_save',prof({work:'مدرسة جديدة'}));ok(j.ok,'normal profile edit (own record not counted as duplicate)',j);
 console.log(`done: ${pass} passed, ${fail} failed`)})().catch(e=>console.log('CRASH',e));
