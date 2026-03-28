
// src/app.js
// نقطة الدخول الرئيسية لخادم Atheer Wallet Provider
import 'dotenv/config';
import express from 'express';
import { sequelize } from './models/index.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import merchantRoutes from './routes/merchant.js';
import setupAdmin from './admin/index.js';
import requestEnvelope from './middleware/requestEnvelope.js';
import standardResponse from './middleware/standardResponse.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// الثقة في البروكسي
app.set('trust proxy', 1);

// ===== إعداد لوحة الإدارة AdminJS =====
setupAdmin(app);

// وسيط تحليل طلبات JSON

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// === وسيط هيكل الطلبات والاستجابات حسب مواصفات جوالي ===
app.use(requestEnvelope);
app.use(standardResponse);

// ===== مسارات API =====
// مسارات المصادقة: تسجيل الحساب وتسجيل الدخول
app.use('/api/v1/auth', authRoutes);
// مسارات المحفظة: الرصيد وسجل المعاملات وطلب التوكنز (Proxy)
app.use('/api/v1/wallet', walletRoutes);
// مسارات التاجر: استقبال طلبات الخصم من المقسم (Atheer Switch)
app.use('/api/v1/merchant', merchantRoutes);

// مسار الصفحة الرئيسية للتحقق من حالة الخادم ووصف الخدمات
app.get('/', (req, res) => {
  res.json({
    name: 'Atheer Wallet Provider - سيرفر المحفظة المالية',
    version: '2.0.0 (Refactored)',
    status: 'running',
    uptime: process.uptime(),
    endpoints: {
      admin: '/admin',
      api: '/api/v1',
      auth: {
        signup: 'POST /api/v1/auth/signup',
        login: 'POST /api/v1/auth/login',
      },
      wallet: {
        balance: 'GET /api/v1/wallet/balance',
        history: 'GET /api/v1/wallet/history',
        offline_tokens: 'POST /api/v1/wallet/offline-tokens (Proxy to Switch)',
      },
      merchant: {
        switch_charge: 'POST /api/v1/merchant/switch-charge (For Atheer Switch only)',
      },
    },
  });
});

// معالج الأخطاء العامة
app.use((err, req, res, next) => {
  console.error('خطأ غير متوقع:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({
    success: false,
    message: 'حدث خطأ داخلي غير متوقع في الخادم',
  });
});

// معالج المسارات غير الموجودة
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `المسار المطلوب غير موجود: ${req.method} ${req.path}`,
  });
});

/**
 * تهيئة قاعدة البيانات وتشغيل الخادم
 */
const startServer = async () => {
  try {
    // اختبار الاتصال بقاعدة البيانات
    await sequelize.authenticate();
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');

    // الإنتاج: بدون alter لتجنب تعديل الجداول تلقائياً؛ التطوير: يسمح بمزامنة الهيكل
    const syncOpts =
      process.env.NODE_ENV === 'production' ? { alter: false } : { alter: true };
    await sequelize.sync(syncOpts);
    console.log('✅ تم مزامنة نماذج قاعدة البيانات');

    // تشغيل الخادم
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 خادم Atheer Wallet يعمل على المنفذ ${PORT}`);
      console.log(`📊 لوحة الإدارة: http://localhost:${PORT}/admin`);
      console.log(`🔗 واجهة API: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    console.error('❌ فشل تشغيل الخادم:', error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
