// ─────────────────────────────────────────────────────────────
// Jawali Payment Gateway — محاكاة مطابقة ١٠٠٪
// ─────────────────────────────────────────────────────────────
//
// المسارات تُطابق بوابة جوالي الحقيقية:
//   POST /paygate/login  → تسجيل دخول النظام (accessToken)
//   POST /paygate/PAYWA  → مصادقة المحفظة (walletToken)
//   POST /paygate/PAYAG  → استعلام أو صرف (inquiry / cashout)
//
// بنية الطلبات:
//   login: { username, password }
//   PAYWA:  { header: { signonDetail }, body: { wallet, walletPassword } }
//   PAYAG:  { header: { signonDetail, accessToken, walletToken }, body: { voucher, receiverMobile, purpose } }
//
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

// ─── In-Memory Token Store ───────────────────────────────────
// يُحاكي تخزين جوالي الداخلي للتوكنات
// في الإنتاج الحقيقي: Redis أو DB

const tokenStore = new Map(); // Map<accessToken, { userId, walletToken, expiresAt, walletExpiresAt }>
const inquiryStore = new Map(); // Map<compositeKey, { voucher, mobile, amount, state, createdAt }>

// ─── مساعدات ─────────────────────────────────────────────────

function generateToken(prefix = 'tok') {
  return `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
}

function generateRef(prefix = 'JWL') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function isTokenExpired(expiresAt) {
  return !expiresAt || Date.now() > expiresAt;
}

// بيانات الوكيل من .env (مطابقة لـ config/jawali.php)
const MERCHANT = {
  username:       process.env.JAWALI_MERCHANT_USERNAME       || 'atheer_merchant',
  password:       process.env.JAWALI_MERCHANT_PASSWORD       || 'atheer_pass_123',
  wallet:         process.env.JAWALI_MERCHANT_WALLET         || '777000001',
  walletPassword: process.env.JAWALI_MERCHANT_WALLET_PASSWORD || 'wallet_pass_123',
  orgId:          process.env.JAWALI_MERCHANT_ORG_ID          || 'atheer-org-001',
  userId:         process.env.JAWALI_MERCHANT_USER_ID         || 'atheer.api.user',
  externalUser:   process.env.JAWALI_MERCHANT_EXTERNAL_USER   || 'atheer_ext_1',
  tokenExpiry:    parseInt(process.env.JAWALI_TOKEN_EXPIRY    || '3600') * 1000,
  walletExpiry:   parseInt(process.env.JAWALI_WALLET_TOKEN_EXPIRY || '1800') * 1000,
};

// ─── Logging (مطابق لـ JAWALI_LOGGING_ENABLED) ──────────────

const LOGGING = process.env.JAWALI_LOGGING_ENABLED === 'true';

function logRequest(method, url, payload) {
  if (!LOGGING) return;
  const sanitized = { ...payload };
  // حجب البيانات الحساسة
  if (sanitized.password) sanitized.password = '***REDACTED***';
  if (sanitized.body?.walletPassword) sanitized.body.walletPassword = '***REDACTED***';
  if (sanitized.header?.accessToken) sanitized.header.accessToken = sanitized.header.accessToken.substring(0, 15) + '...';
  if (sanitized.header?.walletToken) sanitized.header.walletToken = sanitized.header.walletToken.substring(0, 15) + '...';
  console.log(`[JAWALI-GW] ${method} ${url}`, JSON.stringify(sanitized, null, 2));
}

function logResponse(url, status, data) {
  if (!LOGGING) return;
  console.log(`[JAWALI-GW] ← ${url} [${status}]`, JSON.stringify(data, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// POST /paygate/login — تسجيل دخول النظام
// ═══════════════════════════════════════════════════════════════
// المدخلات: { username, password }
// المخرجات: { success, accessToken, expiresIn, tokenType }
//
// مطابق لـ: JawaliService::loginToSystem()

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  logRequest('POST', '/paygate/login', { username, password: password ? '***' : undefined });

  // ── التحقق من المدخلات ──
  if (!username || !password) {
    const resp = {
      success: false,
      error: 'MISSING_CREDENTIALS',
      message: 'Username and password are required',
    };
    logResponse('/paygate/login', 400, resp);
    return res.status(400).json(resp);
  }

  // ── التحقق من بيانات الوكيل ──
  if (username !== MERCHANT.username || password !== MERCHANT.password) {
    const resp = {
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid username or password',
    };
    logResponse('/paygate/login', 401, resp);
    return res.status(401).json(resp);
  }

  // ── إنشاء accessToken ──
  const accessToken = generateToken('acc');
  const expiresIn = MERCHANT.tokenExpiry / 1000; // بالثواني

  tokenStore.set(accessToken, {
    userId: MERCHANT.userId,
    walletToken: null,
    expiresAt: Date.now() + MERCHANT.tokenExpiry,
    walletExpiresAt: null,
  });

  const resp = {
    success: true,
    accessToken,
    expiresIn,
    tokenType: 'Bearer',
  };
  logResponse('/paygate/login', 200, resp);
  return res.json(resp);
});

// ═══════════════════════════════════════════════════════════════
// POST /paygate/PAYWA — مصادقة المحفظة (Wallet Authentication)
// ═══════════════════════════════════════════════════════════════
// المدخلات:
// {
//   "header": {
//     "signonDetail": { "orgID": "...", "userID": "...", "externalUser": "..." }
//   },
//   "body": {
//     "wallet": "777000001",
//     "walletPassword": "wallet_pass_123"
//   }
// }
// المخرجات: { success, walletToken, expiresIn }
//
// مطابق لـ: JawaliService::walletAuthentication()

router.post('/PAYWA', (req, res) => {
  const { header, body } = req.body;
  logRequest('POST', '/paygate/PAYWA', req.body);

  // ── التحقق من البنية ──
  if (!header?.signonDetail || !body) {
    const resp = {
      success: false,
      error: 'INVALID_REQUEST',
      message: 'Request must contain header.signonDetail and body',
    };
    logResponse('/paygate/PAYWA', 400, resp);
    return res.status(400).json(resp);
  }

  // ── التحقق من signonDetail ──
  const { orgID, userID } = header.signonDetail;
  if (!orgID || !userID) {
    const resp = {
      success: false,
      error: 'INVALID_SIGNON',
      message: 'signonDetail must contain orgID and userID',
    };
    logResponse('/paygate/PAYWA', 400, resp);
    return res.status(400).json(resp);
  }

  // ── استخراج accessToken من header أو من Authorization ──
  const accessToken = header.accessToken
    || req.headers.authorization?.replace('Bearer ', '');

  if (!accessToken) {
    const resp = {
      success: false,
      error: 'MISSING_ACCESS_TOKEN',
      message: 'accessToken is required in header or Authorization',
    };
    logResponse('/paygate/PAYWA', 401, resp);
    return res.status(401).json(resp);
  }

  // ── التحقق من صلاحية accessToken ──
  const session = tokenStore.get(accessToken);
  if (!session || isTokenExpired(session.expiresAt)) {
    const resp = {
      success: false,
      error: 'ACCESS_TOKEN_EXPIRED',
      message: 'Access token is invalid or expired. Please login again.',
    };
    logResponse('/paygate/PAYWA', 401, resp);
    return res.status(401).json(resp);
  }

  // ── التحقق من بيانات المحفظة ──
  const { wallet, walletPassword } = body;
  if (!wallet || !walletPassword) {
    const resp = {
      success: false,
      error: 'MISSING_WALLET_CREDENTIALS',
      message: 'wallet and walletPassword are required in body',
    };
    logResponse('/paygate/PAYWA', 400, resp);
    return res.status(400).json(resp);
  }

  if (wallet !== MERCHANT.wallet || walletPassword !== MERCHANT.walletPassword) {
    const resp = {
      success: false,
      error: 'INVALID_WALLET_CREDENTIALS',
      message: 'Invalid wallet identifier or password',
    };
    logResponse('/paygate/PAYWA', 401, resp);
    return res.status(401).json(resp);
  }

  // ── إنشاء walletToken ──
  const walletToken = generateToken('wal');
  const expiresIn = MERCHANT.walletExpiry / 1000;

  // تحديث الجلسة
  session.walletToken = walletToken;
  session.walletExpiresAt = Date.now() + MERCHANT.walletExpiry;
  session.signonDetail = header.signonDetail;
  tokenStore.set(accessToken, session);

  const resp = {
    success: true,
    walletToken,
    expiresIn,
  };
  logResponse('/paygate/PAYWA', 200, resp);
  return res.json(resp);
});

// ═══════════════════════════════════════════════════════════════
// POST /paygate/PAYAG — عمليات التجارة الإلكترونية
// ═══════════════════════════════════════════════════════════════
// مسار واحد للاستعلام والصرف (مطابق لجوالي الحقيقي)
//
// المدخلات:
// {
//   "header": {
//     "signonDetail": { "orgID": "...", "userID": "...", "externalUser": "..." },
//     "accessToken": "acc_xxx...",
//     "walletToken": "wal_xxx..."
//   },
//   "body": {
//     "voucher": "3360714",
//     "receiverMobile": "711029220",
//     "purpose": "test bill payment"
//   }
// }
//
// السلوك:
//   - إذا لم يوجد inquiry سابق لنفس (voucher + mobile) → INQUIRY (PENDING)
//   - إذا وُجد inquiry بحالة PENDING → CASHOUT (SUCCESS/FAILED)
//
// مطابق لـ: JawaliService::ecommerceInquiry() + ecommerceCashout()

router.post('/PAYAG', (req, res) => {
  const { header, body } = req.body;
  logRequest('POST', '/paygate/PAYAG', req.body);

  // ── التحقق من البنية ──
  if (!header || !body) {
    const resp = {
      success: false,
      error: 'INVALID_REQUEST',
      message: 'Request must contain header and body',
    };
    logResponse('/paygate/PAYAG', 400, resp);
    return res.status(400).json(resp);
  }

  // ── التحقق من signonDetail ──
  if (!header.signonDetail?.orgID || !header.signonDetail?.userID) {
    const resp = {
      success: false,
      error: 'INVALID_SIGNON',
      message: 'header.signonDetail must contain orgID and userID',
    };
    logResponse('/paygate/PAYAG', 400, resp);
    return res.status(400).json(resp);
  }

  // ── التحقق من accessToken ──
  const accessToken = header.accessToken
    || req.headers.authorization?.replace('Bearer ', '');

  if (!accessToken) {
    const resp = { success: false, error: 'MISSING_ACCESS_TOKEN', message: 'accessToken is required' };
    logResponse('/paygate/PAYAG', 401, resp);
    return res.status(401).json(resp);
  }

  const session = tokenStore.get(accessToken);
  if (!session || isTokenExpired(session.expiresAt)) {
    const resp = { success: false, error: 'ACCESS_TOKEN_EXPIRED', message: 'Access token expired. Please login again.' };
    logResponse('/paygate/PAYAG', 401, resp);
    return res.status(401).json(resp);
  }

  // ── التحقق من walletToken ──
  const walletToken = header.walletToken;
  if (!walletToken || walletToken !== session.walletToken || isTokenExpired(session.walletExpiresAt)) {
    const resp = { success: false, error: 'WALLET_TOKEN_EXPIRED', message: 'Wallet token is invalid or expired. Please re-authenticate wallet.' };
    logResponse('/paygate/PAYAG', 401, resp);
    return res.status(401).json(resp);
  }

  // ── التحقق من بيانات العملية ──
  const { voucher, receiverMobile, purpose } = body;
  if (!voucher || !receiverMobile) {
    const resp = { success: false, error: 'INVALID_INPUT', message: 'voucher and receiverMobile are required' };
    logResponse('/paygate/PAYAG', 400, resp);
    return res.status(400).json(resp);
  }

  // ── تحديد نوع العملية: Inquiry أو Cashout ──
  const compositeKey = `${voucher}:${receiverMobile}`;
  const existingInquiry = inquiryStore.get(compositeKey);

  if (existingInquiry && existingInquiry.state === 'PENDING') {
    // ═══ CASHOUT — تنفيذ الصرف ═══
    return handleCashout(req, res, existingInquiry, compositeKey, purpose);
  } else {
    // ═══ INQUIRY — استعلام جديد ═══
    return handleInquiry(req, res, voucher, receiverMobile, purpose, compositeKey);
  }
});

// ─── Inquiry Handler ─────────────────────────────────────────

function handleInquiry(req, res, voucher, receiverMobile, purpose, compositeKey) {
  const transactionRef = generateRef('JWL-INQ');

  // محاكاة: توليد مبلغ بناءً على الـ voucher (في الحقيقي يأتي من بوابة جوالي)
  // هنا نستخدم أرقام الـ voucher لتوليد مبلغ ثابت
  const voucherNum = parseInt(voucher) || 1000;
  const simulatedAmount = (voucherNum % 50000) + 500; // مبلغ بين 500 و 50500

  const inquiryData = {
    voucher,
    receiverMobile,
    purpose: purpose || '',
    amount: simulatedAmount,
    currency: 'YER',
    state: 'PENDING',
    transactionRef,
    createdAt: Date.now(),
    expiresAt: Date.now() + (30 * 60 * 1000), // 30 دقيقة
  };

  inquiryStore.set(compositeKey, inquiryData);

  const resp = {
    success: true,
    data: {
      amount: simulatedAmount,
      currency: 'YER',
      state: 'PENDING',
      transactionRef,
    },
  };

  logResponse('/paygate/PAYAG [INQUIRY]', 200, resp);
  return res.json(resp);
}

// ─── Cashout Handler ─────────────────────────────────────────

function handleCashout(req, res, inquiry, compositeKey, purpose) {
  // التحقق من انتهاء صلاحية الاستعلام
  if (Date.now() > inquiry.expiresAt) {
    inquiryStore.delete(compositeKey);
    const resp = {
      success: false,
      error: 'INQUIRY_EXPIRED',
      message: 'Inquiry has expired. Please perform a new inquiry.',
    };
    logResponse('/paygate/PAYAG [CASHOUT]', 400, resp);
    return res.status(400).json(resp);
  }

  // محاكاة نجاح/فشل (95% نجاح — مثل بوابة حقيقية)
  const isSuccess = Math.random() < 0.95;
  const transactionRef = generateRef('JWL-CSH');

  if (!isSuccess) {
    inquiry.state = 'FAILED';
    inquiryStore.set(compositeKey, inquiry);

    const resp = {
      success: false,
      error: 'CASHOUT_FAILED',
      data: {
        amount: inquiry.amount,
        currency: inquiry.currency,
        state: 'FAILED',
        transactionRef,
        inquiryRef: inquiry.transactionRef,
      },
    };
    logResponse('/paygate/PAYAG [CASHOUT-FAIL]', 200, resp);
    return res.json(resp);
  }

  // نجاح — حذف الاستعلام من المخزن
  inquiry.state = 'SUCCESS';
  inquiryStore.delete(compositeKey);

  const resp = {
    success: true,
    data: {
      amount: inquiry.amount,
      currency: inquiry.currency,
      state: 'SUCCESS',
      transactionRef,
      inquiryRef: inquiry.transactionRef,
    },
  };

  logResponse('/paygate/PAYAG [CASHOUT-OK]', 200, resp);
  return res.json(resp);
}

// ─── تنظيف دوري للتوكنات والاستعلامات المنتهية ────────────

setInterval(() => {
  const now = Date.now();

  for (const [token, session] of tokenStore.entries()) {
    if (isTokenExpired(session.expiresAt)) {
      tokenStore.delete(token);
    }
  }

  for (const [key, inquiry] of inquiryStore.entries()) {
    if (now > inquiry.expiresAt) {
      inquiryStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // كل 5 دقائق

export default router;
