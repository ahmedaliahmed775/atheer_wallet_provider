import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize, User, Transaction, Voucher } from '../models/index.js';
import { authMiddleware } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// ─── POST /api/v1/merchant/switch-charge ─────────────────
// Merchant redeems a voucher from a customer
// Supports Jawali nested format { header: {...}, body: {...} } AND flat JSON
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
    // Find merchant by phone (agentWallet)
    const merchant = await User.findOne({
      where: { phone: agentWallet, role: 'merchant', isActive: true },
      transaction: t, lock: true
    });
    if (!merchant) {
      await t.rollback();
      return res.status(404).json({ ResponseCode: 404, ResponseMessage: 'معرف التاجر غير صالح' });
    }

    // Verify merchant password
    const passOk = await bcrypt.compare(password, merchant.passwordHash);
    if (!passOk) {
      await t.rollback();
      return res.status(401).json({ ResponseCode: 401, ResponseMessage: 'كلمة مرور التاجر غير صحيحة' });
    }

    // Find active, non-expired voucher
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

    // Credit merchant
    merchant.balance = parseFloat(merchant.balance) + parseFloat(voucherRecord.amount);
    await merchant.save({ transaction: t });

    // Consume voucher
    voucherRecord.status = 'CONSUMED';
    await voucherRecord.save({ transaction: t });

    // Record transaction
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

// ─── GET /api/v1/merchant/transactions ───────────────────
// Merchant history (requires auth)
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'merchant') {
      return res.status(403).json({ ResponseCode: 403, ResponseMessage: 'متاح للتجار فقط' });
    }

    const { Op } = await import('sequelize');
    const page  = parseInt(req.query.page  || '1');
    const limit = parseInt(req.query.limit || '20');
    const offset = (page - 1) * limit;

    const { count, rows } = await Transaction.findAndCountAll({
      where: { receiverId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit, offset
    });

    const total = rows.reduce((s, r) => s + parseFloat(r.amount), 0);

    return res.json({
      ResponseCode: 0,
      body: {
        transactions: rows.map(t => ({
          id: t.id, refId: t.refId,
          amount: parseFloat(t.amount),
          type: t.type, status: t.status,
          note: t.note, timestamp: t.createdAt
        })),
        total: count,
        totalAmount: total,
        page
      }
    });
  } catch (err) {
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل جلب المعاملات' });
  }
});

export default router;
