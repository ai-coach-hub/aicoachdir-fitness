import { randomUUID } from "node:crypto";
import { membershipDb } from "@/lib/fitnessMembershipDb";
import { canonicalMemberEmail } from "@/lib/memberIdentity";

export type CheckoutReservation = {
  email: string;
  clerkUserId: string;
  attemptId: string;
  termsAcceptanceId: string;
  destination: string;
  sessionId: string;
  checkoutUrl: string;
  stripeExpiresAt: number;
};

function readReservation(value: Record<string, unknown>): CheckoutReservation {
  return {
    email: String(value.email || ""),
    clerkUserId: String(value.clerk_user_id || ""),
    attemptId: String(value.attempt_id || ""),
    termsAcceptanceId: String(value.terms_acceptance_id || ""),
    destination: String(value.destination || ""),
    sessionId: String(value.stripe_session_id || ""),
    checkoutUrl: String(value.checkout_url || ""),
    stripeExpiresAt: Math.floor(new Date(String(value.stripe_expires_at || "")).getTime() / 1000),
  };
}

export async function reserveCheckout(args: {
  email: string;
  clerkUserId: string;
  termsAcceptanceId: string;
  destination: string;
}) {
  const memberEmail = canonicalMemberEmail(args.email);
  const sql = membershipDb();

  await sql`
    CREATE TABLE IF NOT EXISTS fitness_checkout_reservations (
      email TEXT PRIMARY KEY,
      clerk_user_id TEXT NOT NULL,
      attempt_id UUID NOT NULL,
      terms_acceptance_id UUID NOT NULL,
      destination TEXT NOT NULL,
      stripe_session_id TEXT,
      checkout_url TEXT,
      stripe_expires_at TIMESTAMPTZ NOT NULL,
      reservation_expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const attemptId = randomUUID();
  const rows = await sql`
    INSERT INTO fitness_checkout_reservations (
      email, clerk_user_id, attempt_id, terms_acceptance_id, destination,
      stripe_expires_at, reservation_expires_at
    ) VALUES (
      ${memberEmail}, ${args.clerkUserId}, ${attemptId},
      ${args.termsAcceptanceId}::uuid, ${args.destination},
      NOW() + INTERVAL '45 minutes',
      NOW() + INTERVAL '46 minutes'
    )
    ON CONFLICT (email) DO UPDATE SET
      clerk_user_id = EXCLUDED.clerk_user_id,
      attempt_id = EXCLUDED.attempt_id,
      terms_acceptance_id = EXCLUDED.terms_acceptance_id,
      destination = EXCLUDED.destination,
      stripe_session_id = NULL,
      checkout_url = NULL,
      stripe_expires_at = EXCLUDED.stripe_expires_at,
      reservation_expires_at = EXCLUDED.reservation_expires_at,
      created_at = NOW()
    WHERE fitness_checkout_reservations.reservation_expires_at <= NOW()
    RETURNING *
  `;

  const found = rows[0] || (await sql`
    SELECT *
    FROM fitness_checkout_reservations
    WHERE email = ${memberEmail}
    LIMIT 1
  `)[0];

  if (!found) throw new Error("Could not reserve a safe checkout session.");
  const reservation = readReservation(found);
  if (reservation.clerkUserId !== args.clerkUserId) {
    throw new Error("A different account is already completing checkout for this email.");
  }
  if (!Number.isFinite(reservation.stripeExpiresAt)) {
    throw new Error("Checkout expiration could not be determined.");
  }
  return reservation;
}

export async function rememberCheckoutSession(
  reservation: CheckoutReservation,
  sessionId: string,
  url: string,
) {
  const sql = membershipDb();
  const result = await sql`
    UPDATE fitness_checkout_reservations
    SET stripe_session_id = ${sessionId},
        checkout_url = ${url}
    WHERE email = ${reservation.email}
      AND clerk_user_id = ${reservation.clerkUserId}
      AND attempt_id = ${reservation.attemptId}::uuid
      AND (stripe_session_id IS NULL OR stripe_session_id = ${sessionId})
    RETURNING stripe_session_id
  `;
  if (!result.length) throw new Error("Checkout session reservation changed unexpectedly.");
}

export async function clearCompletedCheckoutReservation(email: string, sessionId: string) {
  const sql = membershipDb();
  // An already-paid checkout cannot be reused. Clear only its own reservation,
  // never a newer checkout created by another request.
  await sql`
    DELETE FROM fitness_checkout_reservations
    WHERE email = ${canonicalMemberEmail(email)}
      AND stripe_session_id = ${sessionId}
  `;
}
