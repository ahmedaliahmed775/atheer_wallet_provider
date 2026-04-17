import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { sequelize } from './models/index.js';
import authRoutes from './routes/auth.js';
import walletRoutes from './routes/wallet.js';
import merchantRoutes from './routes/merchant.js';
import paygateRoutes from './routes/paygateRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  message: { ResponseCode: 429, ResponseMessage: 'طلبات كثيرة، حاول لاحقاً' }
});
app.use('/api/', limiter);

// Auth routes get stricter limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ResponseCode: 429, ResponseMessage: 'محاولات كثيرة، انتظر 15 دقيقة' }
});
app.use('/api/v1/auth/', authLimiter);

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ─── Routes ───────────────────────────────────────────────
app.use('/api/v1/auth',     authRoutes);
app.use('/api/v1/wallet',   walletRoutes);
app.use('/api/v1/merchant', merchantRoutes);

// ─── Jawali Paygate (محاكاة مطابقة ١٠٠٪ لبوابة جوالي) ────
// POST /oauth/token     → تسجيل دخول OAuth2
// POST /v1/ws/callWS    → كل العمليات (PAYWA/PAYAG) عبر serviceName
app.use('/', paygateRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '4.0.0', timestamp: new Date().toISOString() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ ResponseCode: 404, ResponseMessage: 'المسار غير موجود' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ ResponseCode: 500, ResponseMessage: 'خطأ داخلي في الخادم' });
});

// ─── Start ────────────────────────────────────────────────
async function start() {
  try {
    await sequelize.authenticate();
    console.log('✅ قاعدة البيانات متصلة');
    await sequelize.sync({ alter: true });
    console.log('✅ جداول قاعدة البيانات محدّثة');

    // Seed demo users if empty
    await seedDemoData();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 السيرفر يعمل على http://0.0.0.0:${PORT}`);
    });
  } catch (err) {
    console.error('❌ فشل تشغيل السيرفر:', err);
    process.exit(1);
  }
}

async function seedDemoData() {
  const { User } = await import('./models/index.js');
  const count = await User.count();
  if (count > 0) return;

  const bcrypt = await import('bcryptjs');
  const hash = (p) => bcrypt.default.hashSync(p, 10);

  await User.bulkCreate([
    { name: 'أحمد علي', phone: '777123456', passwordHash: hash('123456'), role: 'customer', balance: 25400 },
    { name: 'سارة محمد', phone: '777654321', passwordHash: hash('123456'), role: 'customer', balance: 10000 },
    { name: 'سوبرماركت المدينة', phone: '770000001', passwordHash: hash('123456'), role: 'merchant', balance: 0, posNumber: '100001' },
    { name: 'مطعم السعادة', phone: '770000002', passwordHash: hash('123456'), role: 'merchant', balance: 0, posNumber: '100002' },
  ]);
  console.log('✅ بيانات تجريبية أُضيفت');
}

start();
