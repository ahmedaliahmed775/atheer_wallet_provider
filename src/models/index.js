// ملف تهيئة النماذج وتعريف العلاقات بينها
import sequelize from '../config/database.js';
import User from './User.js';
import Wallet from './Wallet.js';
import Transaction from './Transaction.js';

// تعريف علاقة واحد لواحد بين المستخدم ومحفظته
User.hasOne(Wallet, { foreignKey: 'phone', as: 'wallet' });
Wallet.belongsTo(User, { foreignKey: 'phone', as: 'user' });

export { sequelize, User, Wallet, Transaction };
