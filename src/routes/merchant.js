import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize, User, Transaction, Voucher } from '../models/index.js';
import { authMiddleware } from '../middleware/authenticate.js';
import crypto from 'crypto';

const router = Router();

// ─── POST /api/v1/merchant/switch-charge ─────────────────
// Merchant redeems a voucher from a customer
router.post('/switch-charge', async (req, res) => {
  const body = req.body?.body || req.body;
  const { agentWallet, password, accessToken, voucher } = body;

  if (!agentWallet || !password || !accessToken || !voucher) {
    return res.status(400).json({
      ResponseCode: 400,
      ResponseMessage: 'agentWallet وpassword وaccessToken وvoucher إلزامية'
    });
  }

  const t = await sequelize.transaction();
  try {
    const merchant = await User.findOne({
      where: { phone: agentWallet, role: 'merchant', isActive: true },
      transaction: t, lock: true
    });
    if (!merchant) {
      await t.rollback();
      return res.status(404).json({ ResponseCode: 404, ResponseMessage: 'معرف التاجر غير صالح' });
    }

    const passOk = await bcrypt.compare(password, merchant.passwordHash);
    if (!passOk) {
      await t.rollback();
      return res.status(401).json({ ResponseCode: 401, ResponseMessage: 'كلمة مرور التاجر غير صحيحة' });
    }

    const voucherRecord = await Voucher.findOne({
      where: {
        voucherCode: voucher,
        status: 'ACTIVE',
        expiresAt: { [Op.gt]: new Date() }
      },
      transaction: t, lock: true
    });
    if (!voucherRecord) {
      await t.rollback();
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رمز القسيمة غير صالح أو منتهي الصلاحية' });
    }

    merchant.balance = parseFloat(merchant.balance) + parseFloat(voucherRecord.amount);
    await merchant.save({ transaction: t });

    voucherRecord.status = 'CONSUMED';
    await voucherRecord.save({ transaction: t });

    const refId = `CSH-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const txn = await Transaction.create({
      senderId:   voucherRecord.customerId,
      receiverId: merchant.id,
      amount:     parseFloat(voucherRecord.amount),
      type:       'CASHOUT',
      status:     'SUCCESS',
      note:       `سداد عبر قسيمة: ${voucher}`,
      refId
    }, { transaction: t });

    await t.commit();

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تمت عملية الخصم بنجاح',
      body: {
        transactionId: txn.id,
        refId,
        voucherCode: voucher,
        amount: parseFloat(voucherRecord.amount),
        merchantWallet: agentWallet,
        merchantName: merchant.name,
        timestamp: txn.createdAt
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[CASHOUT]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشلت عملية الدفع' });
  }
});

// ─── GET /api/v1/merchant/qr-info ────────────────────────
// Returns merchant info for QR code display
router.get('/qr-info', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'merchant') {
      return res.status(403).json({ ResponseCode: 403, ResponseMessage: 'متاح للتجار فقط' });
    }
    return res.json({
      ResponseCode: 0,
      body: {
        merchantName: req.user.name,
        merchantPhone: req.user.phone,
        qrData: JSON.stringify({ type: 'MERCHANT_PAY', phone: req.user.phone, name: req.user.name })
      }
    });
  } catch (err) {
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل جلب بيانات QR' });
  }
});

// ─── GET /api/v1/merchant/transactions ───────────────────
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'merchant') {
      return res.status(403).json({ ResponseCode: 403, ResponseMessage: 'متاح للتجار فقط' });
    }

    const page  = parseInt(req.query.page  || '1');
    const limit = parseInt(req.query.limit || '20');
    const offset = (page - 1) * limit;

    const { count, rows } = await Transaction.findAndCountAll({
      where: { receiverId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit, offset,
      include: [
        { model: User, as: 'sender', attributes: ['name', 'phone'] }
      ]
    });

    const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);

    return res.json({
      ResponseCode: 0,
      body: {
        transactions: rows.map(t => ({
          id: t.id, refId: t.refId,
          type: 'CREDIT',
          txnType: t.type,
          amount: parseFloat(t.amount),
          counterparty: t.sender?.name || 'عميل',
          counterPhone: t.sender?.phone || '',
          note: t.note, status: t.status,
          timestamp: t.createdAt
        })),
        total: count,
        totalAmount: total,
        page,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل جلب المعاملات' });
  }
});

export default router;
