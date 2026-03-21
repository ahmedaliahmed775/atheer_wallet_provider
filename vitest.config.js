import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // متغيرات البيئة المطلوبة لتشغيل الاختبارات
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
      ATHEER_TOKEN_KEY: '12345678901234567890123456789012',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'test_db',
      DB_USER: 'test',
      DB_PASSWORD: 'test',
      ADMIN_EMAIL: 'admin@test.com',
      ADMIN_PASSWORD: 'test_admin_password',
      PORT: '3001',
    },
  },
});
