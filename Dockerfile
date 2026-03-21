# ===== مرحلة البناء =====
FROM node:20-alpine AS builder

WORKDIR /app

# نسخ ملفات التبعيات أولاً لاستغلال التخزين المؤقت في Docker
COPY package.json package-lock.json ./

# تثبيت التبعيات (فقط الإنتاج)
RUN npm install --omit=dev

# ===== مرحلة التشغيل =====
FROM node:20-alpine

# إنشاء مستخدم غير root لأسباب أمنية
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# نسخ التبعيات من مرحلة البناء
COPY --from=builder /app/node_modules ./node_modules

# نسخ ملفات المشروع
COPY package.json ./
COPY src ./src

# تعيين متغيرات البيئة الافتراضية
ENV NODE_ENV=production
ENV PORT=3000

# منح صلاحيات الكتابة للمستخدم على مجلد التطبيق
RUN chown -R appuser:appgroup /app

# تشغيل التطبيق بمستخدم غير root
USER appuser

# فتح المنفذ
EXPOSE 3000

# أمر التشغيل
CMD ["node", "src/app.js"]
