
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
/**
 * نقطة نهاية خصم الرصيد من محفظة العميل وتحويله إلى مستلم (P2P أو P2M)
 * - توثيق عبر x-switch-api-key
 * - تدعم التحويل من شخص لشخص (P2P) أو من شخص لتاجر (P2M)
 * - يتم خصم المرسل وتغذية المستلم في معاملة واحدة
 */
router.post('/switch-charge', async (req, res) => {
  // 1. التحقق من صحة مفتاح API القادم من المقسم
  const switchApiKey = req.headers['x-switch-api-key'];
  if (!switchApiKey || switchApiKey !== process.env.SWITCH_API_KEY) {
    return res.status(401).json({
      status: 'REJECTED',
      message: 'مفتاح API غير صالح أو مفقود.'
    });
  }

  // 2. استخراج البيانات من الطلب
  const { amount, customerMobile, merchantId, nonce, transactionType, receiverAccount } = req.body;

  // 3. التحقق من اكتمال البيانات الأساسية
  if (!amount || !customerMobile || !merchantId || !nonce || !transactionType || !receiverAccount) {
    return res.status(400).json({
      status: 'REJECTED',
      message: 'الطلب غير مكتمل، الحقول amount, customerMobile, merchantId, nonce, transactionType, receiverAccount مطلوبة.'
    });
  }

  const chargeAmount = parseFloat(amount);
  if (isNaN(chargeAmount) || chargeAmount <= 0) {
    return res.status(400).json({
      status: 'REJECTED',
      message: 'المبلغ المدخل غير صالح.'
    });
  }

  // 4. التحقق من عدم تكرار العملية (Nonce)
  try {
    const existingTx = await Transaction.findOne({ where: { nonce } });
    if (existingTx) {
      return res.status(409).json({
        status: 'REJECTED',
        message: 'هذه العملية (Nonce) تم تنفيذها مسبقاً.'
      });
    }
  } catch (error) {
    console.error('خطأ أثناء التحقق من Nonce:', error);
    return res.status(500).json({ status: 'ERROR', message: 'خطأ داخلي أثناء معالجة الطلب.' });
  }


  // 5. بدء معاملة سيكولايز لضمان سلامة العمليات
  const dbTransaction = await sequelize.transaction();
  try {
    // 6. البحث عن محفظة المرسل (العميل) وتأمينها
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

    // 7. البحث عن محفظة المستلم وتأمينها
    const receiverWallet = await Wallet.findOne({
      where: { phone: receiverAccount },
      lock: dbTransaction.LOCK.UPDATE,
      transaction: dbTransaction,
    });
    if (!receiverWallet) {
      await dbTransaction.rollback();
      return res.status(404).json({
        status: 'REJECTED',
        message: 'حساب المستلم غير موجود.'
      });
    }

    // 8. التحقق من كفاية رصيد المرسل
    const customerBalance = parseFloat(customerWallet.balance);
    if (customerBalance < chargeAmount) {
      await dbTransaction.rollback();
      return res.status(402).json({
        status: 'REJECTED',
        message: 'رصيد العميل غير كافٍ.'
      });
    }

    // 9. خصم المبلغ من المرسل
    await customerWallet.update(
      { balance: customerBalance - chargeAmount },
      { transaction: dbTransaction }
    );

    // 10. تغذية رصيد المستلم
    const receiverBalance = parseFloat(receiverWallet.balance);
    await receiverWallet.update(
      { balance: receiverBalance + chargeAmount },
      { transaction: dbTransaction }
    );

    // 11. إنشاء سجل المعاملة وتوثيق نوعها والمستلم الفعلي
    const newTransaction = await Transaction.create(
      {
        sender: customerMobile,
        receiver: receiverAccount,
        amount: chargeAmount,
        status: 'ACCEPTED',
        nonce: nonce,
        reference: merchantId, // معرف التاجر
        transactionType: transactionType, // سيتم تجاهله حالياً في الجدول (يجب إضافته في النموذج لاحقاً)
      },
      { transaction: dbTransaction }
    );

    await dbTransaction.commit();

    // 12. إرجاع استجابة نجاح
    return res.status(200).json({
      status: 'ACCEPTED',
      providerRef: newTransaction.id,
      message: 'تمت عملية التحويل بنجاح.'
    });
  } catch (error) {
    await dbTransaction.rollback();
    console.error('خطأ في معالجة عملية التحويل من المقسم:', error);
    return res.status(500).json({
      status: 'ERROR',
      message: 'حدث خطأ داخلي في الخادم أثناء تنفيذ العملية.'
    });
  }
});

export default router;
