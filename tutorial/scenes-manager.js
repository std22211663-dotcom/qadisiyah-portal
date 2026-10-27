/* Scenes: administrators video (director general, deputies, section heads, staff, section accounts) */
(function () {
  const $ = i => document.getElementById(i), q = s => document.querySelector(s), sl = D.sleep;
  const S = async (n, f) => { window.__cur = n; await f(); };
  const card = name => D.byText('#v-visitors .ucard', name);
  const login = async (u, p) => { await D.type('#l-user', u); await D.type('#l-pass', p); await D.click('#p-login button[type=submit]', { after: 1700 }); };
  const logout = async () => { await D.click('#logout', { after: 1500 }); };
  const go = v => D.click('.card[data-go="' + v + '"]', { after: 900 });
  const back = v => D.click('#v-' + v + ' [data-back]', { after: 800 });
  const sels = id => { const f = $(id).closest('.field'); const l = f ? [...f.querySelectorAll('.dsel select')] : []; if (!l.length) throw new Error('no date selects for ' + id + ' :: ' + (f ? f.innerHTML.slice(0, 260) : 'no field')); return l; };
  const optBy = (id, text) => [...$(id).options].find(o => o.text.includes(text)).value;

  window.RUN = async function () {
    await S('بطاقة العنوان', () => D.card('شرح استخدام بوابة تربية القادسية الإلكترونية', 'للمدير العام والمعاونين ومدراء الأقسام والمستخدمين الإداريين وحسابات الأقسام والشعب', 5600));

    await S('الدخول', async () => {
      await D.step('الدخول إلى البوابة');
      await D.say('عند فتح البوابة تظهر شاشة الترحيب. اضغط <b>«تسجيل الدخول»</b> للمتابعة.');
      await D.click('#intro-login', { after: 1000 });
      await D.say('اكتب <b>اسم المستخدم</b> و<b>كلمة المرور</b> التي أعطتك إياها إدارة النظام.');
      await D.type('#l-user', 'admin'); await D.type('#l-pass', 'Admin@123');
      await D.say('ثم اضغط <b>«دخول»</b>. بعد خمس محاولات خاطئة يُمنع الدخول مؤقتاً خمس دقائق حمايةً للحساب.', { ms: 3800 });
      await D.click('#p-login button[type=submit]', { after: 1800 });
    });

    await S('الرئيسية', async () => {
      await D.step('الصفحة الرئيسية');
      await D.say('هذه صفحتك الرئيسية. تظهر فيها <b>الخدمات التي تسمح بها صلاحيات حسابك</b> فقط، والمدير العام يرى كل الخدمات.');
      await D.point('.card[data-go="visitors"]'); await D.point('.card[data-go="meetings"]'); await D.point('.card[data-go="support"]'); await D.point('.card[data-go="settings"]');
      await D.say('في أعلى الصفحة زر <b>الوضع الداكن / الفاتح</b> لراحة العين، ويحفظ المتصفح اختيارك.');
      await D.click('.top .theme-btn', { after: 2000 }); await D.click('.top .theme-btn', { after: 1200 });
      await D.say('جرس <b>الإشعارات</b> يعرض الطلبات الجديدة وطلبات المقابلة ورسائل الدعم الفني. تختفي العلامة الحمراء بعد مشاهدتها وتعود فقط عند وصول جديد.', { ms: 4800 });
      await D.click('#bell', { after: 2600 }); await D.click('#bell', { after: 700 });
    });

    await S('طلبات المراجعين', async () => {
      await D.step('طلبات المراجعين: الموافقة والرفض');
      await go('visitors');
      await D.say('هنا كل الطلبات التي قدّمها المراجعون. استعمل <b>أزرار التصفية</b> لعرض قيد المراجعة أو الموافق عليها أو المرفوضة.');
      await D.point('#v-visitors .seg');
      await D.say('اضغط <b>«التفاصيل»</b> لعرض نص الطلب والتوقيع <b>والمرفقات</b> التي رفعها المراجع.');
      await D.click(() => card('علي حسين').querySelector('[data-act=toggle]'), { after: 900 });
      await D.point(() => card('علي حسين').querySelector('a[href^="api/file"]'), { after: 900 });
      await D.say('للموافقة اضغط <b>«موافقة»</b>.');
      await D.click(() => card('علي حسين').querySelector('[data-act=approve]'), { after: 1500 });
      await D.say('أما <b>الرفض</b> فيتطلب كتابة سببه ليصل إلى المراجع.', { ms: 3000 });
      await D.click(() => card('كريم صالح').querySelector('[data-act=toggle]'), { after: 800 });
      await D.type(() => card('كريم صالح').querySelector('textarea'), 'لعدم استكمال المستمسكات المطلوبة');
      await D.click(() => card('كريم صالح').querySelector('[data-act=reject]'), { after: 1600 });
    });

    await S('الهامش والتحويل', async () => {
      await D.step('الهامش والتحويل إلى القسم المعني');
      await D.say('بعد الموافقة اضغط <b>«معاينة النموذج والطباعة»</b> لكتابة هامش المدير وتحويل الطلب إلى القسم المعني.');
      await D.click(() => card('علي حسين').querySelector('[data-act=form]'), { after: 1400 });
      await D.say('اختر <b>الجهة الموجّه إليها</b> ثم <b>الهامش</b> من القائمة أو اكتب هامشاً خاصاً.');
      await D.choose('#f-ham', $('f-ham').options[2].value);
      await D.say('اختر <b>القسم المعني</b> ثم <b>الشعبة</b> التابعة له. المدير العام يحوّل إلى كل الأقسام، وكل معاون إلى أقسامه فقط.', { ms: 4200 });
      await D.choose('#f-dept', optBy('f-dept', 'الإشراف التربوي')); await sl(600);
      await D.choose('#f-sec', $('f-sec').options[1].value);
      await D.say('اضغط <b>«حفظ وتنفيذ»</b>. يُضاف <b>ختم المدير العام</b> إلى النموذج ويصل الطلب إلى القسم.');
      await D.click('#fm-save', { after: 2200 });
      await D.say('من هنا أيضاً <b>تحميل PDF</b> أو <b>الطباعة</b> مباشرة، وتُلحق <b>مرفقات الطلب</b> بالملف بعد صفحة النموذج.', { ms: 4600 });
      await D.point('#fm-pdf'); await D.point('#fm-print');
      await D.click('#fm-x', { after: 900 });
    });

    await S('المقابلات', async () => {
      await back('visitors');
      await D.step('طلبات المقابلة');
      await go('meetings');
      await D.say('طلبات المراجعين لمقابلتك تظهر هنا. افتح الطلب بزر <b>«التفاصيل»</b>.');
      await D.click(() => q('#v-meetings [data-act=toggle]'), { after: 900 });
      await D.say('حدّد <b>تاريخ المقابلة ووقتها</b> ثم اضغط <b>«تحديد الموعد وإشعار المراجع»</b>. يصل الموعد إلى المراجع في إشعاراته.', { ms: 4400 });
      const d = new Date(Date.now() + 2 * 864e5), ds = sels(q('#v-meetings input[id^="md-"]').id), ts = sels(q('#v-meetings input[id^="mt-"]').id);
      await D.choose(ds[0], String(d.getDate())); await D.choose(ds[1], String(d.getMonth() + 1)); await D.choose(ds[2], String(d.getFullYear()));
      await D.choose(ts[0], '10'); await D.choose(ts[1], '30'); await D.choose(ts[2], 'am');
      await D.click(() => q('#v-meetings [data-act=schedule]'), { after: 1800 });
      await back('meetings');
    });

    await S('الإعدادات', async () => {
      await D.step('الإعدادات والإدارة');
      await go('settings');
      await D.say('صفحة <b>الإعدادات</b> فيها بيانات حسابك وأدوات الإدارة: المستخدمون والمراجعون والنسخ الاحتياطي والمحذوفات وسجل النشاطات.');
      for (const v of ['users', 'reviewers', 'staff', 'data', 'trash', 'audit']) await D.point('#v-settings .card[data-go="' + v + '"]', { after: 300 });
      await D.say('يمكنك <b>إيقاف استقبال الطلبات أو المقابلات</b> مؤقتاً لجميع المراجعين من مفتاح الاستقبال، ويظهر لهم سبب الإيقاف.');
      await D.point('#svc-req');
      await D.say('ومن <b>أسماء المدير العام والمعاونين</b> تتحكم بالأسماء التي تظهر في الأختام على النماذج.');
      await D.point('#stp-gm');
    });

    await S('المستخدمون', async () => {
      await D.step('إدارة المستخدمين');
      await D.click('#v-settings .card[data-go="users"]', { after: 900 });
      await D.say('من هنا تنشئ حسابات الإدارة وتحدد <b>الدور والصلاحيات</b> لكل مستخدم. اضغط <b>«إضافة مستخدم»</b>.');
      await D.click('#add-user', { after: 900 });
      await D.type('#u-name', 'سامر ناجي كاظم'); await D.type('#u-dept', 'قسم الاستعلامات'); await D.type('#u-user', 'inq_samer'); await D.type('#u-pass', 'Demo@12345');
      await D.say('اختر <b>الدور الوظيفي</b>، وتُملأ الصلاحيات الافتراضية له ويمكنك تعديلها بالتفصيل.');
      await D.choose('#u-role', 'inquiry'); await D.point('#uform fieldset.perms');
      await D.say('اضغط <b>«حفظ»</b>. يستطيع المستخدم الدخول فوراً، وتظهر له الخدمات التي منحته إياها فقط.');
      await D.click('#uform button[type=submit]', { after: 1600 });
    });

    await S('حسابات الأقسام', async () => {
      await D.step('حسابات الأقسام والشعب');
      await D.say('أسفل الصفحة <b>حسابات الأقسام والشعب</b>. لكل قسم حساب يستلم الطلبات المحوّلة إليه. اضغط <b>«إنشاء حساب»</b> بجانب القسم.');
      await D.click(() => q('#un-list [data-unnew]'), { after: 900 });
      await D.type('#uc-user', 'sec_exam'); await D.type('#uc-pass', 'Demo@12345'); await D.type('#uc-name', 'مهدي صالح حسن');
      await D.say('اكتب اسم المسؤول، وهو الاسم الذي يظهر في <b>ختم القسم</b> على النموذج.');
      await D.click('#ucf button[type=submit]', { after: 1600 });
      await back('users');
    });

    await S('المراجعون', async () => {
      await D.step('إدارة المراجعين');
      await D.click('#v-settings .card[data-go="reviewers"]', { after: 900 });
      await D.say('هنا إحصاءات المراجعين وقائمتهم. تستطيع <b>إضافة مراجع</b> بنفسك أو <b>تعديل بياناته</b> أو إيقاف تقديمه للطلبات والمقابلات.');
      await D.point('#rv-stats'); await D.click('#rv-add', { after: 900 });
      await D.type('#rf-name', 'حسين كريم علي'); await D.type('#rf-work', 'متوسطة الغدير'); await D.choose('#rf-job', 'إداري');
      const b = sels('rf-birth'); await D.choose(b[0], '3'); await D.choose(b[1], '9'); await D.choose(b[2], '1992');
      await D.choose('#rf-appt', 'أجور'); await D.type('#rf-emp', '9001'); await D.type('#rf-nid', '199209030001'); await D.type('#rf-phone', '07715556666'); await D.type('#rf-user', 'hussein_k'); await D.type('#rf-pass', 'Demo@12345');
      await D.say('<b>الرقم الوظيفي ورقم الهوية</b> يسمحان للمراجع بالدخول عند نسيان كلمة المرور. ولا يُسمح بحسابين لشخص واحد.', { ms: 4400 });
      await D.click('#rvf-f button[type=submit]', { after: 1700 });
      await D.point(() => q('#rv-list [data-rvedit]')); await D.point(() => q('#rv-list [data-rvblk]'));
    });

    await S('الدعم الفني', async () => {
      await back('reviewers'); await back('settings');
      await D.step('رسائل الدعم الفني');
      await go('support');
      await D.say('كل من يواجه مشكلة يضغط <b>«الدعم الفني»</b> في صفحة الدخول ويرسل اسمه ومشكلته وصورة اختيارية. تصلك هنا مع عدّاد للجديد.');
      await D.point('#sup-list .ucard');
      await D.say('بعد معالجة المشكلة اضغط <b>«تمت المعالجة»</b>.');
      await D.click(() => q('#sup-list [data-done="1"]'), { after: 1400 });
      await back('support');
    });

    await S('السجل والنسخ', async () => {
      await D.step('سجل النشاطات والنسخ الاحتياطي');
      await go('settings'); await D.click('#v-settings .card[data-go="audit"]', { after: 900 });
      await D.say('<b>سجل النشاطات</b> يوثّق من دخل ومن وافق ومن رفض وما جرى على الحسابات. ابحث فيه بالاسم أو التفاصيل.');
      await D.type('#a-q', 'موافقة'); await back('audit');
      await D.click('#v-settings .card[data-go="data"]', { after: 900 });
      await D.say('من <b>النسخ الاحتياطي</b> تنزّل نسخة من البيانات. احفظها في مكان آمن بانتظام، ويمكن استعادتها عند الحاجة.');
      await D.point('#bk-export'); await back('data');
      await D.say('والطلبات المحذوفة تبقى في <b>سلة المحذوفات</b> ويمكن استرجاعها مع أثرها في السجل.');
      await D.click('#v-settings .card[data-go="trash"]', { after: 1800 }); await back('trash');
    });

    await S('المعاون', async () => {
      await back('settings'); await logout();
      await D.step('المعاونون');
      await D.say('الآن نرى حساب <b>المعاون الإداري</b>. اسم المستخدم وكلمة المرور تنشئهما إدارة النظام له.');
      await login('dep_admin', 'Demo@12345');
      await D.say('يرى المعاون طلبات المراجعين وطلبات المقابلة الموجهة إليه ويوافق ويرفض مثل المدير، لكنه <b>يحوّل إلى أقسامه فقط</b>، ولا تظهر له إدارة المستخدمين.', { ms: 5400 });
      await D.point('.card[data-go="visitors"]'); await D.point('.card[data-go="meetings"]'); await D.point('.card[data-go="settings"]');
    });

    await S('مدير القسم', async () => {
      await logout();
      await D.step('مدراء الأقسام والمستخدمون');
      await login('head_plan', 'Demo@12345');
      await D.say('<b>مدير القسم</b> صلاحياته أقل: يطّلع على الطلبات ويوافق ويرفض فقط. وحساب <b>موظف الاستعلامات</b> أو <b>الموظف المختص</b> يطّلع دون أي إجراء. المدير العام هو من يحدد ذلك لكل مستخدم.', { ms: 6400 });
      await D.point('.card[data-go="visitors"]'); await go('visitors'); await D.point('#v-visitors .seg');
      await back('visitors');
    });

    await S('حساب القسم', async () => {
      await logout();
      await D.step('حساب القسم أو الشعبة');
      await login('sec_super', 'Demo@12345');
      await D.say('<b>حساب القسم</b> يستلم الطلبات التي حوّلها المدير أو المعاون إليه. افتح <b>«الطلبات المحوّلة»</b>.');
      await go('inbox');
      await D.click(() => q('#ib-list [data-ib=toggle]'), { after: 900 });
      await D.say('يظهر الطلب بهامش المدير وختمه. وجّهه إلى <b>الشعبة المختصة</b> واضغط <b>«حفظ التوجيه»</b>، فتصل الحالة إلى المراجع.');
      await D.choose(() => q('#ib-list select'), [...q('#ib-list select').options][1].value);
      await D.click(() => q('#ib-list [data-ib=route]'), { after: 1600 });
      await D.say('وعند إتمام المعاملة اضغط <b>«تم الإنجاز»</b>، ويرى المراجع اكتمالها في صفحة متابعة الطلب.');
      await D.click(() => q('#ib-list [data-ib=done]'), { after: 1800 });
    });

    await S('الختام', async () => {
      D.quiet();
      await D.card('إلى هنا ينتهي الشرح', 'غيّر كلمة المرور الافتراضية فور أول دخول، واحفظ نسخة احتياطية بانتظام، ولا تشارك بيانات حسابك مع أحد', 6200);
    });
  };
})();
