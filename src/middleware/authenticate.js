// وسيط التحقق من هوية المستخدم باستخدام رمز JWT
import jwt from 'jsonwebtoken';
import 'dotenv/config';

// التحقق من وجود مفتاح JWT السري في متغيرات البيئة
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  تحذير: JWT_SECRET غير محدد. استخدام قيمة افتراضية غير آمنة للبيئة التطويرية فقط.');
}

const JWT_SECRET = process.env.JWT_SECRET || 'atheer_dev_secret_not_for_production';

/**
 * وسيط يتحقق من صحة رمز الوصول (Bearer Token)
 * ويضيف بيانات المستخدم إلى كائن الطلب
 */
const authenticate = (req, res, next) => {
  // استخراج رأس التفويض من الطلب
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      // رسالة خطأ: رمز الوصول مفقود أو بصيغة غير صحيحة
      message: 'رمز الوصول مفقود أو بصيغة غير صحيحة',
    });
  }

  // استخراج الرمز من الرأس (بعد كلمة "Bearer ")
  const token = authHeader.split(' ')[1];

  try {
    // التحقق من صحة الرمز وفك تشفيره
    const decoded = jwt.verify(token, JWT_SECRET);
    // إضافة بيانات المستخدم إلى كائن الطلب لاستخدامها في المسارات
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      // رسالة خطأ: رمز الوصول غير صالح أو منتهي الصلاحية
      message: 'رمز الوصول غير صالح أو منتهي الصلاحية',
    });
  }
};

export default authenticate;
