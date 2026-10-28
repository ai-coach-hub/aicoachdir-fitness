import {stripeMode,stripeRequest} from "./stripeServer";
const EXPECTED_SANDBOX_ACCOUNT="acct_1UUd663gZjBKyfbc";
/** Guarantees that the Preview key is for the isolated Stripe sandbox, not
 * the live account's shared test mode (both otherwise have sk_test_ prefixes).
 * No customer or invoice mutations are permitted without this check.
 */
export async function verifiedSandboxStripeAccount(){
 if(process.env.VERCEL_ENV!=="preview"||
  process.env.VERCEL_GIT_COMMIT_REF!=="feature/verified-subscription-upgrade-policy-20261027"||
  stripeMode()!=="test")return false;
 const account=await stripeRequest("/account");
 return account.id===EXPECTED_SANDBOX_ACCOUNT;
}
