const B=process.env.QP_BASE||'http://localhost:3999';let pass=0,fail=0;const ok=(c,m,x)=>{if(c)pass++;else{fail++;console.log('FAIL:',m,x?JSON.stringify(x):'')}};
function client(){let ck='';const f=async(p,o={})=>{const r=await fetch(B+p,Object.assign({},o,{headers:Object.assign({cookie:ck},o.headers||{})}));const sc=r.headers.get('set-cookie');if(sc){const m=sc.match(/qp_sid=([^;]*)/);ck=m&&m[1]?'qp_sid='+m[1]:''}return r};
 const act=async(a,b={})=>(await f('/api/act',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'qp'},body:JSON.stringify(Object.assign({a},b))})).json();
 return{f,act,state:async()=>(await f('/api/state')).json()}}
const base={name:'علي حسين كاظم',work:'مدرسة الأمل',job:'مدرس',birth:'1990-05-20',appt:'ملاك دائم',phone:'07701234567',username:'ali_h',pass:'secret1'};
(async()=>{const ad=client(),a=client(),b=client();
 let j=await ad.act('login',{u:'admin',p:'Admin@123'});ok(j.ok,'admin login');
 // signup validation of the new fields
 j=await a.act('signup',base);ok(!j.ok&&j.field==='s-emp','signup requires employee no',j);
 j=await a.act('signup',Object.assign({},base,{empNo:'A-12'}));ok(!j.ok&&j.field==='s-emp','bad emp chars rejected',j);
 j=await a.act('signup',Object.assign({},base,{empNo:'12345'}));ok(!j.ok&&j.field==='s-nid','signup requires national id',j);
 j=await a.act('signup',Object.assign({},base,{empNo:'12345',nid:'123'}));ok(!j.ok&&j.field==='s-nid','short national id rejected');
 j=await a.act('signup',Object.assign({},base,{empNo:'٠٠١٢٣٤٥',nid:'١٩٩٠١٢٣٤٥٦٧٨'}));ok(j.ok,'signup with arabic digits',j);
 j=await b.act('signup',Object.assign({},base,{name:'أمير فاضل جاسم',birth:'1982-02-02',username:'other_u',phone:'07709999999',empNo:'12345',nid:'999988887777'}));ok(!j.ok&&j.field==='s-emp','dup employee no rejected (leading zeros ignored)',j);
 j=await b.act('signup',Object.assign({},base,{name:'أمير فاضل جاسم',birth:'1982-02-02',username:'other_u',phone:'07709999999',empNo:'777',nid:'199012345678'}));ok(!j.ok&&j.field==='s-nid','dup national id rejected',j);
 // login by employee number
 let pub=await (await fetch(B+'/api/public')).json();ok(pub.emp&&pub.emp.label&&!pub.emp.staff,'public emp info without staff list',pub);
 j=await b.act('emp_login',{id:'12345',ver:'1990/05/20'});ok(j.ok&&j.state&&j.state.me.username==='ali_h','login by emp no + birth date',j);
 await b.act('logout');
 j=await b.act('emp_login',{id:'١٢٣٤٥',ver:'٢٠-٠٥-١٩٩٠'});ok(j.ok,'login by emp no + birth (arabic digits, dd-mm-yyyy)',j);await b.act('logout');
 j=await b.act('emp_login',{id:'12345',ver:'199012345678'});ok(j.ok,'login by emp no + national id',j);await b.act('logout');
 j=await b.act('emp_login',{id:'12345',ver:'1991/01/01'});ok(!j.ok&&/غير صحيحة/.test(j.error),'wrong verification rejected',j);
 j=await b.act('emp_login',{id:'99999',ver:'1990/05/20'});ok(!j.ok,'unknown employee rejected');
 j=await b.act('emp_login',{id:'12345',ver:'1990'});ok(!j.ok,'partial birth year does not match');
 // admin can never be reached this way
 j=await ad.act('user_save',{name:'مدير ثاني',dept:'قسم',username:'adm2xx',pass:'longpass1',role:'head',perms:['requests_view']});ok(j.ok,'admin2 created');
 // manager creates / edits reviewer
 j=await ad.act('rv_save',{name:'سعد كريم',work:'ثانوية',job:'إداري',birth:'1985-03-07',appt:'عقد',phone:'07711112222',username:'saad_k',pass:'abc12345',empNo:'555',nid:'112233445566'});ok(j.ok,'rv_save create',j);
 j=await ad.act('rv_save',{name:'سعد كريم',work:'ثانوية',job:'إداري',birth:'1986-03-07',appt:'عقد',phone:'07711112223',username:'saad_k2',pass:'abc12345',empNo:'555',nid:'998877665544'});ok(!j.ok&&j.field==='rf-emp','rv_save dup emp',j);
 j=await ad.act('rv_save',{name:'سعد كريم',work:'ثانوية',job:'إداري',birth:'1986-03-07',appt:'عقد',phone:'07711112224',username:'saad_k3',empNo:'556',nid:'998877665545'});ok(!j.ok&&j.field==='rf-pass','create needs password',j);
 const st=await ad.state();const sv=st.users.find(u=>u.username==='saad_k');ok(sv&&sv.empId==='555'&&sv.nid==='112233445566','manager sees ids',sv);
 j=await ad.act('rv_save',{id:sv.id,name:'سعد كريم علي',work:'ثانوية',job:'إداري',birth:'1985-03-07',appt:'عقد',phone:'07711112222',username:'saad_k',pass:'',empNo:'555',nid:'112233445566'});ok(j.ok,'rv_save edit without password',j);
 const c=client();j=await c.act('login',{u:'saad_k',p:'abc12345'});ok(j.ok,'created reviewer logs in with password');
 const d2=client();j=await d2.act('emp_login',{id:'555',ver:'1985-03-07'});ok(j.ok,'created reviewer logs in with emp no');
 j=await d2.act('rv_save',{name:'x y'});ok(!j.ok,'reviewer cannot rv_save');
 // admin accounts cannot use emp login
 j=await client().act('emp_login',{id:'1',ver:'1990/05/20'});ok(!j.ok,'no admin via emp login');
 // account lock after 5 wrong tries (even from another "ip"): correct answer now refused
 for(let i=0;i<5;i++)await b.act('emp_login',{id:'12345',ver:'wrong'+i});
 j=await b.act('emp_login',{id:'12345',ver:'1990/05/20'});ok(!j.ok&&/محاولات/.test(j.error),'locked after repeated failures',j);
 console.log(`done: ${pass} passed, ${fail} failed`)})().catch(e=>console.log('CRASH',e));
