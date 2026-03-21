
// src/routes/merchant.js
// تم إعادة هيكلة هذا الملف بالكامل ليعمل كنقطة نهاية (Endpoint) خاصة بمقسم أثير (Atheer Switch)
import express from 'express';
import rateLimit from 'express-rate-limit';
import { sequelize, Wallet, Transaction } from '../models/index.js';

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
router.post('/switch-charge', async (req, res) => {
  const { amount, customerMobile, merchantId, nonce } = req.body;

  // 1. التحقق من اكتمال البيانات الأساسية في الطلب
  if (!amount || !customerMobile || !merchantId || !nonce) {
    return res.status(400).json({
      status: 'REJECTED',
      message: 'الطلب غير مكتمل، الحقول amount, customerMobile, merchantId, nonce مطلوبة.'
    });
  }

  const chargeAmount = parseFloat(amount);
  if (isNaN(chargeAmount) || chargeAmount <= 0) {
    return res.status(400).json({ 
      status: 'REJECTED', 
      message: 'المبلغ المدخل غير صالح.'
    });
  }

  // 2. التحقق من عدم تكرار العملية (Nonce)
  try {
    const existingTx = await Transaction.findOne({ where: { nonce } });
    if (existingTx) {
      return res.status(409).json({ // 409 Conflict
        status: 'REJECTED',
        message: 'هذه العملية (Nonce) تم تنفيذها مسبقاً.'
      });
    }
  } catch (error) {
      console.error('خطأ أثناء التحقق من Nonce:', error);
      return res.status(500).json({ status: 'ERROR', message: 'خطأ داخلي أثناء معالجة الطلب.' });
  }


  const dbTransaction = await sequelize.transaction();

  try {
    // 3. البحث عن محفظة العميل وتأمينها للمعاملة
    const customerWallet = await Wallet.findOne({
      where: { phone: customerMobile },
      lock: dbTransaction.LOCK.UPDATE,
      transaction: dbTransaction,
    });

    if (!customerWallet) {
      await dbTransaction.rollback();
      return res.status(404).json({ 
        status: 'REJECTED', 
        message: `لم يتم العثور على محفظة للعميل ${customerMobile}.`
      });
    }

    // 4. التحقق من كفاية الرصيد
    const customerBalance = parseFloat(customerWallet.balance);
    if (customerBalance < chargeAmount) {
      await dbTransaction.rollback();
      return res.status(402).json({ // 402 Payment Required (but insufficient funds)
        status: 'REJECTED',
        message: 'رصيد العميل غير كافٍ.'
      });
    }

    // 5. خصم المبلغ من محفظة العميل
    await customerWallet.update(
      { balance: customerBalance - chargeAmount },
      { transaction: dbTransaction }
    );

    // 6. إنشاء سجل للمعاملة، ويكون المستفيد هو المقسم
    const newTransaction = await Transaction.create(
      {
        sender: customerMobile,
        receiver: 'ATHEER_SWITCH', // المستفيد هو المقسم المركزي
        amount: chargeAmount,
        status: 'ACCEPTED',
        nonce: nonce,
        reference: merchantId, // يمكن استخدام حقل المرجع لتخزين معرف التاجر
      },
      { transaction: dbTransaction }
    );

    await dbTransaction.commit();

    // 7. إرجاع استجابة نجاح تحتوي على معرف العملية الداخلي
    return res.status(200).json({
      status: 'ACCEPTED',
      providerRef: newTransaction.id, // معرف العملية في نظام المحفظة
      message: 'تمت عملية الخصم بنجاح.'
    });

  } catch (error) {
    await dbTransaction.rollback();
    console.error('خطأ في معالجة عملية الشحن من المقسم:', error);
    return res.status(500).json({
      status: 'ERROR',
      message: 'حدث خطأ داخلي في الخادم أثناء تنفيذ عملية الخصم.'
    });
  }
});

export default router;
