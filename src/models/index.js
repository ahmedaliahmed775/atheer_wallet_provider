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
  receiverId:  { type: DataTypes.INTEGER, allowNull: true },
  amount:      { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  type:        { type: DataTypes.ENUM('TRANSFER', 'CASHOUT', 'TOPUP', 'BILL_PAYMENT', 'EXTERNAL_TRANSFER', 'CASH_IN', 'CASH_OUT', 'QR_PAYMENT'), defaultValue: 'TRANSFER' },
  status:      { type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PENDING'), defaultValue: 'SUCCESS' },
  note:        { type: DataTypes.STRING(255) },
  refId:       { type: DataTypes.STRING(100), unique: true },
  metadata:    { type: DataTypes.JSONB, defaultValue: {} },
}, { tableName: 'transactions', underscored: true });



// ─── CashoutCode Model ───────────────────────────────────
// Used for cash withdrawal codes and external transfers
export const CashoutCode = sequelize.define('CashoutCode', {
  id:             { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId:         { type: DataTypes.INTEGER, allowNull: false },
  amount:         { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  code:           { type: DataTypes.STRING(10), allowNull: false, unique: true },
  type:           { type: DataTypes.ENUM('SELF_CASHOUT', 'EXTERNAL_TRANSFER'), defaultValue: 'SELF_CASHOUT' },
  recipientPhone: { type: DataTypes.STRING(20), allowNull: true },
  recipientName:  { type: DataTypes.STRING(100), allowNull: true },
  expiresAt:      { type: DataTypes.DATE, allowNull: false },
  status:         { type: DataTypes.ENUM('ACTIVE', 'REDEEMED', 'EXPIRED'), defaultValue: 'ACTIVE' },
}, { tableName: 'cashout_codes', underscored: true });

// ─── BillPayment Model ───────────────────────────────────
export const BillPayment = sequelize.define('BillPayment', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId:        { type: DataTypes.INTEGER, allowNull: false },
  transactionId: { type: DataTypes.UUID, allowNull: true },
  category:      { type: DataTypes.ENUM('TELECOM', 'INTERNET', 'ELECTRICITY', 'WATER'), allowNull: false },
  provider:      { type: DataTypes.STRING(50), allowNull: false },
  accountNumber: { type: DataTypes.STRING(50), allowNull: false },
  amount:        { type: DataTypes.DECIMAL(15, 2), allowNull: false },
  status:        { type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PENDING'), defaultValue: 'SUCCESS' },
}, { tableName: 'bill_payments', underscored: true });

// ─── Associations ─────────────────────────────────────────
User.hasMany(Transaction, { foreignKey: 'senderId',   as: 'sentTransactions' });
User.hasMany(Transaction, { foreignKey: 'receiverId', as: 'receivedTransactions' });
Transaction.belongsTo(User, { foreignKey: 'senderId',   as: 'sender' });
Transaction.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

User.hasMany(CashoutCode, { foreignKey: 'userId',     as: 'cashoutCodes' });
User.hasMany(BillPayment, { foreignKey: 'userId',     as: 'billPayments' });
