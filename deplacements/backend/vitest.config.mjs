import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    env: {
      NODE_ENV: 'test',
      TZ: 'Africa/Casablanca',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://deplacements:deplacements@localhost:5432/deplacements_test',
      JWT_SECRET: 'secret-de-test-0123456789-0123456789-abcdef',
      ENCRYPTION_KEY: 'aa'.repeat(32),
      UPLOAD_DIR: './storage-test/justificatifs',
      BACKUP_DIR: './storage-test/sauvegardes',
      CRON_ENABLED: 'false',
      SMTP_HOST: '',
    },
  },
});
