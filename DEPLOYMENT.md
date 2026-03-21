# 🚀 دليل نشر خادم Atheer على DigitalOcean

دليل شامل ومفصّل لنشر خادم Atheer على منصة **DigitalOcean** بطريقتين:
- **الطريقة الأولى (الأسهل):** عبر منصة App Platform (بدون إدارة سيرفر)
- **الطريقة الثانية:** عبر Droplet مع Docker (سيرفر كامل)

---

## 📋 المتطلبات الأساسية

1. حساب على [DigitalOcean](https://cloud.digitalocean.com/registrations/new)
2. المستودع على GitHub: `ahmedaliahmed775/Atheer_Server`
3. ربط حساب GitHub بحساب DigitalOcean

---

## الطريقة الأولى: DigitalOcean App Platform (الأسهل والأسرع) ⭐

هذه الطريقة **لا تحتاج إدارة سيرفر** — DigitalOcean يتولى كل شيء تلقائياً.

### الخطوة 1: إنشاء تطبيق جديد

1. سجّل الدخول إلى [DigitalOcean](https://cloud.digitalocean.com)
2. اضغط على **Create** → **Apps**
3. اختر **GitHub** كمصدر الكود
4. سيُطلب منك ربط حسابك على GitHub (إذا لم يكن مربوطاً)
5. اختر المستودع: `ahmedaliahmed775/Atheer_Server`
6. اختر الفرع: `main`

### الخطوة 2: إعداد التطبيق

1. DigitalOcean سيكتشف ملف `Dockerfile` تلقائياً
2. اضغط **Edit Plan** واختر:
   - **Basic** → أصغر حجم (حوالي $5/شهر)
3. اضغط **Next**

### الخطوة 3: إضافة قاعدة البيانات

1. اضغط **Add Resource** → **Database**
2. اختر **PostgreSQL** (Dev Database - مجاناً للتجربة أو $7/شهر للإنتاج)
3. اضغط **Add**

### الخطوة 4: إعداد متغيرات البيئة

اضغط على التطبيق → **Settings** → **App-Level Environment Variables** وأضف:

| المتغير | القيمة | النوع |
|---------|--------|-------|
| `NODE_ENV` | `production` | عادي |
| `PORT` | `3000` | عادي |
| `JWT_SECRET` | (مفتاح سري قوي) | 🔒 Secret |
| `JWT_EXPIRES_IN` | `7d` | عادي |
| `ADMIN_EMAIL` | `admin@atheer.app` | عادي |
| `ADMIN_PASSWORD` | (كلمة مرور قوية) | 🔒 Secret |

> **ملاحظة مهمة:** متغيرات قاعدة البيانات (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) يتم ربطها **تلقائياً** عند إضافة قاعدة البيانات.

**لتوليد مفتاح JWT سري قوي:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### الخطوة 5: النشر

1. اضغط **Next** ثم **Create Resources**
2. انتظر حتى ينتهي البناء والنشر (3-5 دقائق)
3. ستحصل على رابط مثل: `https://atheer-server-xxxxx.ondigitalocean.app`

### الخطوة 6: التحقق

```bash
# فحص حالة الخادم
curl https://atheer-server-xxxxx.ondigitalocean.app/

# لوحة الإدارة
# افتح في المتصفح: https://atheer-server-xxxxx.ondigitalocean.app/admin
```

### النشر التلقائي

كل مرة تعمل `git push` إلى فرع `main`، سيتم **إعادة النشر تلقائياً**! 🎉

---

## الطريقة الثانية: Droplet مع Docker (سيطرة كاملة)

هذه الطريقة تمنحك **تحكماً كاملاً** في السيرفر.

### الخطوة 1: إنشاء Droplet

1. سجّل الدخول إلى [DigitalOcean](https://cloud.digitalocean.com)
2. اضغط **Create** → **Droplets**
3. اختر الإعدادات:
   - **Region:** أقرب منطقة (مثلاً `Frankfurt` أو `Bangalore`)
   - **Image:** **Marketplace** → ابحث عن **Docker on Ubuntu**
   - **Size:** Basic → $6/شهر (1 GB RAM, 1 vCPU) — كافي للبداية
   - **Authentication:** اختر **SSH Key** (الأفضل أمنياً) أو **Password**
4. اضغط **Create Droplet**
5. انسخ عنوان IP الخادم (مثلاً `164.90.xxx.xxx`)

### الخطوة 2: الاتصال بالسيرفر

```bash
ssh root@164.90.xxx.xxx
```

### الخطوة 3: تحديث النظام

```bash
apt update && apt upgrade -y
```

### الخطوة 4: سحب المشروع

```bash
cd /root
git clone https://github.com/ahmedaliahmed775/Atheer_Server.git
cd Atheer_Server
```

### الخطوة 5: إعداد متغيرات البيئة

```bash
cp .env.example .env
nano .env
```

عدّل الملف بالقيم الصحيحة:

```env
# إعدادات قاعدة البيانات
DB_HOST=db
DB_PORT=5432
DB_NAME=atheer_db
DB_USER=postgres
DB_PASSWORD=كلمة_مرور_قوية_هنا

# إعدادات JWT
JWT_SECRET=مفتاح_سري_طويل_وقوي_هنا
JWT_EXPIRES_IN=7d

# إعدادات الخادم
PORT=3000
NODE_ENV=production

# إعدادات لوحة الإدارة
ADMIN_EMAIL=admin@atheer.app
ADMIN_PASSWORD=كلمة_مرور_لوحة_الإدارة
```

### الخطوة 6: تشغيل التطبيق باستخدام Docker Compose

```bash
docker compose up -d
```

> هذا الأمر سيقوم بـ:
> - بناء صورة Docker للتطبيق
> - تشغيل قاعدة بيانات PostgreSQL
> - ربط التطبيق بقاعدة البيانات
> - تشغيل كل شيء في الخلفية

### الخطوة 7: التحقق من التشغيل

```bash
# عرض حالة الحاويات
docker compose ps

# عرض سجلات التطبيق
docker compose logs app

# فحص الخادم
curl http://localhost:3000/
```

### الخطوة 8: إعداد Firewall

```bash
# السماح بالمنافذ الضرورية فقط
ufw allow 22      # SSH
ufw allow 80      # HTTP
ufw allow 443     # HTTPS
ufw enable
```

### الخطوة 9: إعداد Nginx كـ Reverse Proxy (اختياري لكن موصى به)

```bash
apt install nginx -y
```

أنشئ ملف الإعداد:

```bash
nano /etc/nginx/sites-available/atheer
```

أضف المحتوى التالي:

```nginx
server {
    listen 80;
    server_name <your-domain.com>;  # ← استبدل بالنطاق الخاص بك

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

فعّل الإعداد:

```bash
ln -s /etc/nginx/sites-available/atheer /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

### الخطوة 10: إعداد SSL مجاني مع Let's Encrypt (اختياري لكن مهم)

> **ملاحظة:** تحتاج دومين (نطاق) يشير إلى عنوان IP الخادم.

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d <your-domain.com>  # ← استبدل بالنطاق الخاص بك
```

سيتم تجديد الشهادة تلقائياً كل 90 يوماً.

---

## 🔄 تحديث التطبيق

### على App Platform
```bash
# فقط ادفع التغييرات إلى GitHub
git push origin main
# يتم النشر تلقائياً!
```

### على Droplet
```bash
ssh root@164.90.xxx.xxx
cd /root/Atheer_Server
git pull origin main
docker compose up -d --build
```

---

## 🔍 الأوامر المفيدة

```bash
# عرض حالة الحاويات
docker compose ps

# عرض سجلات التطبيق (آخر 100 سطر)
docker compose logs --tail 100 app

# عرض سجلات قاعدة البيانات
docker compose logs db

# متابعة السجلات بشكل مباشر
docker compose logs -f app

# إعادة تشغيل التطبيق
docker compose restart app

# إيقاف كل شيء
docker compose down

# إيقاف وحذف البيانات (تحذير: يحذف قاعدة البيانات!)
docker compose down -v

# الدخول إلى قاعدة البيانات
docker compose exec db psql -U postgres -d atheer_db
```

---

## ⚠️ نصائح أمنية مهمة

1. **غيّر كلمات المرور الافتراضية** — لا تستخدم `admin123` أو `postgres_password` في الإنتاج
2. **استخدم JWT_SECRET قوي** — على الأقل 64 حرفاً عشوائياً
3. **فعّل SSL/HTTPS** — ضروري لحماية البيانات أثناء النقل
4. **خذ نسخ احتياطية** — فعّل النسخ الاحتياطي التلقائي في DigitalOcean
5. **راقب السيرفر** — استخدم DigitalOcean Monitoring أو خدمة مثل UptimeRobot
6. **حدّث النظام** — قم بتحديث النظام والحزم بانتظام

---

## 💰 تقدير التكاليف الشهرية

| الخدمة | App Platform | Droplet |
|--------|-------------|---------|
| السيرفر | $5 - $12 | $6 |
| قاعدة البيانات | $0 (Dev) / $7 (Prod) | مضمّن |
| النطاق (Domain) | $1 - $12/سنة | $1 - $12/سنة |
| **الإجمالي** | **$5 - $19/شهر** | **$6/شهر** |

---

## 📞 الدعم

- [توثيق DigitalOcean](https://docs.digitalocean.com/)
- [مجتمع DigitalOcean](https://www.digitalocean.com/community)
- [حالة DigitalOcean](https://status.digitalocean.com/)
