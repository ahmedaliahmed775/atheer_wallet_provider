

# Jawali Wallet Provider (جوالي)

سيرفر محفظة إلكترونية متوافق 100% مع بروتوكول جوالي اليمنية (WeCash)

---

## ⚡️ التغييرات الجوهرية (v4.0)

- **هيكل الطلبات:** جميع الطلبات (POST/PUT) يجب أن تكون بصيغة JSON وتحتوي على كائنين رئيسيين:
  - `header`: يحتوي على الحقول الإلزامية (`messageContext`, `messageId`, `messageTimestamp`, `callerId`)
  - `body`: يحتوي على بيانات العملية الفعلية
- **نظام القسائم (Voucher/OTP):**
  - العميل يمكنه توليد قسيمة (Voucher) من رصيده عبر `/api/v1/wallet/generate-voucher`
  - رمز القسيمة صالح لمدة 5 دقائق فقط ويُستهلك مرة واحدة
- **خصم التاجر (E-Commerce Cashout):**
  - التاجر لا يستطيع الخصم إلا باستخدام رمز قسيمة صالح
  - يجب إرسال `agentWallet`, `password`, `accessToken`, و`voucher` في body الطلب
- **توحيد الاستجابات:**
  - كل استجابة ترجع بصيغة موحدة: `ResponseCode`, `ResponseMessage`, و`body`

---

## 🛠️ نقاط النهاية (Endpoints)

### 1. توليد قسيمة (Voucher)
```
POST /api/v1/wallet/generate-voucher
Content-Type: application/json
{
  "header": {
    "messageContext": "VOUCHER_GEN",
    "messageId": "...",
    "messageTimestamp": "...",
    "callerId": "..."
  },
  "body": {
    "amount": 500
  }
}
```
**الاستجابة:**
```
{
  "ResponseCode": 0,
  "ResponseMessage": "تم إنشاء القسيمة بنجاح",
  "body": {
    "voucherCode": "ABC12345",
    "amount": 500,
    "expiresAt": "2026-03-28T12:34:56Z",
    "status": "ACTIVE"
  }
}
```

### 2. خصم التاجر (Cashout)
```
POST /api/v1/merchant/switch-charge
Content-Type: application/json
{
  "header": {
    "messageContext": "CASHOUT_REQ",
    "messageId": "...",
    "messageTimestamp": "...",
    "callerId": "..."
  },
  "body": {
    "agentWallet": "770000001",
    "password": "merchant_password",
    "accessToken": "jwt_token",
    "voucher": "ABC12345"
  }
}
```
**الاستجابة:**
```
{
  "ResponseCode": 0,
  "ResponseMessage": "تمت عملية الخصم بنجاح وإضافة المبلغ إلى التاجر.",
  "body": {
    "voucherCode": "ABC12345",
    "amount": 500,
    "merchantWallet": "770000001"
  }
}
```

---

## 🗄️ هيكل قاعدة البيانات
- **Voucher:**
  - id, customerId, amount, voucherCode, expiresAt, status (ACTIVE/CONSUMED/EXPIRED)

---

## 🛡️ الحماية
- جميع الطلبات تمر عبر Middleware يفرض وجود header/body
- كل الاستجابات موحدة الصيغة
- لا يمكن خصم أي مبلغ إلا بقسيمة صالحة

---

*تمت إعادة هيكلة المشروع بالكامل ليتوافق مع وثائق WALLETAUTHENTICATION و ECOMMCASHOUT الخاصة بمحفظة جوالي اليمنية.*
