// نموذج المستخدم - يمثل العملاء والتجار في منظومة Atheer
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const User = sequelize.define(
  'User',
  {
    // رقم الهاتف يُستخدم كمفتاح أساسي فريد لكل مستخدم
    phone: {
      type: DataTypes.STRING(20),
      primaryKey: true,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    // كلمة المرور المشفرة باستخدام bcrypt
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    // دور المستخدم: 'customer' للعميل أو 'merchant' للتاجر
    role: {
      type: DataTypes.ENUM('customer', 'merchant'),
      allowNull: false,
      defaultValue: 'customer',
    },
    // الاسم الكامل للمستخدم
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    tableName: 'users',
    timestamps: false,
  }
);

export default User;
