// مسارات المصادقة: تسجيل الحساب وتسجيل الدخول
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { User, Wallet } from '../models/index.js';

// التحقق من وجود مفتاح JWT السري في متغيرات البيئة
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  تحذير: JWT_SECRET غير محدد. استخدام قيمة افتراضية غير آمنة للبيئة التطويرية فقط.');
}

const JWT_SECRET = process.env.JWT_SECRET || 'atheer_dev_secret_not_for_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// تحديد معدل طلبات المصادقة للحماية من هجمات القوة العمياء
// يسمح بـ 10 محاولات تسجيل دخول كل 15 دقيقة لكل عنوان IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'تجاوزت الحد المسموح به من محاولات تسجيل الدخول. يرجى المحاولة بعد 15 دقيقة.' },
});

const router = express.Router();

// الرصيد الابتدائي للعميل عند فتح حساب جديد (100,000 ريال)
const CUSTOMER_INITIAL_BALANCE = 100000.0;
// الرصيد الابتدائي للتاجر عند فتح حساب جديد (0 ريال)
const MERCHANT_INITIAL_BALANCE = 0.0;

/**
 * POST /api/v1/auth/signup
 * تسجيل حساب جديد (عميل أو تاجر)
 * يُنشئ المستخدم ومحفظته في نفس الوقت
 */
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { phone, password, name, role } = req.body;

    // التحقق من إدخال جميع البيانات المطلوبة
    if (!phone || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'يرجى تعبئة جميع الحقول المطلوبة: رقم الهاتف، كلمة المرور، والاسم',
      });
    }

    // التحقق من أن رقم الهاتف غير مسجل مسبقاً
    const existingUser = await User.findByPk(phone);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'رقم الهاتف مسجل مسبقاً في النظام',
      });
    }

    // تشفير كلمة المرور قبل حفظها في قاعدة البيانات
    const hashedPassword = await bcrypt.hash(password, 12);

    // تحديد الدور: 'customer' للعميل (افتراضي) أو 'merchant' للتاجر
    const userRole = role === 'merchant' ? 'merchant' : 'customer';

    // إنشاء المستخدم في قاعدة البيانات
    const user = await User.create({
      phone,
      password: hashedPassword,
      name,
      role: userRole,
    });

    // تحديد الرصيد الابتدائي بناءً على دور المستخدم
    const initialBalance =
      userRole === 'customer' ? CUSTOMER_INITIAL_BALANCE : MERCHANT_INITIAL_BALANCE;

    // إنشاء محفظة للمستخدم الجديد
    await Wallet.create({
      phone,
      balance: initialBalance,
    });

    // إنشاء رمز JWT للمستخدم الجديد
    const token = jwt.sign(
      { phone: user.phone, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      success: true,
      message: 'تم إنشاء الحساب بنجاح',
      data: {
        access_token: token,
        user: {
          phone: user.phone,
          name: user.name,
          role: user.role,
          initial_balance: initialBalance,
        },
      },
    });
  } catch (error) {
    console.error('خطأ في تسجيل الحساب:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ داخلي في الخادم',
    });
  }
});

/**
 * POST /api/v1/auth/login
 * تسجيل الدخول وإرجاع رمز الوصول JWT
 */
/**
 * POST /api/v1/auth/login
 * تسجيل الدخول وإرجاع رمز الوصول المتوافق مع بروتوكول محفظة جوالي
 * يدعم application/x-www-form-urlencoded
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    // دعم استقبال البيانات من x-www-form-urlencoded أو JSON
    // الحقول المطلوبة حسب البروتوكول: grant_type, username, password, client_id, client_secret, scope
    const { grant_type, username, password, client_id, client_secret } = req.body;

    // التحقق من الحقول الأساسية (username هو رقم الهاتف في نظامنا)
    if (!username || !password) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "يرجى إدخال اسم المستخدم (رقم الهاتف) وكلمة المرور"
      });
    }

    // البحث عن المستخدم (username = phone)
    const user = await User.findByPk(username);
    if (!user) {
      return res.status(401).json({
        error: "invalid_grant",
        error_description: "اسم المستخدم أو كلمة المرور غير صحيحة"
      });
    }

    // مقارنة كلمة المرور
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: "invalid_grant",
        error_description: "اسم المستخدم أو كلمة المرور غير صحيحة"
      });
    }

    // إنشاء رمز JWT
    const token = jwt.sign(
      { phone: user.phone, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // حساب وقت الانتهاء بالثواني (افتراضي 7 أيام إذا لم يحدد في البيئة)
    const expiresInSeconds = 7 * 24 * 60 * 60; 

    // الاستجابة المتوافقة مع البروتوكول المطلوب
    return res.status(200).json({
      access_token: token,
      token_type: "Bearer",
      expires_in: expiresInSeconds,
      scope: req.body.scope || "read write",
      userName: user.name,
      userPhone: user.phone
    });
  } catch (error) {
    console.error('خطأ في تسجيل الدخول:', error);
    return res.status(500).json({
      error: "server_error",
      error_description: "حدث خطأ داخلي في الخادم"
    });
  }
});

export default router;
