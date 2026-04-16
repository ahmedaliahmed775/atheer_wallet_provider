// إعداد لوحة الإدارة AdminJS لإدارة بيانات النظام
import { AdminJS } from 'adminjs';
import { buildAuthenticatedRouter } from '@adminjs/express';
import { Database, Resource } from '@adminjs/sequelize';
import { sequelize, User, Transaction, BillPayment, CashoutCode } from '../models/index.js';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import 'dotenv/config';

// التحقق من وجود الإعدادات الأمنية المطلوبة للوحة الإدارة
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  تحذير: ADMIN_EMAIL أو ADMIN_PASSWORD غير محددين. سيتم استخدام البيانات الافتراضية للبيئة التطويرية فقط.');
}

// مفتاح تشفير ملفات تعريف الارتباط
const COOKIE_SECRET = process.env.JWT_SECRET || 'atheer_dev_cookie_secret_32_chars_!';

// إعداد مخزن الجلسات باستخدام PostgreSQL
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
          listProperties: ['id', 'phone', 'name', 'role', 'posNumber', 'balance', 'isActive'],
          showProperties: ['id', 'phone', 'name', 'role', 'posNumber', 'balance', 'isActive', 'createdAt'],
          editProperties: ['name', 'phone', 'role', 'posNumber', 'balance', 'isActive'],
          filterProperties: ['phone', 'name', 'role', 'isActive'],
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
          listProperties: ['id', 'type', 'amount', 'status', 'refId', 'createdAt'],
          showProperties: ['id', 'senderId', 'receiverId', 'type', 'amount', 'status', 'note', 'refId', 'metadata', 'createdAt'],
          filterProperties: ['type', 'status', 'createdAt'],
          properties: {
            amount: { type: 'currency', currency: 'YER' },
          }
        },
      },
      {
        resource: BillPayment,
        options: {
          navigation: { name: 'السجلات المالية', icon: 'Receipt' },
          actions: { new: { isAccessible: false }, edit: { isAccessible: false }, delete: { isAccessible: false } },
          listProperties: ['id', 'userId', 'category', 'provider', 'accountNumber', 'amount', 'status', 'createdAt'],
          properties: { amount: { type: 'currency', currency: 'YER' } }
        },
      },
      {
        resource: CashoutCode,
        options: {
          navigation: { name: 'السجلات المالية', icon: 'Key' },
          actions: { new: { isAccessible: false }, edit: { isAccessible: false }, delete: { isAccessible: false } },
          listProperties: ['id', 'userId', 'type', 'amount', 'code', 'status', 'expiresAt', 'createdAt'],
          properties: { amount: { type: 'currency', currency: 'YER' } }
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
    locale: {
      language: 'ar',
      translations: {
        labels: { User: 'المستخدمين', Transaction: 'المعاملات', BillPayment: 'سداد الفواتير', CashoutCode: 'أكواد السحب' },
        resources: {
          User: { properties: { phone: 'رقم الهاتف', name: 'الاسم', role: 'الصلاحية', posNumber: 'رقم نقطة البيع', balance: 'الرصيد', isActive: 'فعّال' } },
          Transaction: { properties: { senderId: 'المرسل', receiverId: 'المستلم', amount: 'المبلغ', status: 'الحالة', type: 'النوع', note: 'ملاحظة', refId: 'المرجع', createdAt: 'التاريخ' } },
          BillPayment: { properties: { userId: 'المستخدم', category: 'الفئة', provider: 'المزوّد', accountNumber: 'رقم الحساب', amount: 'المبلغ', status: 'الحالة' } },
          CashoutCode: { properties: { userId: 'المستخدم', type: 'النوع', amount: 'المبلغ', code: 'الكود', status: 'الحالة', expiresAt: 'ينتهي في' } }
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
