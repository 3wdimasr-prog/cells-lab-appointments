# مختبرات الخلايا الطبية - نسخة Live على Vercel + Supabase

هذه النسخة تجعل البيانات Live ومشتركة بين كل الموظفين.
أي إضافة أو تعديل أو حذف يظهر مباشرة عند كل المستخدمين.

## 1) إنشاء قاعدة البيانات في Supabase

1. افتح Supabase.
2. أنشئ Project جديد.
3. من SQL Editor الصق محتوى ملف:
   `supabase_schema.sql`
4. اضغط Run.

## 2) جلب مفاتيح Supabase

من Supabase:
Project Settings > API

انسخ:
- Project URL
- anon public key

## 3) إعداد المشروع محليًا

أنشئ ملف باسم `.env` بجوار package.json وضع فيه:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
```

ثم شغل:

```bash
npm install
npm run dev
```

## 4) الرفع على Vercel

1. ارفع المشروع إلى GitHub.
2. افتح Vercel > New Project.
3. اختار الريبو.
4. أضف Environment Variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
5. Deploy.

## ملاحظات أمنية مهمة

السياسات الموجودة في ملف SQL مفتوحة للتشغيل السريع باستخدام anon key.
إذا الرابط سيكون عامًا، الأفضل إضافة Login وصلاحيات مستخدمين قبل التشغيل النهائي.

## المميزات

- بيانات Live مشتركة بين كل الأجهزة
- إضافة موعد
- تعديل موعد
- حذف موعد
- منع تعارض مواعيد نفس المختص/الطبيب
- بحث وفلاتر
- واتساب مباشر
- تصدير Excel
- استيراد Excel
