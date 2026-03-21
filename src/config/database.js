// إعداد الاتصال بقاعدة البيانات باستخدام Sequelize ORM
import { Sequelize } from 'sequelize';
import 'dotenv/config';

// إنشاء نسخة Sequelize للتواصل مع قاعدة بيانات PostgreSQL
const sequelize = new Sequelize(
  process.env.DB_NAME || 'atheer_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,

    // SSL: إما DB_SSL=true صراحة، أو الإنتاج بدون DB_SSL=false (مثل DO المُدار).
    // عيّن DB_SSL=false مع Postgres داخل Docker/VPS بدون TLS على الشبكة الداخلية.
    dialectOptions:
      process.env.DB_SSL === 'true' ||
      (process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false')
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false
            }
          }
        : {},

    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

export default sequelize;
