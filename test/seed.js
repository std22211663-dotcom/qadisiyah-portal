const B=process.env.QP_BASE||'http://localhost:3999';const org=require('../org.json');
function client(){let ck='';const f=async(p,o={})=>{const r=await fetch(B+p,Object.assign({},o,{headers:Object.assign({cookie:ck},o.headers||{})}));const sc=r.headers.get('set-cookie');if(sc){const m=sc.match(/qp_sid=([^;]*)/);ck=m&&m[1]?'qp_sid='+m[1]:''}return r};
 return{act:async(a,b={})=>(await f('/api/act',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'qp'},body:JSON.stringify(Object.assign({a},b))})).json()}}
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
(async()=>{const ad=client(),rv=client();await ad.act('login',{u:'admin',p:'Admin@123'});
 await rv.act('signup',{name:'علي حسين كاظم',work:'مدرسة الأمل',job:'مدرس',birth:'1990-05-20',appt:'ملاك دائم',phone:'07701234567',username:'ali_h',pass:'secret12',empNo:'1001',nid:'123456789012'});
 await rv.act('login',{u:'ali_h',p:'secret12'});
 await rv.act('req_submit',{type:'نقل',text:'يرجى التفضل بالموافقة على نقلي إلى مدرسة قريبة',sig:PNG});
 await rv.act('int_submit',{target:'gm',reason:'مراجعة بخصوص النقل'});
 await client().act('support_submit',{name:'سارة حيدر كاظم',work:'متوسطة',job:'مدرسة',text:'لا أستطيع رفع المرفقات الآن',files:[]});
 const d=org.gm.find(x=>x.acc);await ad.act('unit_save',{unit:d.n,username:'unit_sup',pass:'unitpass1',holder:'كريم سعد'});
 const st=await (await fetch(B+'/api/state',{headers:{}})).json();
 console.log('seeded');})();
