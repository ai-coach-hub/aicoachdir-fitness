import { ensureTermsAcceptanceSchema } from "@/lib/termsAcceptanceDb";
import {
  FITNESS_INCLUDED_USES, FITNESS_PLAN, FITNESS_PRICE, TERMS_VERSION,
} from "@/lib/termsAcceptance";

export async function currentMembershipTermsId(email: string) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return "";
  const sql = await ensureTermsAcceptanceSchema();
  const accepted = await sql`
    SELECT id::text AS id
    FROM terms_acceptances
    WHERE email = ${normalized}
      AND terms_version = ${TERMS_VERSION}
      AND plan = ${FITNESS_PLAN}
      AND price = ${FITNESS_PRICE}
      AND included_uses = ${FITNESS_INCLUDED_USES}
    ORDER BY accepted_at DESC LIMIT 1
  `;
  // A durable acceptance of the current, unchanged Terms carries forward
  // between sign-ins or reactivations. New versions require fresh agreement.
  return String(accepted[0]?.id || "");
}
