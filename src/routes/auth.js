import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';
import { generateToken } from '../middleware/auth.js';

const router = Router();

// ─── POST /api/v1/auth/signup ─────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, phone, password, role = 'customer' } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'الاسم ورقم الهاتف وكلمة المرور إلزامية' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    if (!['customer', 'merchant'].includes(role)) {
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'الدور يجب أن يكون customer أو merchant' });
    }

    const exists = await User.findOne({ where: { phone } });
    if (exists) {
      return res.status(409).json({ ResponseCode: 409, ResponseMessage: 'رقم الهاتف مسجل مسبقاً' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const initialBalance = role === 'customer' ? 5000 : 0;

    const user = await User.create({ name, phone, passwordHash, role, balance: initialBalance });
    const token = generateToken(user);

    return res.status(201).json({
      ResponseCode: 0,
      ResponseMessage: 'تم إنشاء الحساب بنجاح',
      body: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 604800,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          balance: parseFloat(user.balance)
        }
      }
    });
  } catch (err) {
    console.error('[SIGNUP]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل إنشاء الحساب' });
  }
});

// ─── POST /api/v1/auth/login ──────────────────────────────
// Accepts both JSON and form-urlencoded
router.post('/login', async (req, res) => {
  try {
    // Support both direct body and Jawali-style body.phone
    const phone    = req.body?.phone    || req.body?.username  || req.body?.body?.phone;
    const password = req.body?.password                        || req.body?.body?.password;

    if (!phone || !password) {
      return res.status(400).json({ ResponseCode: 400, ResponseMessage: 'رقم الهاتف وكلمة المرور إلزاميان' });
    }

    const user = await User.findOne({ where: { phone, isActive: true } });
    if (!user) {
      return res.status(401).json({ ResponseCode: 401, ResponseMessage: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ ResponseCode: 401, ResponseMessage: 'رقم الهاتف أو كلمة المرور غير صحيحة' });
    }

    const token = generateToken(user);

    return res.json({
      ResponseCode: 0,
      ResponseMessage: 'تم تسجيل الدخول بنجاح',
      body: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 604800,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          balance: parseFloat(user.balance)
        }
      }
    });
  } catch (err) {
    console.error('[LOGIN]', err);
    return res.status(500).json({ ResponseCode: 500, ResponseMessage: 'فشل تسجيل الدخول' });
  }
});

// ─── POST /api/v1/auth/logout ─────────────────────────────
router.post('/logout', (req, res) => {
  // JWT is stateless - client deletes token
  return res.json({ ResponseCode: 0, ResponseMessage: 'تم تسجيل الخروج' });
});

export default router;
