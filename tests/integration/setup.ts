try {
  process.loadEnvFile(".env");
} catch {}
process.env.PAYMENT_PROVIDER = "sandbox";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
