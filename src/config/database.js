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
    
    // التعديل هنا: تفعيل SSL إجبارياً في بيئة الإنتاج (DigitalOcean)
    dialectOptions: process.env.NODE_ENV === 'production' ? {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    } : {},

    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

export default sequelize;
