import { Router } from 'express';
import { Op } from 'sequelize';
import { sequelize, User, Transaction, Voucher } from '../models/index.js';
import { authMiddleware } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();
router.use(authMiddleware);

// ─── GET /api/v1/wallet/balance ───────────────────────────
router.get('/balance', async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم جلب الرصيد بنجاح',
      body: {
        balance: parseFloat(user.balance),
        currency: 'YER',
        phone: user.phone,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل جلب الرصيد' });
  }
});

// ─── POST /api/v1/wallet/transfer ────────────────────────
// P2P - customer to customer direct transfer
router.post('/transfer', async (req, res) => {
  const body = req.body?.body || req.body;
  const { receiverPhone, amount, note } = body;

  if (!receiverPhone || !amount || amount <= 0) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رقم المستلم والمبلغ إلزاميان' });
  }
  if (receiverPhone === req.user.phone) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'لا يمكن التحويل لنفسك' });
  }

  const t = await sequelize.transaction();
  try {
    const sender   = await User.findByPk(req.user.id,                         { transaction: t, lock: true });
    const receiver = await User.findOne({ where: { phone: receiverPhone } },   { transaction: t, lock: true });

    if (!receiver) {
      await t.rollback();
      return res.status(404).json({ ResponseCode: 404, ResponseMessage: 'رقم الهاتف غير مسجل في النظام' });
    }
    if (parseFloat(sender.balance) < parseFloat(amount)) {
      await t.rollback();
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رصيدك غير كافٍ لإتمام هذه العملية' });
    }

    sender.balance   = parseFloat(sender.balance)   - parseFloat(amount);
    receiver.balance = parseFloat(receiver.balance) + parseFloat(amount);
    await sender.save({ transaction: t });
    await receiver.save({ transaction: t });

    const refId = `TRF-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const txn = await Transaction.create({
      senderId:   sender.id,
      receiverId: receiver.id,
      amount:     parseFloat(amount),
      type:       'TRANSFER',
      status:     'SUCCESS',
      note:       note || 'تحويل',
      refId
    }, { transaction: t });

    await t.commit();

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم التحويل بنجاح',
      body: {
        transactionId: txn.id,
        refId,
        amount: parseFloat(amount),
        receiverName: receiver.name,
        receiverPhone: receiver.phone,
        newBalance: parseFloat(sender.balance),
        timestamp: txn.createdAt
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[TRANSFER]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشلت عملية التحويل' });
  }
});

// ─── POST /api/v1/wallet/generate-voucher ────────────────
// Customer generates a voucher for merchant payment
router.post('/generate-voucher', async (req, res) => {
  const body = req.body?.body || req.body;
  const { amount } = body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'المبلغ إلزامي وأكبر من صفر' });
  }
  if (req.user.role !== 'customer') {
    return res.status(403).json({ ResponseCode: 403, ResponseMessage: 'القسيمة متاحة للعملاء فقط' });
  }

  const t = await sequelize.transaction();
  try {
    const user = await User.findByPk(req.user.id, { transaction: t, lock: true });

    if (parseFloat(user.balance) < parseFloat(amount)) {
      await t.rollback();
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رصيدك غير كافٍ لإنشاء هذه القسيمة' });
    }

    // Expire any old active vouchers for this user
    await Voucher.update(
      { status: 'EXPIRED' },
      { where: { customerId: user.id, status: 'ACTIVE' }, transaction: t }
    );

    // Deduct balance and create voucher
    user.balance = parseFloat(user.balance) - parseFloat(amount);
    await user.save({ transaction: t });

    const voucherCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const voucher = await Voucher.create({
      customerId: user.id,
      amount: parseFloat(amount),
      voucherCode,
      expiresAt,
      status: 'ACTIVE'
    }, { transaction: t });

    await t.commit();

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم إنشاء القسيمة بنجاح',
      body: {
        voucherCode: voucher.voucherCode,
        amount: parseFloat(amount),
        expiresAt: voucher.expiresAt,
        newBalance: parseFloat(user.balance),
        status: 'ACTIVE'
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[VOUCHER]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل إنشاء القسيمة' });
  }
});

// ─── GET /api/v1/wallet/transactions ─────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const page  = parseInt(req.query.page  || '1');
    const limit = parseInt(req.query.limit || '20');
    const offset = (page - 1) * limit;
    const uid = req.user.id;

    const { count, rows } = await Transaction.findAndCountAll({
      where: { [Op.or]: [{ senderId: uid }, { receiverId: uid }] },
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      include: [
        { model: User, as: 'sentTransactions',     attributes: ['name', 'phone'], foreignKey: 'senderId',   required: false },
        { model: User, as: 'receivedTransactions', attributes: ['name', 'phone'], foreignKey: 'receiverId', required: false }
      ]
    });

    const formatted = rows.map(txn => {
      const isSender = txn.senderId === uid;
      return {
        id:           txn.id,
        refId:        txn.refId,
        type:         isSender ? 'DEBIT' : 'CREDIT',
        txnType:      txn.type,
        amount:       parseFloat(txn.amount),
        counterparty: isSender ? txn.receivedTransactions?.name : txn.sentTransactions?.name,
        counterPhone: isSender ? txn.receivedTransactions?.phone : txn.sentTransactions?.phone,
        note:         txn.note,
        status:       txn.status,
        timestamp:    txn.createdAt
      };
    });

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم جلب السجل بنجاح',
      body: {
        transactions: formatted,
        total: count,
        page,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    console.error('[HISTORY]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل جلب سجل المعاملات' });
  }
});

// ─── GET /api/v1/wallet/profile ──────────────────────────
router.get('/profile', async (req, res) => {
  const user = await User.findByPk(req.user.id);
  return res.json({
    ResponseCode: 0,
    body: { id: user.id, name: user.name, phone: user.phone, role: user.role, balance: parseFloat(user.balance) }
  });
});

export default router;
