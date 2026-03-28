
// src/routes/wallet.js
// تم إعادة هيكلة هذا الملف ليعمل كـ Proxy لمسار التوكنز مع المقسم المركزي
import express from 'express';
import { Op } from 'sequelize';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import { Wallet, Transaction } from '../models/index.js';
import { generateVoucher } from '../controllers/voucherController.js';
import authenticate from '../middleware/authenticate.js';

const walletLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'تجاوزت الحد المسموح به من الطلبات. يرجى المحاولة لاحقاً.' },
});

const router = express.Router();
router.use(walletLimiter);
router.use(authenticate);

// توليد قسيمة (Voucher) للعميل
router.post('/generate-voucher', generateVoucher);

// جلب الرصيد
router.get('/balance', async (req, res) => {
  try {
    const { phone } = req.user;
    const wallet = await Wallet.findByPk(phone);
    if (!wallet) return res.status(404).json({ success: false, message: 'لم يتم العثور على محفظة' });

    return res.status(200).json({
      success: true,
      data: { phone, balance: parseFloat(wallet.balance), currency: 'YER' },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'حدث خطأ داخلي' });
  }
});

// جلب السجل
router.get('/history', async (req, res) => {
  try {
    const { phone } = req.user;
    const transactions = await Transaction.findAll({
      where: { [Op.or]: [{ sender: phone }, { receiver: phone }] },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    const formattedTransactions = transactions.map((tx) => ({
      id: tx.id,
      type: tx.sender === phone ? 'OUTGOING' : 'INCOMING',
      sender: tx.sender,
      receiver: tx.receiver,
      amount: parseFloat(tx.amount),
      status: tx.status,
      createdAt: tx.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: { phone, total: formattedTransactions.length, transactions: formattedTransactions },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'حدث خطأ داخلي' });
  }
});

/**
 * POST /api/v1/wallet/offline-tokens
 * هذا المسار يعمل كـ Proxy للمقسم المركزي (Atheer Switch)
 * يقوم بإرسال طلب للمقسم لجلب التوكنز، ثم يقوم بتحديث حالة المحفظة محلياً.
 */
router.post('/offline-tokens', async (req, res) => {
  const { phone } = req.user;
  const count = parseInt(req.body.count) || 5;
  const limit = parseFloat(req.body.limit) || 5000.0;

  // 1. التحقق من المدخلات الأساسية
  if (count > 20 || count <= 0) {
    return res.status(400).json({ success: false, message: 'عدد التوكنات يجب أن يكون بين 1 و 20' });
  }
  if (limit <= 0) {
    return res.status(400).json({ success: false, message: 'سقف الدفع يجب أن يكون أكبر من الصفر' });
  }

  const ATHEER_SWITCH_URL = process.env.ATHEER_SWITCH_URL || 'http://switch-backend:3000';
  const WALLET_API_KEY = process.env.WALLET_API_KEY;

  if (!WALLET_API_KEY) {
    console.error('❌ خطأ: المتغير WALLET_API_KEY غير موجود في إعدادات البيئة.');
    return res.status(500).json({ success: false, message: 'خطأ في إعدادات الخادم.' });
  }

  try {
    // 2. إرسال الطلب إلى المقسم (Atheer Switch)
    const switchResponse = await axios.post(`${ATHEER_SWITCH_URL}/api/v1/payments/tokens/provision`, {
      body: {
        providerName: 'JEEB', // اسم المحفظة (Wallet Provider)
        customerId: phone,
        count: count
      }
    }, {
      headers: {
        'x-atheer-api-key': WALLET_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 ثوانٍ كحد أقصى للانتظار
    });

    // 3. التحقق من استجابة المقسم
    const switchData = switchResponse.data;
    
    // ملاحظة: هيكل الرد يعتمد على اتفاقية المقسم، نفترض هنا أن التوكنز في switchData.data.tokens
    if (switchResponse.status === 200 && switchData.status === 'success') {
   const tokens = switchData.data.tokens;

      // 4. تحديث حالة المحفظة محلياً (عدد التوكنز النشطة وسقف الدفع)
      const wallet = await Wallet.findByPk(phone);
      if (wallet) {
        await wallet.update({
          active_tokens: tokens.length,
          offline_payment_limit: limit
        });
      }

      // 5. إرسال التوكنز لتطبيق الموبايل
      return res.status(200).json({
        success: true,
        data: {
          tokens: tokens,
          limit_applied: limit
        }
      });
    } else {
      return res.status(switchResponse.status).json({
        success: false,
        message: switchData.message || 'فشل المقسم في تزويد التوكنز.'
      });
    }

  } catch (error) {
    console.error('خطأ أثناء التواصل مع المقسم:', error.response?.data || error.message);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.message || 'حدث خطأ أثناء التواصل مع مقسم أثير.';

    return res.status(statusCode).json({
      success: false,
      message: errorMessage
    });
  }
});

export default router;
