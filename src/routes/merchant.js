import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize, User, Transaction } from '../models/index.js';
import { authMiddleware } from '../middleware/authenticate.js';
import crypto from 'crypto';

const router = Router();

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
        merchantPosNumber: req.user.posNumber,
        qrData: JSON.stringify({ type: 'MERCHANT_PAY', posNumber: req.user.posNumber, name: req.user.name })
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
