// إعداد لوحة الإدارة AdminJS لإدارة بيانات النظام
import { AdminJS } from 'adminjs';
import { buildAuthenticatedRouter } from '@adminjs/express';
import { Database, Resource } from '@adminjs/sequelize';
import { sequelize, User, Wallet, Transaction } from '../models/index.js';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import 'dotenv/config';

// التحقق من وجود الإعدادات الأمنية المطلوبة للوحة الإدارة
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  تحذير: ADMIN_EMAIL أو ADMIN_PASSWORD غير محددين. سيتم استخدام البيانات الافتراضية للبيئة التطويرية فقط.');
}
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  تحذير: JWT_SECRET غير محدد. جلسات لوحة الإدارة ستستخدم مفتاحاً افتراضياً غير آمن.');
}

// مفتاح تشفير ملفات تعريف الارتباط (يجب أن يكون 32 حرفاً على الأقل)
const COOKIE_SECRET = process.env.JWT_SECRET || 'atheer_dev_cookie_secret_32_chars_!';

// إعداد مخزن الجلسات باستخدام PostgreSQL لتجنب تحذير MemoryStore في الإنتاج
const PgSession = connectPgSimple(session);
const pgPool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ...(process.env.DB_SSL === 'true' && {
    ssl: { require: true, rejectUnauthorized: false },
  }),
});

// إغلاق مجموعة اتصالات الجلسات عند إيقاف الخادم بشكل نظيف
process.on('SIGTERM', () => pgPool.end());

// تسجيل محوّل Sequelize مع AdminJS
AdminJS.registerAdapter({ Database, Resource });

/**
 * إنشاء وإعداد لوحة الإدارة
 * متاحة على المسار /admin
 */
const setupAdmin = (app) => {
  const adminJs = new AdminJS({
    resources: [
      {
        resource: User,
        options: {
          navigation: { name: 'إدارة النظام', icon: 'User' },
          listProperties: ['phone', 'name', 'role'],
          showProperties: ['phone', 'name', 'role'],
          editProperties: ['phone', 'name', 'role', 'password'],
          filterProperties: ['phone', 'name', 'role'],
          properties: {
            phone: { isTitle: true },
          }
        },
      },
      {
        resource: Wallet,
        options: {
          navigation: { name: 'إدارة النظام', icon: 'Money' },
          // تم إضافة active_tokens هنا للعرض في الجداول
          listProperties: ['phone', 'balance', 'active_tokens'],
          showProperties: ['phone', 'balance', 'active_tokens'],
          editProperties: ['balance', 'active_tokens'],
          filterProperties: ['phone', 'active_tokens'],
          properties: {
            phone: { isTitle: true },
            balance: { type: 'currency', currency: 'YER' },
          }
        },
      },
      {
        resource: Transaction,
        options: {
          navigation: { name: 'السجلات المالية', icon: 'Receipt' },
          actions: {
            new: { isAccessible: false },
            edit: { isAccessible: false },
            delete: { isAccessible: false },
          },
          listProperties: ['id', 'sender', 'receiver', 'amount', 'status', 'createdAt'],
          showProperties: ['id', 'sender', 'receiver', 'amount', 'status', 'createdAt', 'nonce'],
          filterProperties: ['sender', 'receiver', 'status', 'createdAt'],
          properties: {
            amount: { type: 'currency', currency: 'YER' },
          }
        },
      },
    ],
    rootPath: '/admin',
    branding: {
      companyName: 'Atheer Admin',
      logo: false,
      favicon: false,
      withMadeWithLove: false,
    },
    // تعريب مصطلحات لوحة الإدارة الأساسية
    locale: {
      language: 'ar',
      translations: {
        labels: { User: 'المستخدمين', Wallet: 'المحافظ', Transaction: 'العمليات' },
        resources: {
          Wallet: { properties: { phone: 'رقم الهاتف', balance: 'الرصيد', active_tokens: 'التوكنات النشطة' } },
          User: { properties: { phone: 'رقم الهاتف', name: 'الاسم', role: 'الصلاحية', password: 'كلمة المرور' } },
          Transaction: { properties: { sender: 'المرسل', receiver: 'المستلم', amount: 'المبلغ', status: 'الحالة', createdAt: 'التاريخ' } }
        }
      }
    }
  });

  const adminRouter = buildAuthenticatedRouter(
    adminJs,
    {
      authenticate: async (email, password) => {
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@atheer.app';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        if (email === adminEmail && password === adminPassword) {
          return { email };
        }
        return null;
      },
      cookieName: 'atheer-admin-session',
      cookiePassword: COOKIE_SECRET,
    },
    null,
    {
      resave: false,
      saveUninitialized: true,
      secret: COOKIE_SECRET,
      store: new PgSession({
        pool: pgPool,
        createTableIfMissing: true,
      }),
      cookie: { httpOnly: true, secure: process.env.DB_SSL === 'true' },
    }
  );

  app.use(adminJs.options.rootPath, adminRouter);
  return adminJs;
};

export default setupAdmin;
