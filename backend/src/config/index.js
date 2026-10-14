'use strict';
module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || 'pegwin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pegwin'
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  paymentsDraft: process.env.PAYMENTS_DRAFT !== 'false',
  cashfreeUrl: process.env.CASHFREE_URL || '',
  razorpayUrl: process.env.RAZORPAY_URL || '',
  cashfreeWebhookSecret: process.env.CASHFREE_WEBHOOK_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  // Logging: file output is ON by default with daily rotation; keep N days.
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || 'logs',
  logToFile: process.env.LOG_TO_FILE !== 'false',
  logToConsole: process.env.LOG_TO_CONSOLE !== 'false',
  logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS, 10) || 14,
  logMaxBytes: parseInt(process.env.LOG_MAX_BYTES, 10) || 10485760,
  // Firebase Admin SDK (push via FCM for both platforms + phone-auth verify).
  // Private key is stored with literal \n escapes in env; converted on load.
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  },
  pushEnabled: process.env.PUSH_ENABLED !== 'false',
  // Transactional email, multi-provider with failover. Primary/failover are
  // 'ses' | 'brevo' | '' (empty disables that slot). SMTP covers both.
  email: {
    enabled: process.env.EMAIL_ENABLED !== 'false',
    from: process.env.EMAIL_FROM || 'Pegwin <no-reply@pegwin.example>',
    primary: process.env.EMAIL_PRIMARY || 'ses',
    failover: process.env.EMAIL_FAILOVER || 'brevo',
    ses: {
      host: process.env.SES_SMTP_HOST || '',
      port: parseInt(process.env.SES_SMTP_PORT, 10) || 587,
      user: process.env.SES_SMTP_USER || '',
      pass: process.env.SES_SMTP_PASS || ''
    },
    brevo: {
      host: process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com',
      port: parseInt(process.env.BREVO_SMTP_PORT, 10) || 587,
      user: process.env.BREVO_SMTP_USER || '',
      pass: process.env.BREVO_SMTP_PASS || ''
    }
  }
};
