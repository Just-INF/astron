import { config } from "../lib/config";

if (config.NODE_ENV !== "production") throw new Error("Run with NODE_ENV=production.");
console.log(
  JSON.stringify(
    {
      valid: true,
      nodeEnv: config.NODE_ENV,
      frontendOrigin: config.FRONTEND_ORIGIN,
      database: new URL(config.DATABASE_URL).hostname,
      smtpHost: config.SMTP_HOST,
      billingConfigured: Boolean(config.LEMONSQUEEZY_API_KEY && config.LEMONSQUEEZY_WEBHOOK_SECRET),
    },
    null,
    2,
  ),
);
