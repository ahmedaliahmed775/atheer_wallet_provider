// src/models/Voucher.js
// Model for Vouchers, refactored to ES6 and to be consistent with other models.
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const Voucher = sequelize.define(
  'Voucher',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // The phone number of the customer who generated the voucher.
    // This aligns with User model's primary key.
    customerPhone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      references: {
        model: 'users', // table name
        key: 'phone',
      },
    },
    amount: {
      type: DataTypes.DECIMAL(18, 2),
      allowNull: false,
    },
    voucherCode: {
      type: DataTypes.STRING(12),
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'CONSUMED', 'EXPIRED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  },
  {
    sequelize,
    modelName: 'Voucher',
    tableName: 'vouchers', // Ensure table name is explicit
    timestamps: true,
  }
);

export default Voucher;
