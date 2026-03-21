# نشر خادم المحفظة (Wallet Provider) على DigitalOcean

## المتطلبات

- تطبيق **المقسم (Switch)** منشور مسبقاً ورابطه HTTPS جاهز.
- في قاعدة بيانات **المقسم** يوجد تاجر (`merchants`) بـ `apiKey` يساوي **`WALLET_API_KEY`** الذي ستضعه هنا (يُنشأ عبر `npm run seed:merchant` في مستودع المقسم).

## الخطوات

1. أنشئ **تطبيق App Platform** من هذا المستودع (`Dockerfile` في الجذر).
2. أضف **PostgreSQL مُداراً** منفصلاً عن قاعدة المقسم.
3. في **Environment Variables** (أو من `.do/app.yaml`):
   - `ATHEER_SWITCH_URL` — عنوان المقسم، مثل `https://atheer-switch-xxx.ondigitalocean.app` (بدون شرطة مائلة أخيرة)
   - `WALLET_API_KEY` — **نفس** قيمة `apiKey` للتاجر في المقسم
   - `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ATHEER_TOKEN_KEY` (32 حرفاً للتشفير إن وُجد في التطبيق)

4. انشر واختبر:

   ```bash
   curl https://your-wallet-app.ondigitalocean.app/
   ```

## ترتيب النشر الموصى به

1. المقسم + Redis + PostgreSQL (المقسم)  
2. `seed:merchant` على المقسم  
3. المحفظة + PostgreSQL (المحفظة) مع `ATHEER_SWITCH_URL` و`WALLET_API_KEY`
