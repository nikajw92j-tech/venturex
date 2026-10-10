import "server-only";

export const isProd = process.env.NODE_ENV === "production";

export const env = {
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  authSecret: process.env.AUTH_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  },
  smtpUrl: process.env.SMTP_URL ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "VENTUREX <no-reply@venturex.local>",
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? "sandbox") as "stripe" | "sandbox",
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    connectCountry: process.env.STRIPE_CONNECT_COUNTRY ?? "US",
  },
  escrow: {
    apiUrl: process.env.ESCROW_API_URL ?? "https://api.escrow-sandbox.com/2017-09-01",
    email: process.env.ESCROW_EMAIL ?? "",
    apiKey: process.env.ESCROW_API_KEY ?? "",
  },
  s3: {
    bucket: process.env.S3_BUCKET ?? "",
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  },
  exchangeRateUrl: process.env.EXCHANGE_RATE_URL ?? "https://open.er-api.com/v6/latest/USD",
};

export function googleEnabled() {
  return Boolean(env.google.clientId && env.google.clientSecret);
}
