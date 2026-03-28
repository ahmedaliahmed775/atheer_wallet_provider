// controllers/voucherController.js
import { Voucher, Wallet, User } from '../models/index.js';
import { Op } from 'sequelize';

function generateRandomCode(length = 8) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function generateVoucher(req, res) {
  try {
    const { header, body } = req.envelope;
    const { amount } = body || {};
    const customerPhone = req.user.phone; // تصحيح: JWT يحتوي على phone وليس id

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        ResponseCode: 2001,
        ResponseMessage: 'قيمة المبلغ غير صحيحة',
        body: null
      });
    }

    // تحقق من وجود رصيد كافٍ
    const wallet = await Wallet.findByPk(req.user.phone);
    if (!wallet || parseFloat(wallet.balance) < parseFloat(amount)) {
      return res.status(400).json({
        ResponseCode: 2002,
        ResponseMessage: 'الرصيد غير كافٍ',
        body: null
      });
    }

    // حجز المبلغ (خصم مؤقت)
    await wallet.update({ balance: parseFloat(wallet.balance) - parseFloat(amount) });

    // توليد رمز قسيمة فريد
    let voucherCode;
    let exists = true;
    while (exists) {
      voucherCode = generateRandomCode(8);
      exists = await Voucher.findOne({ where: { voucherCode, status: 'ACTIVE', expiresAt: { [Op.gt]: new Date() } } });
    }

    // إنشاء القسيمة
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 دقائق
    const voucher = await Voucher.create({
      customerPhone, // تصحيح: اسم الحقل في المودل هو customerPhone
      amount,
      voucherCode,
      expiresAt,
      status: 'ACTIVE',
    });

    return res.status(201).json({
      ResponseCode: 0,
      ResponseMessage: 'تم إنشاء القسيمة بنجاح',
      body: {
        voucherCode: voucher.voucherCode,
        amount: voucher.amount,
        expiresAt: voucher.expiresAt,
        status: voucher.status
      }
    });
  } catch (err) {
    console.error('خطأ في توليد القسيمة:', err);
    return res.status(500).json({
      ResponseCode: 2003,
      ResponseMessage: 'حدث خطأ أثناء إنشاء القسيمة',
      body: null
    });
  }
}
