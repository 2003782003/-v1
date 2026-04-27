# ورشة شويخ - نظام إدارة تصليح المحركات

## نظرة عامة
- **الاسم**: ورشة شويخ (Chouikh Workshop)
- **الهدف**: تطبيق ويب متكامل لمتابعة تصليح المحركات يربط بين الزبائن والفنيين والمدير عبر لوحات تحكم مخصصة
- **التقنيات**: Hono + TypeScript + Cloudflare Pages + D1 (SQLite) + TailwindCSS

## الميزات الحالية ✅
- تسجيل دخول آمن بـ SHA-256 و Session Cookies
- إنشاء حساب زبون ذاتياً
- ثلاث أدوار: المدير / الفني / الزبون — كل دور له قائمة تنقل خاصة
- لوحة تحكم الزبون بأربع أقسام ملونة (جاهزة / قيد التصليح / سجل / ديون)
- لوحة تحكم الفني والمدير مع إحصائيات وآخر المحركات
- إضافة محرك مع بحث تلقائي عن الزبون + إدراج صور العطل + قائمة قطع غيار ديناميكية
- نظام مراسلة فوري (Polling كل 5 ثوان) بين الزبون والورشة مع مشاركة صور
- إدارة قطع الغيار (CRUD)
- إدارة الديون مع تتبّع السعر النهائي والمبلغ المدفوع وحالة الدفع (مسبق/في الموعد/متأخر)
- إرسال تذكيرات للزبائن المدينين (إشعار فوري + خيار أسبوعي/شهري)
- تقارير رسومية (Chart.js): حالة المحركات + نشاط الأشهر الأخيرة
- إدارة المستخدمين من قبل المدير (إضافة/تعديل/حذف فنيين وزبائن)
- نسخ احتياطي كامل لقاعدة البيانات بصيغة JSON (للمدير فقط)
- إشعارات ظاهرة في القائمة الجانبية (حواسيب) وأيقونة (هواتف)
- تصميم متجاوب RTL مع خط Cairo
- لوغو SVG مخصص + PWA Manifest (يظهر كأيقونة للتطبيق)
- العملة: الدينار الجزائري (دج)

## URIs و API (المسارات)

### المصادقة
- `POST /api/auth/login` { username, password }
- `POST /api/auth/register` { username, password, full_name, phone } (زبون فقط)
- `POST /api/auth/logout`
- `GET /api/auth/me`

### المستخدمون
- `GET /api/users?role=&q=` (admin/technician)
- `POST /api/users` (admin) { username, password, role, full_name, phone, notify_frequency }
- `PUT /api/users/:id` (admin)
- `DELETE /api/users/:id` (admin)

### المحركات
- `GET /api/engines?status=`
- `GET /api/engines/:id`
- `POST /api/engines` (staff)
- `PUT /api/engines/:id` (staff)
- `DELETE /api/engines/:id` (admin)

### الرسائل والإشعارات
- `GET /api/messages/conversations`
- `GET /api/messages?with=USER_ID`
- `POST /api/messages` { to_user_id, body, image_url }
- `GET /api/messages/unread-count`
- `GET /api/notifications`
- `POST /api/notifications/read`

### الديون
- `GET /api/debts`
- `POST /api/debts/pay` (staff) { engine_id, amount, payment_status }
- `POST /api/debts/remind` (staff) { customer_id }

### قطع الغيار
- `GET /api/spare-parts`, `POST`, `PUT /api/spare-parts/:id`, `DELETE /api/spare-parts/:id`

### التقارير والنسخ الاحتياطي
- `GET /api/stats` (staff)
- `GET /api/reports` (staff)
- `GET /api/backup` (admin — يُنزّل JSON)

## بنية قاعدة البيانات (D1 SQLite)
- `users` — المستخدمون (admin/technician/customer) + تجزئة كلمة المرور + notify_frequency
- `engines` — المحركات (status, payment_status, entry/expected/delivered dates, prices, parts_list JSON)
- `messages` — الرسائل (from/to/body/image_url/engine_id/is_read)
- `notifications` — الإشعارات (type: status/debt/message/info)
- `spare_parts` — قطع الغيار (name/quantity/price)
- `repair_reports` — تقارير الإصلاح
- `sessions` — جلسات الدخول
- `backups` — سجلّ النسخ الاحتياطية

## بيانات تجريبية
- **المدير**: `admin` / `admin123`
- **الفني**: `technician` / `tech123`
- **الزبون**: `customer1` / `customer123`

## دليل الاستخدام
1. افتح الرابط وسجّل الدخول باستخدام أحد الحسابات التجريبية، أو اضغط "إنشاء حساب زبون" لفتح حساب جديد.
2. **كزبون**: تابع محركاتك عبر لوحة التحكم ذات الأقسام الأربعة، أو فتح تفاصيل محرك، أو مراسلة الورشة، أو متابعة ديونك.
3. **كفنّي/مدير**: أضف محركاً جديداً، تابع حالات الإصلاح، سجّل المدفوعات، أرسل تذكيرات للزبائن المدينين، اعرض التقارير.
4. **كمدير فقط**: أدر جميع المستخدمين، أنشئ نسخاً احتياطية.

## الأمان
- كلمات المرور مُجزّأة بـ SHA-256 (Web Crypto API)
- Session tokens عشوائية 256-bit
- HttpOnly cookies + SameSite=Lax
- Role-based authorization على جميع نقاط النهاية

## التطوير محلياً
```bash
npm run build
pm2 start ecosystem.config.cjs
# يشتغل على http://localhost:3000
```

## النشر
- **المنصّة**: Cloudflare Pages
- **قاعدة البيانات**: Cloudflare D1
- **الحالة**: ✅ جاهز للنشر
- **آخر تحديث**: 2026-04-23
