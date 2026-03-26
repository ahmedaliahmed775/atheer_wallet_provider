
// src/models/Transaction.js
// نموذج المعاملة المالية - يسجل كل عملية دفع في النظام
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Transaction = sequelize.define(
  'Transaction',
  {
    // معرف فريد للمعاملة بصيغة UUID
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // رقم هاتف المُرسِل (العميل الذي يدفع)
    sender: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    // رقم هاتف المُستقبِل (التاجر أو المقسم)
    receiver: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    // المبلغ المُحوَّل بالريال اليمني
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 0.01,
      },
    },
    // حالة المعاملة: ACCEPTED أو REJECTED أو PENDING
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'ACCEPTED',
    },
    // معرف فريد للعملية لمنع التكرار (القديم)
    nonce: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
    },
    // معرف العملية الخاص بأثير (الجديد)
    refId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    // نوع العملية (مثلاً CASH_OUT)
    transactionType: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    // مرجع إضافي (مثلاً لتخزين agentWallet القادم من المقسم)
    reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    tableName: 'transactions',
    timestamps: true,
    updatedAt: false,
  }
);

export default Transaction;
