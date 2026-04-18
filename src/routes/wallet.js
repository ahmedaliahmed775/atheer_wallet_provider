import { Router } from 'express';
import { Op } from 'sequelize';
import { sequelize, User, Transaction, CashoutCode, BillPayment } from '../models/index.js';
import { authMiddleware } from '../middleware/authenticate.js';
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
    const sender   = await User.findByPk(req.user.id, { transaction: t, lock: true });
    const receiver = await User.findOne({ where: { phone: receiverPhone } }, { transaction: t, lock: true });

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

// ─── POST /api/v1/wallet/transfer-external ───────────────
router.post('/transfer-external', async (req, res) => {
  const body = req.body?.body || req.body;
  const { recipientPhone, recipientName, amount, note } = body;

  if (!recipientPhone || !amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رقم المستلم والمبلغ إلزاميان' });
  }

  const existing = await User.findOne({ where: { phone: recipientPhone } });
  if (existing) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'المستلم مشترك في النظام — استخدم التحويل العادي' });
  }

  const t = await sequelize.transaction();
  try {
    const sender = await User.findByPk(req.user.id, { transaction: t, lock: true });

    if (parseFloat(sender.balance) < parseFloat(amount)) {
      await t.rollback();
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رصيدك غير كافٍ' });
    }

    sender.balance = parseFloat(sender.balance) - parseFloat(amount);
    await sender.save({ transaction: t });

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const cashoutCode = await CashoutCode.create({
      userId: sender.id,
      amount: parseFloat(amount),
      code,
      type: 'EXTERNAL_TRANSFER',
      recipientPhone,
      recipientName: recipientName || '',
      expiresAt,
      status: 'ACTIVE'
    }, { transaction: t });

    const refId = `EXT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const txn = await Transaction.create({
      senderId:   sender.id,
      receiverId: null,
      amount:     parseFloat(amount),
      type:       'EXTERNAL_TRANSFER',
      status:     'SUCCESS',
      note:       note || `حوالة خارجية إلى ${recipientPhone}`,
      refId,
      metadata: { recipientPhone, recipientName, cashoutCode: code }
    }, { transaction: t });

    await t.commit();

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم إرسال الحوالة بنجاح',
      body: {
        transactionId: txn.id,
        refId,
        amount: parseFloat(amount),
        recipientPhone,
        recipientName: recipientName || '',
        withdrawalCode: code,
        expiresAt: cashoutCode.expiresAt,
        newBalance: parseFloat(sender.balance),
        timestamp: txn.createdAt
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[EXTERNAL_TRANSFER]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل إرسال الحوالة' });
  }
});

// ─── POST /api/v1/wallet/pay-bill ────────────────────────
router.post('/pay-bill', async (req, res) => {
  const body = req.body?.body || req.body;
  const { category, provider, accountNumber, amount } = body;

  const validCategories = ['TELECOM', 'INTERNET', 'ELECTRICITY', 'WATER'];
  if (!category || !validCategories.includes(category)) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'نوع الخدمة غير صالح' });
  }
  if (!provider || !accountNumber || !amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'جميع الحقول إلزامية' });
  }

  const t = await sequelize.transaction();
  try {
    const user = await User.findByPk(req.user.id, { transaction: t, lock: true });

    if (parseFloat(user.balance) < parseFloat(amount)) {
      await t.rollback();
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رصيدك غير كافٍ لسداد الفاتورة' });
    }

    user.balance = parseFloat(user.balance) - parseFloat(amount);
    await user.save({ transaction: t });

    const refId = `BIL-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const txn = await Transaction.create({
      senderId:   user.id,
      receiverId: null,
      amount:     parseFloat(amount),
      type:       'BILL_PAYMENT',
      status:     'SUCCESS',
      note:       `سداد ${provider} — ${accountNumber}`,
      refId,
      metadata: { category, provider, accountNumber }
    }, { transaction: t });

    const bill = await BillPayment.create({
      userId: user.id,
      transactionId: txn.id,
      category,
      provider,
      accountNumber,
      amount: parseFloat(amount),
      status: 'SUCCESS'
    }, { transaction: t });

    await t.commit();

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم سداد الفاتورة بنجاح',
      body: {
        transactionId: txn.id,
        billId: bill.id,
        refId,
        category,
        provider,
        accountNumber,
        amount: parseFloat(amount),
        newBalance: parseFloat(user.balance),
        timestamp: txn.createdAt
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[BILL_PAYMENT]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل سداد الفاتورة' });
  }
});

// ─── POST /api/v1/wallet/generate-cashout ─────────────────
router.post('/generate-cashout', async (req, res) => {
  const body = req.body?.body || req.body;
  const { amount } = body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'المبلغ إلزامي وأكبر من صفر' });
  }

  const t = await sequelize.transaction();
  try {
    const user = await User.findByPk(req.user.id, { transaction: t, lock: true });

    if (parseFloat(user.balance) < parseFloat(amount)) {
      await t.rollback();
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رصيدك غير كافٍ' });
    }

    await CashoutCode.update(
      { status: 'EXPIRED' },
      { where: { userId: user.id, type: 'SELF_CASHOUT', status: 'ACTIVE' }, transaction: t }
    );

    user.balance = parseFloat(user.balance) - parseFloat(amount);
    await user.save({ transaction: t });

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const cashout = await CashoutCode.create({
      userId: user.id,
      amount: parseFloat(amount),
      code,
      type: 'SELF_CASHOUT',
      expiresAt,
      status: 'ACTIVE'
    }, { transaction: t });

    const refId = `CSO-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await Transaction.create({
      senderId:   user.id,
      receiverId: null,
      amount:     parseFloat(amount),
      type:       'CASH_OUT',
      status:     'PENDING',
      note:       'كود سحب نقدي',
      refId,
      metadata: { cashoutCode: code }
    }, { transaction: t });

    await t.commit();

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم إنشاء كود السحب بنجاح',
      body: {
        code: cashout.code,
        amount: parseFloat(amount),
        expiresAt: cashout.expiresAt,
        newBalance: parseFloat(user.balance),
        type: 'SELF_CASHOUT'
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[CASHOUT_CODE]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل إنشاء كود السحب' });
  }
});

// ─── POST /api/v1/wallet/cash-in ─────────────────────────
router.post('/cash-in', async (req, res) => {
  const body = req.body?.body || req.body;
  const { amount, agentCode } = body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'المبلغ إلزامي وأكبر من صفر' });
  }

  const t = await sequelize.transaction();
  try {
    const user = await User.findByPk(req.user.id, { transaction: t, lock: true });

    user.balance = parseFloat(user.balance) + parseFloat(amount);
    await user.save({ transaction: t });

    const refId = `DEP-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const txn = await Transaction.create({
      senderId:   null,
      receiverId: user.id,
      amount:     parseFloat(amount),
      type:       'CASH_IN',
      status:     'SUCCESS',
      note:       'إيداع نقدي',
      refId,
      metadata: { agentCode: agentCode || 'DEMO' }
    }, { transaction: t });

    await t.commit();

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم الإيداع بنجاح',
      body: {
        transactionId: txn.id,
        refId,
        amount: parseFloat(amount),
        newBalance: parseFloat(user.balance),
        timestamp: txn.createdAt
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[CASH_IN]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل الإيداع' });
  }
});

// ─── POST /api/v1/wallet/qr-pay ─────────────────────────
router.post('/qr-pay', async (req, res) => {
  const body = req.body?.body || req.body;
  const { posNumber, amount, note } = body;

  if (!posNumber || !amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رقم نقطة البيع والمبلغ إلزاميان' });
  }

  const t = await sequelize.transaction();
  try {
    const customer = await User.findByPk(req.user.id, { transaction: t, lock: true });
    const merchant = await User.findOne({ where: { posNumber: posNumber, role: 'merchant', isActive: true }, transaction: t, lock: true });

    if (!merchant) {
      await t.rollback();
      return res.status(404).json({ ResponseCode: 404, ResponseMessage: 'التاجر غير موجود' });
    }
    if (parseFloat(customer.balance) < parseFloat(amount)) {
      await t.rollback();
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رصيدك غير كافٍ' });
    }

    customer.balance = parseFloat(customer.balance) - parseFloat(amount);
    merchant.balance = parseFloat(merchant.balance) + parseFloat(amount);
    await customer.save({ transaction: t });
    await merchant.save({ transaction: t });

    const refId = `QRP-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const txn = await Transaction.create({
      senderId:   customer.id,
      receiverId: merchant.id,
      amount:     parseFloat(amount),
      type:       'QR_PAYMENT',
      status:     'SUCCESS',
      note:       note || `دفع لـ ${merchant.name}`,
      refId
    }, { transaction: t });

    await t.commit();

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم الدفع بنجاح',
      body: {
        transactionId: txn.id,
        refId,
        amount: parseFloat(amount),
        merchantName: merchant.name,
        merchantPhone: merchant.phone,
        newBalance: parseFloat(customer.balance),
        timestamp: txn.createdAt
      }
    });
  } catch (err) {
    await t.rollback();
    console.error('[QR_PAY]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل عملية الدفع' });
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
        { model: User, as: 'sender',   attributes: ['name', 'phone'] },
        { model: User, as: 'receiver', attributes: ['name', 'phone'] }
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
        counterparty: isSender ? txn.receiver?.name : txn.sender?.name,
        counterPhone: isSender ? txn.receiver?.phone : txn.sender?.phone,
        note:         txn.note,
        status:       txn.status,
        metadata:     txn.metadata,
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

// ─── GET /api/v1/wallet/transactions/:id ─────────────────
router.get('/transactions/:id', async (req, res) => {
  try {
    const uid = req.user.id;
    const txn = await Transaction.findOne({
      where: {
        id: req.params.id,
        [Op.or]: [{ senderId: uid }, { receiverId: uid }]
      },
      include: [
        { model: User, as: 'sender',   attributes: ['name', 'phone'] },
        { model: User, as: 'receiver', attributes: ['name', 'phone'] }
      ]
    });

    if (!txn) {
      return res.status(404).json({ ResponseCode: 404, ResponseMessage: 'المعاملة غير موجودة' });
    }

    const isSender = txn.senderId === uid;
    return res.json({
      ResponseCode: 0,
      body: {
        id:           txn.id,
        refId:        txn.refId,
        type:         isSender ? 'DEBIT' : 'CREDIT',
        txnType:      txn.type,
        amount:       parseFloat(txn.amount),
        senderName:   txn.sender?.name || 'النظام',
        senderPhone:  txn.sender?.phone || '',
        receiverName: txn.receiver?.name || 'خارجي',
        receiverPhone: txn.receiver?.phone || '',
        note:         txn.note,
        status:       txn.status,
        metadata:     txn.metadata,
        timestamp:    txn.createdAt
      }
    });
  } catch (err) {
    console.error('[TXN_DETAIL]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل جلب تفاصيل المعاملة' });
  }
});

// ─── GET /api/v1/wallet/services ─────────────────────────
router.get('/services', async (req, res) => {
  const services = [
    { category: 'TELECOM', providers: [
      { id: 'yemen_mobile', name: 'يمن موبايل', icon: 'phone_android' },
      { id: 'you',          name: 'YOU',         icon: 'phone_android' },
      { id: 'sabafon',      name: 'سبأفون',      icon: 'phone_android' },
      { id: 'y_telecom',    name: 'واي',         icon: 'phone_android' },
    ]},
    { category: 'INTERNET', providers: [
      { id: 'yemen_net',    name: 'يمن نت ADSL',    icon: 'wifi' },
      { id: 'fiber',        name: 'الألياف الضوئية', icon: 'wifi' },
    ]},
    { category: 'ELECTRICITY', providers: [
      { id: 'public_elec',  name: 'الكهرباء العامة', icon: 'bolt' },
    ]},
    { category: 'WATER', providers: [
      { id: 'public_water', name: 'المياه والصرف',   icon: 'water_drop' },
    ]},
  ];
  return res.json({ ResponseCode: 0, body: { services } });
});

// ─── GET /api/v1/wallet/profile ──────────────────────────
router.get('/profile', async (req, res) => {
  const user = await User.findByPk(req.user.id);
  return res.json({
    ResponseCode: 0,
    body: { id: user.id, name: user.name, phone: user.phone, role: user.role, balance: parseFloat(user.balance) }
  });
});

// ★ إضافة: POST /api/v1/wallet/fcm-token — كان مفقوداً!
// التطبيق يرسل FCM token لكن المسار لم يكن موجوداً
router.post('/fcm-token', async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'fcmToken مطلوب' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ ResponseCode: 404, ResponseMessage: 'المستخدم غير موجود' });
    }

    user.fcmToken = fcmToken;
    await user.save();

    return res.json({ ResponseCode: 0, ResponseMessage: 'تم تحديث توكن FCM بنجاح' });
  } catch (err) {
    console.error('[FCM_TOKEN]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل تحديث توكن FCM' });
  }
});

export default router;
