export type BillingIdentityOutcome =
  | { outcome: "linked"; customerId: string; subscriptionId: string; source: string }
  | { outcome: "unlinked" | "ambiguous" };

export interface BillingSubscription {
  customerId: string;
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: number;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface BillingCustomer {
  id: string;
  email: string;
}

export interface PickaxeBillingIdentity {
  email: string;
  id: string;
}

export function extractPickaxeIdentity(payload: unknown): PickaxeBillingIdentity | null;

export function decideBillingIdentity(input: {
  email: string;
  clerkUserId: string;
  customers: BillingCustomer[];
  subscriptions: BillingSubscription[];
  pickaxe?: PickaxeBillingIdentity | null;
  studioId?: string;
  now?: number;
}): BillingIdentityOutcome;
