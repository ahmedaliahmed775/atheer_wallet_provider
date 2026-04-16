# Atheer Wallet Server

خادم نظام Atheer للمحفظة الإلكترونية — Node.js + Express + PostgreSQL

## المتطلبات

- Node.js >= 18
- PostgreSQL >= 14

## التثبيت

```bash
npm install
```

## الإعداد

انسخ ملف البيئة وعدّل القيم:

```bash
cp .env.example .env
```

أهم المتغيرات:

| المتغير | الوصف | القيمة الافتراضية |
|---|---|---|
| `DB_HOST` | عنوان قاعدة البيانات | `localhost` |
| `DB_PORT` | منفذ PostgreSQL | `5432` |
| `DB_NAME` | اسم قاعدة البيانات | `atheer_db` |
| `DB_USER` | مستخدم قاعدة البيانات | `postgres` |
| `DB_PASSWORD` | كلمة مرور قاعدة البيانات | — |
| `JWT_SECRET` | مفتاح توقيع JWT | `dev-secret-key` |
| `PORT` | منفذ الخادم | `3000` |

## التشغيل

```bash
# تشغيل تطويري (مع hot reload)
npm run dev

# تشغيل إنتاجي
npm start
```

السيرفر سيقوم تلقائياً بـ:
1. الاتصال بقاعدة البيانات
2. إنشاء/تحديث الجداول (`sync({ alter: true })`)
3. إضافة بيانات تجريبية إذا كانت قاعدة البيانات فارغة

## البيانات التجريبية

| الاسم | الهاتف | كلمة المرور | الدور | الرصيد | POS |
|---|---|---|---|---|---|
| أحمد علي | 777123456 | 123456 | customer | 25,400 | — |
| سارة محمد | 777654321 | 123456 | customer | 10,000 | — |
| سوبرماركت المدينة | 770000001 | 123456 | merchant | 0 | 100001 |
| مطعم السعادة | 770000002 | 123456 | merchant | 0 | 100002 |

## واجهات API

### المصادقة (`/api/v1/auth`)

| Method | Endpoint | الوصف |
|---|---|---|
| POST | `/signup` | إنشاء حساب جديد (customer/merchant) |
| POST | `/login` | تسجيل الدخول — يُرجع JWT token |
| POST | `/logout` | تسجيل الخروج (stateless) |

### المحفظة (`/api/v1/wallet`) — تتطلب Bearer Token

| Method | Endpoint | الوصف |
|---|---|---|
| GET | `/balance` | جلب الرصيد الحالي |
| GET | `/profile` | بيانات المستخدم |
| POST | `/transfer` | تحويل P2P لمشترك |
| POST | `/transfer-external` | حوالة خارجية (كود سحب) |
| POST | `/pay-bill` | سداد فاتورة (اتصالات/كهرباء/ماء/إنترنت) |
| POST | `/qr-pay` | دفع لتاجر عبر رقم نقطة البيع (POS) |
| POST | `/generate-cashout` | إنشاء كود سحب نقدي |
| POST | `/cash-in` | إيداع نقدي |
| GET | `/transactions` | سجل المعاملات (paginated) |
| GET | `/transactions/:id` | تفاصيل معاملة |
| GET | `/services` | قائمة خدمات سداد الفواتير |

### التاجر (`/api/v1/merchant`) — تتطلب Bearer Token + role=merchant

| Method | Endpoint | الوصف |
|---|---|---|
| GET | `/qr-info` | بيانات QR التاجر (posNumber + qrData) |
| GET | `/transactions` | معاملات التاجر الواردة |

### أخرى

| Method | Endpoint | الوصف |
|---|---|---|
| GET | `/health` | فحص حالة الخادم |

## البنية

```
src/
├── app.js                  # نقطة الدخول + middleware + seed
├── models/
│   └── index.js            # النماذج: User, Transaction, CashoutCode, BillPayment
├── routes/
│   ├── auth.js             # تسجيل/دخول/خروج
│   ├── wallet.js           # عمليات المحفظة
│   └── merchant.js         # عمليات التاجر
├── middleware/
│   └── authenticate.js     # JWT middleware + generateToken
└── admin/
    └── index.js            # لوحة إدارة AdminJS (اختياري)
```

## الأمان

- Rate limiting: 100 طلب / 15 دقيقة (عام)، 10 طلبات / 15 دقيقة (المصادقة)
- JWT مع صلاحية 7 أيام
- تشفير bcrypt (12 rounds) لكلمات المرور
- معاملات PostgreSQL مع row-level locking لمنع race conditions
