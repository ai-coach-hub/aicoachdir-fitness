import { ensureTermsAcceptanceSchema } from "@/lib/termsAcceptanceDb";
import {
  FITNESS_INCLUDED_USES, FITNESS_PLAN, FITNESS_PRICE, TERMS_VERSION, tierTermsSelection,
} from "@/lib/termsAcceptance";

export async function currentMembershipTermsId(email: string, tier?: unknown) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return "";
  const sql = await ensureTermsAcceptanceSchema();
  const selection = tierTermsSelection(tier);
  const plan = selection?.plan || FITNESS_PLAN;
  const price = selection?.price || FITNESS_PRICE;
  const messages = selection?.includedUses || FITNESS_INCLUDED_USES;
  const accepted = await sql`
    SELECT id::text AS id
    FROM terms_acceptances
    WHERE email = ${normalized}
      AND terms_version = ${TERMS_VERSION}
      AND plan = ${plan}
      AND price = ${price}
      AND included_uses = ${messages}
    ORDER BY accepted_at DESC LIMIT 1
  `;
  // A durable acceptance of the current, unchanged Terms carries forward
  // between sign-ins or reactivations. New versions require fresh agreement.
  return String(accepted[0]?.id || "");
}
