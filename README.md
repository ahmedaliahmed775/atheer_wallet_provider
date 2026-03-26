
# Atheer Wallet Provider Server (Mock Server v3.0)

هذا المشروع هو محاكي لمزود المحفظة المالية (Wallet Provider) ضمن نظام أثير، تم إعادة بنائه وتحديثه ليتوافق تماماً مع بروتوكولات محفظة جوالي (Jawali Wallet) المذكورة في التوثيق الرسمي (`login.odt` و `ECOMMCASHOUT.docx`).

يعمل هذا السيرفر كمحاكي (Mock Server) لمعالجة عمليات تسجيل الدخول والدفع المتداخلة، مع دعم كامل لهيكلية البيانات المطلوبة من قبل مقسم أثير المركزي.

---

## 📋 التحديثات الجوهرية في الإصدار 3.0

1.  **تحديث بروتوكول تسجيل الدخول:** دعم استقبال البيانات بصيغة `application/x-www-form-urlencoded` وإرجاع توكن متوافق مع معايير OAuth2 (access_token, token_type, expires_in).
2.  **هيكلية الطلبات المتداخلة (Nested JSON):** تحديث مسار الدفع لاستقبال طلبات تحتوي على كائني `header` و `body` بشكل منفصل.
3.  **منطق التحقق المزدوج:** إضافة شرط التحقق من صحة الـ `accessToken` وكلمة مرور المستخدم (Password) قبل إتمام أي عملية خصم من الرصيد.
4.  **تحديث مسميات الحقول:** تغيير المسميات لتتوافق مع بروتوكول جوالي (مثل `agentWallet` بدلاً من `merchantId` و `receiverMobile` بدلاً من `customerMobile`).
5.  **توسيع قاعدة البيانات:** إضافة حقول `refId` و `transactionType` لموديل المعاملات لضمان مطابقة البيانات بدقة.

---

## 📡 نقاط نهاية API المحدثة (Endpoints)

### 1. تسجيل الدخول (Authentication)
```
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded
```
**الحقول المطلوبة:**
*   `grant_type`: نوع المنح (مثلاً password).
*   `username`: رقم هاتف المستخدم.
*   `password`: كلمة مرور المستخدم.
*   `client_id` / `client_secret`: معرفات العميل.
*   `scope`: نطاق الصلاحيات.

**الاستجابة الناجحة:**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 604800,
  "userName": "اسم المستخدم",
  "userPhone": "770000000"
}
```

### 2. عمليات الدفع والخصم (Merchant/Switch)
```
POST /api/v1/merchant/switch-charge
Content-Type: application/json
```
**هيكلية الطلب (Nested JSON):**
```json
{
  "header": {
    "msgType": "CASH_OUT_REQ"
  },
  "body": {
    "agentWallet": "AGENT_ID",
    "receiverMobile": "770000000",
    "amount": 1000,
    "password": "user_password",
    "accessToken": "valid_jwt_token",
    "refId": "unique_reference_id"
  }
}
```

**الاستجابة الناجحة:**
```json
{
  "header": {
    "responseCode": "0000"
  },
  "body": {
    "txnId": "internal_uuid",
    "refId": "unique_reference_id",
    "message": "تمت العملية بنجاح"
  }
}
```

---

## 🏗️ هيكل المشروع المحدث

```
atheer_wallet_provider/
├── src/
│   ├── routes/
│   │   ├── auth.js           # مسار تسجيل الدخول (يدعم x-www-form-urlencoded)
│   │   ├── merchant.js       # مسار الدفع (يدعم الهيكلية المتداخلة والتحقق من التوكن)
│   │   └── wallet.js         # إدارة الرصيد والعمليات المحلية
│   ├── models/
│   │   ├── User.js           # بيانات المستخدمين وكلمات المرور المشفرة
│   │   ├── Wallet.js         # أرصدة المحافظ المالية
│   │   └── Transaction.js    # سجل العمليات (يشمل refId و transactionType)
│   └── app.js                # تهيئة الخادم والوسائط (Middleware)
└── ...
```

---

## 🔒 الأمان والتحقق

*   **JWT Verification:** يتم فحص الـ `accessToken` المرسل في جسم طلب الدفع للتأكد من هوية المستخدم صاحب المحفظة.
*   **Password Check:** يتم مطابقة كلمة المرور المرسلة في الطلب مع كلمة المرور المشفرة في قاعدة البيانات كطبقة حماية إضافية.
*   **Idempotency:** يتم استخدام حقل `refId` لمنع تكرار معالجة نفس العملية أكثر من مرة.

---
*نظام أثير - محاكي مزود المحفظة المتوافق مع بروتوكول جوالي*
