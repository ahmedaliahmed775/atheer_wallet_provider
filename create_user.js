// سكريبت لإنشاء مستخدم جديد بسرعة من سطر الأوامر
import bcrypt from 'bcryptjs';
import User from './src/models/User.js';
import Wallet from './src/models/Wallet.js';
import sequelize from './src/config/database.js';

const phone = process.argv[2] || '0555555555';
const password = process.argv[3] || 'test1234';
const name = process.argv[4] || 'مستخدم تجريبي';
const role = process.argv[5] || 'customer';
const initialBalance = role === 'merchant' ? 0 : 1000;

async function createUser() {
  try {
    await sequelize.authenticate();
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({ phone, password: hashedPassword, name, role });
    await Wallet.create({ phone, balance: initialBalance });
    console.log('تم إنشاء المستخدم بنجاح:', user.phone);
    process.exit(0);
  } catch (err) {
    console.error('خطأ أثناء إنشاء المستخدم:', err.message);
    process.exit(1);
  }
}

createUser();
