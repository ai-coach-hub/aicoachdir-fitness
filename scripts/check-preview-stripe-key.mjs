const vercelEnv = String(process.env.VERCEL_ENV || "").trim();
const restricted = String(process.env.STRIPE_RESTRICTED_KEY || "").trim();
const secret = String(process.env.STRIPE_SECRET_KEY || "").trim();

if (vercelEnv !== "preview") {
  console.log("Stripe Preview safety check skipped outside Vercel Preview.");
  process.exit(0);
}

const keys = [restricted, secret].filter(Boolean);
if (keys.length === 0) {
  console.error("Stripe Preview safety check failed: no Stripe server key is configured.");
  process.exit(1);
}

const invalid = keys.find(
  (value) => !value.startsWith("sk_test_") && !value.startsWith("rk_test_"),
);

if (invalid) {
  console.error(
    "Stripe Preview safety check failed: Preview must use only sk_test_ or rk_test_ credentials.",
  );
  process.exit(1);
}

console.log("Stripe Preview safety check passed: test-mode Stripe credential detected.");
