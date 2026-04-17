// ─────────────────────────────────────────────────────────────
// Jawali Payment Gateway — محاكاة مطابقة ١٠٠٪ للكود المصدري
// ─────────────────────────────────────────────────────────────
// مرجع: https://github.com/Alsharie/jawali-payment/blob/main/src/Services/JawaliService.php
//
// المسارات:
//   POST /oauth/token       → تسجيل دخول OAuth2 (form-encoded)
//   POST /v1/ws/callWS      → كل العمليات (PAYWA + PAYAG) عبر serviceName
//
// بنية الطلب (PAYWA/PAYAG):
//   {
//     "header": {
//       "serviceDetail":  { "corrID", "domainName", "serviceName" },
//       "signonDetail":   { "clientID", "orgID", "userID", "externalUser" },
//       "messageContext": { "clientDate", "bodyType" }
//     },
//     "body": { ... }
//   }
//
// بنية الاستجابة:
//   { "responseBody": { ... }, "responseStatus": { "systemStatus": "0", "systemStatusDesc": "..." } }
//
// ─────────────────────────────────────────────────────────────

import { Router } from 'express';
import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();

// ─── In-Memory Stores ────────────────────────────────────────

const tokenStore = new Map();   // accessToken → { userId, expiresAt }
const walletTokenStore = new Map(); // walletToken → { wallet, expiresAt }
const inquiryStore = new Map(); // compositeKey → { inquiry data }

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

function uuid() {
  return crypto.randomUUID();
}

// بيانات الوكيل — مطابق لـ config/jawali.php
const MERCHANT = {
  username:         process.env.JAWALI_MERCHANT_USERNAME       || 'atheer_merchant',
  password:         process.env.JAWALI_MERCHANT_PASSWORD       || 'atheer_pass_123',
  wallet_identifier: process.env.JAWALI_MERCHANT_WALLET        || '777000001',
  wallet_password:  process.env.JAWALI_MERCHANT_WALLET_PASSWORD || 'wallet_pass_123',
  org_id:           process.env.JAWALI_MERCHANT_ORG_ID          || 'atheer-org-001',
  user_id:          process.env.JAWALI_MERCHANT_USER_ID         || 'atheer.api.user',
  external_user:    process.env.JAWALI_MERCHANT_EXTERNAL_USER   || 'atheer_ext_1',
  tokenExpiry:      parseInt(process.env.JAWALI_TOKEN_EXPIRY    || '3600') * 1000,
  walletExpiry:     parseInt(process.env.JAWALI_WALLET_TOKEN_EXPIRY || '1800') * 1000,
};

// ─── Logging — مطابق لـ JAWALI_LOGGING_ENABLED ──────────────

const LOGGING = process.env.JAWALI_LOGGING_ENABLED === 'true';
const SENSITIVE_KEYS = ['password', 'access_token', 'refresh_token', 'token', 'accessToken', 'refreshToken', 'client_secret', 'clientSecret'];

function sanitizeLogData(data) {
  if (!data || typeof data !== 'object') return data;
  const sanitized = Array.isArray(data) ? [...data] : { ...data };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_KEYS.includes(key)) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeLogData(sanitized[key]);
    }
  }
  return sanitized;
}

function logRequest(method, url, payload) {
  if (!LOGGING) return;
  console.log(`[JAWALI-GW] ${method} ${url}`, JSON.stringify(sanitizeLogData(payload), null, 2));
}

function logResponse(url, status, data) {
  if (!LOGGING) return;
  console.log(`[JAWALI-GW] ← ${url} [${status}]`, JSON.stringify(sanitizeLogData(data), null, 2));
}

// ═══════════════════════════════════════════════════════════════
// POST /oauth/token — LOGIN TO SYSTEM
// ═══════════════════════════════════════════════════════════════
// مطابق لـ JawaliService::loginToSystem()
//
// Content-Type: application/x-www-form-urlencoded
// Body (form):
//   grant_type=password
//   client_id=restapp
//   client_secret=restapp
//   scope=read
//   username=xxx
//   password=xxx
//
// Response:
//   { access_token, token_type, refresh_token, expires_in, scope }

// يجب قبول form-encoded — مطابق لـ Http::asForm()
router.use('/oauth/token', express.urlencoded({ extended: true }));

router.post('/oauth/token', (req, res) => {
  const { grant_type, client_id, client_secret, scope, username, password } = req.body;
  logRequest('POST', '/oauth/token', { grant_type, client_id, scope, username });

  // ── التحقق من OAuth2 parameters ──
  if (grant_type !== 'password') {
    return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Only password grant type is supported' });
  }
  if (client_id !== 'restapp' || client_secret !== 'restapp') {
    return res.status(401).json({ error: 'invalid_client', error_description: 'Invalid client credentials' });
  }

  // ── التحقق من بيانات المستخدم ──
  if (!username || !password) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Username and password are required' });
  }
  if (username !== MERCHANT.username || password !== MERCHANT.password) {
    return res.status(401).json({ error: 'invalid_grant', error_description: 'Invalid username or password' });
  }

  // ── إنشاء access_token — مطابق لـ OAuth2 response ──
  const access_token = generateToken('acc');
  const refresh_token = generateToken('ref');
  const expires_in = MERCHANT.tokenExpiry / 1000;

  tokenStore.set(access_token, {
    userId: MERCHANT.user_id,
    expiresAt: Date.now() + MERCHANT.tokenExpiry,
  });

  const resp = {
    access_token,
    token_type: 'bearer',
    refresh_token,
    expires_in,
    scope: scope || 'read',
  };
  logResponse('/oauth/token', 200, resp);
  return res.json(resp);
});

// ═══════════════════════════════════════════════════════════════
// POST /v1/ws/callWS — كل العمليات (PAYWA + PAYAG)
// ═══════════════════════════════════════════════════════════════
// مطابق لـ JawaliService::walletAuthentication(), ecommerceInquiry(), ecommerceCashout()
//
// التمييز عبر: header.serviceDetail.serviceName
//   - "PAYWA.WALLETAUTHENTICATION" → مصادقة المحفظة
//   - "PAYAG.ECOMMERCEINQUIRY"    → استعلام
//   - "PAYAG.ECOMMCASHOUT"        → صرف
//
// accessToken يُرسل كـ Authorization: Bearer header
//
// Request:
// {
//   "header": {
//     "serviceDetail":  { "corrID": "uuid", "domainName": "WalletDomain", "serviceName": "PAYWA.WALLETAUTHENTICATION" },
//     "signonDetail":   { "clientID": "WeCash", "orgID": "...", "userID": "...", "externalUser": "..." },
//     "messageContext": { "clientDate": "20260417025959", "bodyType": "Clear" }
//   },
//   "body": { ... }
// }
//
// Response:
// {
//   "responseBody": { ... },
//   "responseStatus": { "systemStatus": "0", "systemStatusDesc": "Success" }
// }

router.post('/v1/ws/callWS', (req, res) => {
  const { header, body } = req.body;
  logRequest('POST', '/v1/ws/callWS', req.body);

  // ── التحقق من البنية الأساسية ──
  if (!header || !body) {
    return res.status(400).json(errorResponse('INVALID_REQUEST', 'Request must contain header and body'));
  }

  if (!header.serviceDetail?.serviceName) {
    return res.status(400).json(errorResponse('MISSING_SERVICE', 'header.serviceDetail.serviceName is required'));
  }

  if (!header.signonDetail?.orgID || !header.signonDetail?.userID) {
    return res.status(400).json(errorResponse('INVALID_SIGNON', 'signonDetail must contain orgID and userID'));
  }

  // ── التحقق من accessToken (Bearer header) — مطابق لـ withToken() ──
  const authHeader = req.headers.authorization;
  const accessToken = authHeader?.replace('Bearer ', '');

  if (!accessToken) {
    return res.status(401).json(errorResponse('UNAUTHORIZED', 'Authorization Bearer token is required'));
  }

  const session = tokenStore.get(accessToken);
  if (!session || isTokenExpired(session.expiresAt)) {
    return res.status(401).json(errorResponse('ACCESS_TOKEN_EXPIRED', 'Access token is invalid or expired'));
  }

  // ── توجيه حسب serviceName ──
  const serviceName = header.serviceDetail.serviceName;

  switch (serviceName) {
    case 'PAYWA.WALLETAUTHENTICATION':
      return handleWalletAuth(req, res, body, header);

    case 'PAYAG.ECOMMERCEINQUIRY':
      return handleEcommerceInquiry(req, res, body, header);

    case 'PAYAG.ECOMMCASHOUT':
      return handleEcommerceCashout(req, res, body, header);

    default:
      return res.status(400).json(errorResponse('UNKNOWN_SERVICE', `Unknown serviceName: ${serviceName}`));
  }
});

// ─── PAYWA.WALLETAUTHENTICATION ──────────────────────────────
// مطابق لـ JawaliService::walletAuthentication()
// body: { identifier, password }

function handleWalletAuth(req, res, body, header) {
  const { identifier, password } = body;

  if (!identifier || !password) {
    return res.status(400).json(errorResponse('MISSING_CREDENTIALS', 'identifier and password are required in body'));
  }

  if (identifier !== MERCHANT.wallet_identifier || password !== MERCHANT.wallet_password) {
    return res.json(errorResponse('INVALID_WALLET', 'Invalid wallet identifier or password'));
  }

  // إنشاء walletToken — يُخزّن كـ accessToken في walletTokenStore
  const walletToken = generateToken('wal');

  walletTokenStore.set(walletToken, {
    wallet: identifier,
    expiresAt: Date.now() + MERCHANT.walletExpiry,
  });

  const resp = successResponse({
    accessToken: walletToken,
    expiresIn: MERCHANT.walletExpiry / 1000,
  });

  logResponse('/v1/ws/callWS [WALLET_AUTH]', 200, resp);
  return res.json(resp);
}

// ─── PAYAG.ECOMMERCEINQUIRY ──────────────────────────────────
// مطابق لـ JawaliService::ecommerceInquiry()
// body: { agentWallet, voucher, receiverMobile, password, accessToken, refId, purpose }

function handleEcommerceInquiry(req, res, body, header) {
  const { agentWallet, voucher, receiverMobile, password, accessToken, refId, purpose } = body;

  // ── التحقق من المدخلات ──
  if (!voucher || !receiverMobile) {
    return res.json(errorResponse('INVALID_INPUT', 'voucher and receiverMobile are required'));
  }
  if (!agentWallet || !password) {
    return res.json(errorResponse('MISSING_WALLET', 'agentWallet and password are required'));
  }
  if (!accessToken) {
    return res.json(errorResponse('MISSING_WALLET_TOKEN', 'accessToken (walletToken) is required in body'));
  }

  // ── التحقق من walletToken ──
  const walletSession = walletTokenStore.get(accessToken);
  if (!walletSession || isTokenExpired(walletSession.expiresAt)) {
    return res.json(errorResponse('WALLET_TOKEN_EXPIRED', 'Wallet access token is invalid or expired'));
  }

  // ── التحقق من بيانات الوكيل ──
  if (agentWallet !== MERCHANT.wallet_identifier || password !== MERCHANT.wallet_password) {
    return res.json(errorResponse('INVALID_AGENT', 'Invalid agent wallet or password'));
  }

  // ── إنشاء inquiry ──
  const compositeKey = `${voucher}:${receiverMobile}`;
  const voucherNum = parseInt(voucher) || 1000;
  const simulatedAmount = String((voucherNum % 50000) + 500);
  const issuerTrxRef = generateRef('JWL-INQ');

  const inquiryData = {
    voucher,
    receiverMobile,
    purpose: purpose || '',
    txnamount: simulatedAmount,
    txncurrency: 'YER',
    state: 'PENDING',
    issuerTrxRef,
    trxDate: new Date().toISOString(),
    createdAt: Date.now(),
    expiresAt: Date.now() + (30 * 60 * 1000),
  };

  inquiryStore.set(compositeKey, inquiryData);

  const resp = successResponse({
    txnamount: simulatedAmount,
    txncurrency: 'YER',
    state: 'PENDING',
    issuerTrxRef,
    trxDate: inquiryData.trxDate,
    voucher,
    receiverMobile,
    purpose: purpose || '',
  });

  logResponse('/v1/ws/callWS [INQUIRY]', 200, resp);
  return res.json(resp);
}

// ─── PAYAG.ECOMMCASHOUT ──────────────────────────────────────
// مطابق لـ JawaliService::ecommerceCashout()
// body: { agentWallet, voucher, receiverMobile, password, accessToken, refId, purpose }

function handleEcommerceCashout(req, res, body, header) {
  const { agentWallet, voucher, receiverMobile, password, accessToken, refId, purpose } = body;

  // ── التحقق من المدخلات ──
  if (!voucher || !receiverMobile) {
    return res.json(errorResponse('INVALID_INPUT', 'voucher and receiverMobile are required'));
  }
  if (!accessToken) {
    return res.json(errorResponse('MISSING_WALLET_TOKEN', 'accessToken (walletToken) is required in body'));
  }

  // ── التحقق من walletToken ──
  const walletSession = walletTokenStore.get(accessToken);
  if (!walletSession || isTokenExpired(walletSession.expiresAt)) {
    return res.json(errorResponse('WALLET_TOKEN_EXPIRED', 'Wallet access token is invalid or expired'));
  }

  // ── العثور على inquiry سابق ──
  const compositeKey = `${voucher}:${receiverMobile}`;
  const inquiry = inquiryStore.get(compositeKey);

  if (!inquiry || inquiry.state !== 'PENDING') {
    return res.json(errorResponse('NO_PENDING_INQUIRY', 'No pending inquiry found. Perform inquiry first.'));
  }

  if (Date.now() > inquiry.expiresAt) {
    inquiryStore.delete(compositeKey);
    return res.json(errorResponse('INQUIRY_EXPIRED', 'Inquiry has expired. Please perform a new inquiry.'));
  }

  // محاكاة نجاح/فشل (95%)
  const isSuccess = Math.random() < 0.95;
  const issuerTrxRef = generateRef('JWL-CSH');

  if (!isSuccess) {
    inquiry.state = 'FAILED';
    inquiryStore.set(compositeKey, inquiry);

    const resp = errorResponse('CASHOUT_FAILED', 'Cashout operation failed');
    resp.responseBody = {
      txnamount: inquiry.txnamount,
      txncurrency: inquiry.txncurrency,
      state: 'FAILED',
      issuerTrxRef,
      trxDate: new Date().toISOString(),
    };
    logResponse('/v1/ws/callWS [CASHOUT-FAIL]', 200, resp);
    return res.json(resp);
  }

  // نجاح
  inquiry.state = 'SUCCESS';
  inquiryStore.delete(compositeKey);

  const resp = successResponse({
    txnamount: inquiry.txnamount,
    txncurrency: inquiry.txncurrency,
    state: 'SUCCESS',
    issuerTrxRef,
    inquiryRef: inquiry.issuerTrxRef,
    trxDate: new Date().toISOString(),
    voucher,
    receiverMobile,
  });

  logResponse('/v1/ws/callWS [CASHOUT-OK]', 200, resp);
  return res.json(resp);
}

// ─── Response Builders — مطابق لـ responseBody + responseStatus ──

function successResponse(responseBody) {
  return {
    responseBody,
    responseStatus: {
      systemStatus: '0',
      systemStatusDesc: 'Success',
      systemStatusDescNative: 'نجاح',
    },
  };
}

function errorResponse(code, desc) {
  return {
    responseBody: null,
    responseStatus: {
      systemStatus: '1',
      systemStatusDesc: desc,
      systemStatusDescNative: desc,
      errorCode: code,
    },
  };
}

// ─── تنظيف دوري ─────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [t, s] of tokenStore.entries()) { if (isTokenExpired(s.expiresAt)) tokenStore.delete(t); }
  for (const [t, s] of walletTokenStore.entries()) { if (isTokenExpired(s.expiresAt)) walletTokenStore.delete(t); }
  for (const [k, i] of inquiryStore.entries()) { if (now > i.expiresAt) inquiryStore.delete(k); }
}, 5 * 60 * 1000);

export default router;
