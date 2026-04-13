import { Sequelize, DataTypes } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

export const sequelize = new Sequelize(
  process.env.DB_NAME || 'atheer_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
  }
);

// ─── User Model ───────────────────────────────────────────
export const User = sequelize.define('User', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name:         { type: DataTypes.STRING(100), allowNull: false },
  phone:        { type: DataTypes.STRING(20), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role:         { type: DataTypes.ENUM('customer', 'merchant'), defaultValue: 'customer' },
  balance:      { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
  isActive:     { type: DataTypes.BOOLEAN, defaultValue: true },
}, { tableName: 'users', underscored: true });

// ─── Transaction Model ────────────────────────────────────
export const Transaction = sequelize.define('Transaction', {
  id:          { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  senderId:    { type: DataTypes.INTEGER, allowNull: true },
  receiverId:  { type: DataTypes.INTEGER, allowNull: false },
  amount:      { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  type:        { type: DataTypes.ENUM('TRANSFER', 'CASHOUT', 'TOPUP'), defaultValue: 'TRANSFER' },
  status:      { type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PENDING'), defaultValue: 'SUCCESS' },
  note:        { type: DataTypes.STRING(255) },
  refId:       { type: DataTypes.STRING(100), unique: true },
}, { tableName: 'transactions', underscored: true });

// ─── Voucher Model ────────────────────────────────────────
export const Voucher = sequelize.define('Voucher', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId:  { type: DataTypes.INTEGER, allowNull: false },
  amount:      { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  voucherCode: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  expiresAt:   { type: DataTypes.DATE, allowNull: false },
  status:      { type: DataTypes.ENUM('ACTIVE', 'CONSUMED', 'EXPIRED'), defaultValue: 'ACTIVE' },
}, { tableName: 'vouchers', underscored: true });

// ─── Associations ─────────────────────────────────────────
User.hasMany(Transaction, { foreignKey: 'senderId',   as: 'sentTransactions' });
User.hasMany(Transaction, { foreignKey: 'receiverId', as: 'receivedTransactions' });
User.hasMany(Voucher,     { foreignKey: 'customerId', as: 'vouchers' });
