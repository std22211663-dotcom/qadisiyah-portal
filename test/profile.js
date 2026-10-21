const B=process.env.QP_BASE||'http://localhost:3999';let pass=0,fail=0;const ok=(c,m,x)=>{if(c)pass++;else{fail++;console.log('FAIL:',m,x?JSON.stringify(x):'')}};
function client(){let ck='';const f=async(p,o={})=>{const r=await fetch(B+p,Object.assign({},o,{headers:Object.assign({cookie:ck},o.headers||{})}));const sc=r.headers.get('set-cookie');if(sc){const m=sc.match(/qp_sid=([^;]*)/);ck=m&&m[1]?'qp_sid='+m[1]:''}return r};
 const act=async(a,b={})=>(await f('/api/act',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'qp'},body:JSON.stringify(Object.assign({a},b))})).json();
 return{f,act,state:async()=>(await f('/api/state')).json()}}
const reg={name:'علي حسين كاظم',work:'مدرسة الأمل',job:'مدرس',birth:'1990-05-20',appt:'ملاك دائم',phone:'07701234567',username:'ali_h',pass:'secret12',empNo:'1001',nid:'123456789012'};
const prof=(o={})=>Object.assign({name:reg.name,work:reg.work,job:reg.job,birth:reg.birth,appt:reg.appt,phone:reg.phone,username:reg.username,empNo:reg.empNo,nid:reg.nid},o);
(async()=>{const ad=client(),a=client(),b=client(),st=client();
 await ad.act('login',{u:'admin',p:'Admin@123'});
 let j=await a.act('signup',reg);ok(j.ok,'signup');j=await b.act('signup',Object.assign({},reg,{name:'سعد كريم علي',username:'saad_k',phone:'07711112222',empNo:'2002',nid:'210987654321'}));ok(j.ok,'second reviewer');
 await a.act('login',{u:'ali_h',p:'secret12'});
 // plain edit (no sensitive change) needs no password
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000'}));ok(j.ok&&j.state.me.work==='ثانوية النور'&&j.state.me.dept==='ثانوية النور','edit work/phone without password',j);
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000',name:'علي'}));ok(!j.ok&&j.field==='pf-name','validation: two-word name',j);
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000',username:'saad_k'}));ok(!j.ok&&j.field==='pf-user','username must stay unique',j);
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07711112222'}));ok(!j.ok&&j.field==='pf-phone','phone must stay unique',j);
 // sensitive fields need the current password
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000',nid:'999988887777'}));ok(!j.ok&&j.field==='pf-pass','changing nid without password rejected',j);
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000',nid:'999988887777',curPass:'wrong'}));ok(!j.ok&&j.field==='pf-pass','wrong current password rejected');
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000',nid:'999988887777',curPass:'secret12'}));ok(j.ok&&j.state.me.nid==='999988887777','nid change with password',j);
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000',nid:'999988887777',empNo:'2002',curPass:'secret12'}));ok(!j.ok&&j.field==='pf-emp','employee number must stay unique',j);
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000',nid:'999988887777',birth:'1991-01-01',curPass:'secret12'}));ok(j.ok,'birth change with password',j);
 // new username works for login, and password unchanged
 j=await a.act('profile_save',prof({work:'ثانوية النور',phone:'07701230000',nid:'999988887777',birth:'1991-01-01',username:'ali_new'}));ok(j.ok,'username change (no sensitive change)',j);
 j=await client().act('login',{u:'ali_new',p:'secret12'});ok(j.ok,'login with new username');
 // emp login now uses the NEW national id / birth
 j=await client().act('emp_login',{id:'1001',ver:'999988887777'});ok(j.ok,'emp login with new nid');
 j=await client().act('emp_login',{id:'1001',ver:'123456789012'});ok(!j.ok,'old nid no longer works');
 // staff-list account: employee number is locked, no password needed to add nid
 await ad.act('staff_import',{file:'t.csv',cols:['الرقم','الاسم','تاريخ التولد'],rows:[['7001','موظف قائمة','1985-03-07']],map:{id:0,ver:2,name:1}});
 j=await st.act('emp_login',{id:'7001',ver:'1985-03-07'});ok(j.ok,'staff login');
 const me=j.state.me;
 j=await st.act('profile_save',{name:me.name,work:'مدرسة القائمة',job:'مدرس',birth:'1985-03-07',appt:'عقد',phone:'07713334444',username:me.username,empNo:'7001',nid:'555566667777'});ok(j.ok,'staff account adds nid without password',j);
 j=await st.act('profile_save',{name:me.name,work:'مدرسة القائمة',job:'مدرس',birth:'1985-03-07',appt:'عقد',phone:'07713334444',username:me.username,empNo:'7002',nid:'555566667777'});ok(!j.ok&&j.field==='pf-emp','staff account cannot change employee number',j);
 // admin cannot use it, anonymous cannot use it
 j=await ad.act('profile_save',prof());ok(!j.ok,'admin cannot use profile_save');
 j=await client().act('profile_save',prof());ok(!j.ok,'anonymous cannot');
 // log entry
 const s=await ad.state();ok(s.log.some(l=>l.code==='profile_edit'),'profile_edit logged');
 // change password path (existing action) still works for reviewers
 j=await a.act('login',{u:'ali_new',p:'secret12'});j=await a.act('change_pass',{old:'secret12',new:'newsecret99'});ok(j.ok,'reviewer change_pass',j);
 console.log(`done: ${pass} passed, ${fail} failed`)})().catch(e=>console.log('CRASH',e));
