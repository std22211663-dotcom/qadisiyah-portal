/* Scenes: reviewer (public applicant) video */
(function () {
  const $ = i => document.getElementById(i), q = s => document.querySelector(s), sl = D.sleep;
  const S = async (n, f) => { window.__cur = n; await f(); };
  const ext = async n => { window.__want = n; while (window.__want) await new Promise(r => setTimeout(r, 300)); };
  const go = v => D.click('.card[data-go="' + v + '"]', { after: 900 });
  const back = v => D.click('#v-' + v + ' [data-back]', { after: 800 });
  const sels = id => { const f = $(id).closest('.field'); const l = f ? [...f.querySelectorAll('.dsel select')] : []; if (!l.length) throw new Error('no date selects for ' + id); return l; };
  const poll = async () => { document.dispatchEvent(new Event('visibilitychange')); await sl(1800); };

  window.RUN = async function () {
    await S('بطاقة العنوان', () => D.card('شرح استخدام بوابة تربية القادسية الإلكترونية', 'للمراجعين: إنشاء الحساب وتقديم الطلبات ومتابعتها', 5400));

    await S('إنشاء حساب', async () => {
      await D.step('إنشاء حساب جديد');
      await D.say('أهلاً بك في بوابة تربية القادسية. في شاشة الترحيب اضغط <b>«إنشاء حساب جديد»</b> إذا كانت هذه أول مرة تستعمل فيها البوابة.');
      await D.click('#intro-signup', { after: 1000 });
      await D.say('اكتب <b>اسمك الكامل</b> كما هو في الوثائق الرسمية، ثم <b>مكان العمل</b> و<b>العنوان الوظيفي</b>.');
      await D.type('#s-name', 'أحمد جاسم محمد'); await D.type('#s-work', 'ثانوية الأمل للبنين'); await D.choose('#s-job', 'مدرس');
      await D.say('اختر <b>تاريخ التولد</b> من القوائم: اليوم ثم الشهر ثم السنة.');
      const b = sels('s-birth'); await D.choose(b[0], '12'); await D.choose(b[1], '5'); await D.choose(b[2], '1987');
      await D.choose('#s-appt', 'ملاك دائم');
      await D.say('أدخل <b>الرقم الوظيفي</b> و<b>رقم الهوية</b>. ستحتاجهما للدخول إذا نسيت كلمة المرور، ولا يُسمح بتسجيل شخص واحد مرتين.', { ms: 4800 });
      await D.type('#s-emp', '5501'); await D.type('#s-nid', '198705120055');
      await D.say('ثم <b>رقم هاتفك</b> الذي يبدأ بـ 07، و<b>اسم المستخدم</b> بحروف إنجليزية، و<b>كلمة المرور</b> (6 أحرف على الأقل) مع تأكيدها.');
      await D.type('#s-phone', '07709876543'); await D.type('#s-user', 'ahmed_j'); await D.type('#s-pass', 'Demo@12345'); await D.type('#s-pass2', 'Demo@12345');
      await D.say('اضغط <b>«إنشاء الحساب»</b>.');
      await D.click('#p-signup button[type=submit]', { after: 1800 });
    });

    await S('الدخول', async () => {
      await D.step('تسجيل الدخول');
      await D.say('تم إنشاء الحساب، وانتقلت إلى صفحة الدخول مع اسم المستخدم. اكتب كلمة المرور واضغط <b>«دخول»</b>.');
      await D.type('#l-pass', 'Demo@12345'); await D.click('#p-login button[type=submit]', { after: 1800 });
      await D.say('هذه صفحتك الرئيسية: <b>تقديم طلب</b>، <b>طلب مقابلة</b>، <b>متابعة الطلب</b>، و<b>معلوماتي</b>.');
      for (const v of ['apply', 'interview', 'track', 'profile']) await D.point('.card[data-go="' + v + '"]', { after: 250 });
      await D.say('زر <b>الوضع الداكن / الفاتح</b> في الأعلى لراحة عينيك.', { ms: 2600 });
      await D.click('.top .theme-btn', { after: 1800 }); await D.click('.top .theme-btn', { after: 900 });
    });

    await S('معلوماتي', async () => {
      await D.step('معلوماتي');
      await go('profile');
      await D.say('في <b>«معلوماتي»</b> ترى بياناتك المسجّلة كاملة. اضغط <b>«تعديل المعلومات»</b> لتغييرها عند الحاجة.');
      await D.point('#pf-view');
      await D.click('#pf-edit', { after: 900 });
      await D.say('عدّل ما تريد، وعند تغيير <b>الرقم الوظيفي أو رقم الهوية أو التولد</b> تُطلب كلمة المرور الحالية للتأكد أنك صاحب الحساب.', { ms: 5000 });
      await D.point('#pf-pass');
      await D.click('#pf-cancel', { after: 900 });
      await D.say('ويمكنك <b>تغيير كلمة المرور</b> من القسم الأسفل في الصفحة نفسها.');
      await D.point('#pw-f');
      await back('profile');
    });

    await S('تقديم طلب', async () => {
      await D.step('تقديم طلب');
      await go('apply');
      await D.say('لتقديم طلب جديد اضغط <b>«إضافة طلب»</b>.');
      await D.click('#new-req', { after: 1000 });
      await D.say('اختر <b>نوع الطلب</b>، ثم أكمل <b>نص الطلب</b>. العبارة الافتتاحية ثابتة وعليك كتابة التفاصيل.');
      await D.choose('#r-type', 'نقل');
      await D.type('#r-text', 'نقلي إلى مدرسة أقرب لمحل سكني بسبب بُعد المسافة', { per: 48 });
      await D.say('أرفق <b>المستمسكات</b> المطلوبة: صوراً أو ملفات PDF (حتى 5 ملفات، وكل ملف حتى 5 ميغابايت).', { ms: 3800 });
      await D.attach('#r-file', [{ name: 'تأييد السكن.png', color: '#0f4c9e' }, { name: 'كتاب النقل.pdf', pdf: true }]);
      await D.say('ثم <b>وقّع داخل المربع</b> بالماوس أو بإصبعك. يظهر توقيعك في خانة «مقدم الطلب» عند طباعة النموذج.');
      await D.sign('#sig-c');
      await D.say('اضغط <b>«إرسال»</b>. يظهر طلبك في القائمة برقمه وحالته <b>قيد المراجعة</b>.');
      await D.click('#rform button[type=submit]', { after: 2200 });
      await D.point('#rlist .ucard');
    });

    await S('متابعة الطلب', async () => {
      await D.step('متابعة الطلب والإشعارات');
      await back('apply');
      await go('track');
      await D.say('في <b>«متابعة الطلب»</b> ترى كل طلباتك وحالتها: قيد المراجعة، موافق عليه، أو مرفوض.');
      await D.click(() => q('#tlist [data-act=toggle]'), { after: 1000 });
      await D.say('بعد أن يراجع المسؤول طلبك ويحوّله إلى القسم المختص تصلك النتيجة...', { ms: 3000 });
      await back('track');
      await ext('manager'); await poll();
      await D.say('ظهرت <b>علامة حمراء على الجرس</b>: لديك إشعار جديد. اضغط الجرس لمشاهدته.');
      await D.click('#bell', { after: 2400 });
      await D.say('تمت الموافقة على طلبك. اضغط الإشعار لفتح <b>متابعة الطلب</b>. وبعد المشاهدة تختفي العلامة الحمراء.');
      await D.click(() => q('#notif-list .nbtn'), { after: 1200 });
      await D.click(() => q('#tlist [data-act=toggle]'), { after: 1000 });
      await D.say('يعرض <b>التسلسل الزمني</b> ما جرى على طلبك: الموافقة، ثم تحويله إلى القسم بهامش المدير، ثم توجيهه إلى الشعبة المختصة وحالة إنجازه.', { ms: 5800 });
      await D.point('#tlist .tl', { after: 1200 });
    });

    await S('طلب مقابلة', async () => {
      await D.step('طلب مقابلة');
      await back('track'); await go('interview');
      await D.say('لمقابلة المدير العام أو أحد المعاونين اضغط <b>«إضافة مقابلة»</b>.');
      await D.click('#new-int', { after: 1000 });
      await D.choose('#i-with', 'gm');
      await D.type('#i-reason', 'أرغب بمقابلتكم لمناقشة موضوع نقلي', { per: 50 });
      await D.say('اختر <b>الجهة</b> واكتب <b>سبب المقابلة</b> وأرفق ما يلزم اختيارياً، ثم اضغط <b>«إرسال»</b>. يصلك موعد المقابلة في الإشعارات.', { ms: 4600 });
      await D.click('#iform button[type=submit]', { after: 2000 });
      await back('interview');
    });

    await S('نسيت كلمة المرور', async () => {
      await D.step('إذا نسيت كلمة المرور');
      await D.click('#logout', { after: 1500 });
      await D.say('إذا نسيت كلمة المرور فلا تقلق. اضغط تبويب <b>«الرقم الوظيفي»</b>.');
      await D.click('#t-emp', { after: 900 });
      await D.say('اكتب <b>رقمك الوظيفي</b>، وللتحقق من هويتك اكتب <b>تاريخ التولد</b> أو <b>رقم الهوية</b> كما سجلتهما في حسابك.', { ms: 4600 });
      await D.type('#e-id', '5501'); await D.type('#e-ver', '1987/5/12');
      await D.click('#p-emp button[type=submit]', { after: 2000 });
      await D.say('دخلت إلى حسابك مباشرة. وبعد خمس محاولات خاطئة يُقفل الدخول مؤقتاً حمايةً لحسابك.');
      await D.click('#logout', { after: 1500 });
    });

    await S('الدعم الفني', async () => {
      await D.step('الدعم الفني');
      await D.say('وإذا واجهتك أي مشكلة في استعمال البوابة اضغط <b>«الدعم الفني»</b> أسفل زر الدخول.');
      await D.click('#sup-open', { after: 1000 });
      await D.type('#sp-name', 'أحمد جاسم محمد'); await D.type('#sp-work', 'ثانوية الأمل للبنين'); await D.type('#sp-job', 'مدرس');
      await D.type('#sp-text', 'تظهر لي رسالة خطأ عند محاولة رفع المرفقات', { per: 45 });
      await D.say('اكتب اسمك ومكان عملك وعنوانك الوظيفي وشرح المشكلة، وأرفق <b>صورة للمشكلة</b> إن أمكن، ثم اضغط <b>«إرسال»</b>. يصل ما كتبته إلى الإدارة مباشرة.', { ms: 5400 });
      await D.attach('#sp-file', [{ name: 'صورة المشكلة.png', color: '#c62828' }]);
      await D.click('#sup-f button[type=submit]', { after: 2200 });
    });

    await S('الختام', async () => {
      D.quiet();
      await D.card('نتمنى لك تجربة ميسّرة', 'لا تشارك كلمة المرور مع أحد، وسجّل الخروج بعد الانتهاء من استعمال البوابة', 6000);
    });
  };
})();
