import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ ResponseCode: 401, ResponseMessage: 'يجب تسجيل الدخول أولاً' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key');

    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({ ResponseCode: 401, ResponseMessage: 'المستخدم غير موجود أو محظور' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ ResponseCode: 401, ResponseMessage: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
    }
    return res.status(401).json({ ResponseCode: 401, ResponseMessage: 'توكن غير صالح' });
  }
};

export const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, phone: user.phone, role: user.role },
    process.env.JWT_SECRET || 'dev-secret-key',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};
