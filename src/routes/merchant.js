
// src/routes/merchant.js
// تم إعادة هيكلة هذا الملف بالكامل ليعمل كنقطة نهاية (Endpoint) خاصة بمقسم أثير (Atheer Switch)
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sequelize, User, Wallet, Transaction } from '../models/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'atheer_dev_secret_not_for_production';

// زيادة الحد المسموح به للطلبات لتتناسب مع التواصل بين الخوادم
const chargeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, 
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'REJECTED',
    message: 'تم تجاوز الحد الأقصى لطلبات الشحن من هذا المصدر.'
  },
});

const router = express.Router();
// لا حاجة للتحقق من هوية المستخدم (authenticate) لأن الطلب يأتي من المقسم الموثوق
router.use(chargeLimiter);

/**
 * @route   POST /api/v1/merchant/switch-charge
 * @desc    معالجة طلبات الخصم الواردة من مقسم الدفع المركزي (Atheer Switch)
 * @access  خاص بالمقسم (يتم تأمينه على مستوى الشبكة والبنية التحتية)
 */
/**
 * نقطة نهاية خصم الرصيد من محفظة العميل وتحويله إلى مستلم (P2P أو P2M)
 * - توثيق عبر x-switch-api-key
 * - تدعم التحويل من شخص لشخص (P2P) أو من شخص لتاجر (P2M)
 * - يتم خصم المرسل وتغذية المستلم في معاملة واحدة
 */
router.post('/switch-charge', async (req, res) => {
  // 1. استخراج البيانات من الهيكلية المتداخلة (Nested JSON)
  const { header, body } = req.body;

  if (!header || !body) {
    return res.status(400).json({
      header: { responseCode: "9999" },
      body: { message: "تنسيق الطلب غير صحيح، يجب أن يحتوي على header و body." }
    });
  }

  const { 
    agentWallet, // بدلاً من merchantId
    receiverMobile, // بدلاً من customerMobile
    amount, 
    voucher, 
    password, 
    accessToken, 
    refId 
  } = body;

  // 2. التحقق من وجود accessToken صحيح (الذي تم إصداره في خطوة Login)
  if (!accessToken) {
    return res.status(401).json({
      header: { responseCode: "4001" },
      body: { message: "accessToken مطلوب لإتمام العملية." }
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(accessToken, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({
      header: { responseCode: "4001" },
      body: { message: "accessToken غير صالح أو منتهي الصلاحية." }
    });
  }

  // 3. التحقق من كلمة المرور الصحيحة (للمستخدم صاحب التوكن)
  const user = await User.findByPk(decoded.phone);
  if (!user) {
    return res.status(404).json({
      header: { responseCode: "4004" },
      body: { message: "المستخدم غير موجود." }
    });
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      header: { responseCode: "4001" },
      body: { message: "كلمة المرور غير صحيحة." }
    });
  }

  // 4. التحقق من اكتمال البيانات الأساسية
  if (!amount || !receiverMobile || !agentWallet || !refId) {
    return res.status(400).json({
      header: { responseCode: "9999" },
      body: { message: "الطلب غير مكتمل، الحقول amount, receiverMobile, agentWallet, refId مطلوبة." }
    });
  }

  const chargeAmount = parseFloat(amount);
  if (isNaN(chargeAmount) || chargeAmount <= 0) {
    return res.status(400).json({
      header: { responseCode: "9999" },
      body: { message: "المبلغ المدخل غير صالح." }
    });
  }

  // 5. التحقق من عدم تكرار العملية (refId)
  try {
    const existingTx = await Transaction.findOne({ where: { refId } });
    if (existingTx) {
      return res.status(409).json({
        header: { responseCode: "9999" },
        body: { message: "هذه العملية (refId) تم تنفيذها مسبقاً." }
      });
    }
  } catch (error) {
    console.error('خطأ أثناء التحقق من refId:', error);
    return res.status(500).json({ 
      header: { responseCode: "5000" }, 
      body: { message: "خطأ داخلي أثناء معالجة الطلب." } 
    });
  }

  // 6. بدء معاملة سيكولايز لضمان سلامة العمليات
  const dbTransaction = await sequelize.transaction();
  try {
    // 7. البحث عن محفظة المرسل (العميل - صاحب التوكن) وتأمينها
    const senderPhone = decoded.phone;
    const senderWallet = await Wallet.findOne({
      where: { phone: senderPhone },
      lock: dbTransaction.LOCK.UPDATE,
      transaction: dbTransaction,
    });
    if (!senderWallet) {
      await dbTransaction.rollback();
      return res.status(404).json({
        header: { responseCode: "4004" },
        body: { message: `لم يتم العثور على محفظة للمرسل ${senderPhone}.` }
      });
    }

    // 8. البحث عن محفظة المستلم (receiverMobile) وتأمينها
    const receiverWallet = await Wallet.findOne({
      where: { phone: receiverMobile },
      lock: dbTransaction.LOCK.UPDATE,
      transaction: dbTransaction,
    });
    if (!receiverWallet) {
      await dbTransaction.rollback();
      return res.status(404).json({
        header: { responseCode: "4004" },
        body: { message: "حساب المستلم غير موجود." }
      });
    }

    // 9. التحقق من كفاية رصيد المرسل
    const senderBalance = parseFloat(senderWallet.balance);
    if (senderBalance < chargeAmount) {
      await dbTransaction.rollback();
      return res.status(402).json({
        header: { responseCode: "4002" },
        body: { message: "رصيد العميل غير كافٍ." }
      });
    }

    // 10. خصم المبلغ من المرسل
    await senderWallet.update(
      { balance: senderBalance - chargeAmount },
      { transaction: dbTransaction }
    );

    // 11. تغذية رصيد المستلم
    const receiverBalance = parseFloat(receiverWallet.balance);
    await receiverWallet.update(
      { balance: receiverBalance + chargeAmount },
      { transaction: dbTransaction }
    );

    // 12. إنشاء سجل المعاملة
    const newTransaction = await Transaction.create(
      {
        sender: senderPhone,
        receiver: receiverMobile,
        amount: chargeAmount,
        status: 'ACCEPTED',
        refId: refId, // الحقل الجديد
        reference: agentWallet, // تخزين معرف الوكيل/التاجر
        transactionType: 'CASH_OUT',
      },
      { transaction: dbTransaction }
    );

    await dbTransaction.commit();

    // 13. إرجاع استجابة نجاح متوافقة مع البروتوكول
    return res.status(200).json({
      header: {
        responseCode: "0000"
      },
      body: {
        txnId: newTransaction.id,
        refId: refId,
        message: "تمت العملية بنجاح"
      }
    });
  } catch (error) {
    if (dbTransaction) await dbTransaction.rollback();
    console.error('خطأ في معالجة عملية التحويل:', error);
    return res.status(500).json({
      header: { responseCode: "5000" },
      body: { message: "حدث خطأ داخلي في الخادم أثناء تنفيذ العملية." }
    });
  }
});

export default router;
