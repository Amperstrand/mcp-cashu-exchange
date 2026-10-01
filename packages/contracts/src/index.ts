/**
 * @exchange/contracts — the two contracts that carry all modularity:
 * ServiceProvider (things you can search/act on) and PaymentRail (ways to pay).
 *
 * Everything internal is readonly plain types. Zod parsing lives at the
 * boundaries (worker input, provider APIs) — never here.
 */

/** Brand helper — distinct semantic primitives (see type-patterns). */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type ServiceId = Brand<string, "ServiceId">;
export type ProviderId = Brand<string, "ProviderId">;
export type RailId = Brand<string, "RailId">;

/**
 * Trusted constructors for branded IDs. These are the single boundary where
 * raw strings become domain IDs; everywhere else passes branded values.
 */
export const serviceId = (raw: string): ServiceId => raw as ServiceId;
export const providerId = (raw: string): ProviderId => raw as ProviderId;
export const railId = (raw: string): RailId => raw as RailId;

export const SERVICE_CATEGORIES = [
  "food",
  "charging",
  "parking",
  "shopping",
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/** Decimal string amount (e.g. "12.50") + ISO-4217-alike currency code. */
export interface Money {
  readonly amount: string;
  readonly currency: string;
}

/** TollGate grant vocabulary: a budget is a money-cap and/or a time-cap. */
export interface Grant {
  readonly moneyCap?: Money;
  readonly timeCapSeconds?: number;
}

export interface ServiceRecord {
  readonly id: ServiceId;
  readonly providerId: ProviderId;
  readonly category: ServiceCategory;
  readonly name: string;
  readonly location?: GeoPoint;
  readonly address?: string;
  readonly url?: string;
  /** Category-specific details carried inline when the provider has them. */
  readonly details?: ServiceDetails;
}

export interface ChargingDetails {
  readonly kind: "charging";
  readonly operator?: string;
  readonly socketTypes: readonly string[];
  readonly capacityKw?: number;
}

export interface GenericDetails {
  readonly kind: "generic";
  readonly note: string;
}

export type ServiceDetails = ChargingDetails | GenericDetails;

export interface SearchQuery {
  readonly category: ServiceCategory;
  readonly near?: GeoPoint;
  readonly radiusKm?: number;
  readonly text?: string;
}

export type ActionResult =
  | { readonly kind: "external"; readonly note: string }
  | { readonly kind: "started"; readonly reference: string };

export interface ServiceProvider {
  readonly id: ProviderId;
  readonly category: ServiceCategory;
  readonly displayName: string;
  search(query: SearchQuery): Promise<readonly ServiceRecord[]>;
  details(id: ServiceId): Promise<ServiceDetails>;
  /** Optional: providers that can act (order, start a session), not just list. */
  act?(id: ServiceId, grant: Grant): Promise<ActionResult>;
}

export const PAYMENT_RAIL_KINDS = ["cashu", "card", "lightning"] as const;
export type PaymentRailKind = (typeof PAYMENT_RAIL_KINDS)[number];

export interface PaymentQuote {
  readonly railId: RailId;
  readonly kind: PaymentRailKind;
  readonly amount: Money;
  readonly instructions: string;
}

export interface PaymentResult {
  readonly status: "pending" | "settled" | "failed";
  readonly reference: string;
}

export interface PaymentRail {
  readonly id: RailId;
  readonly kind: PaymentRailKind;
  readonly displayName: string;
  quote(amount: Money): Promise<PaymentQuote>;
  pay(quote: PaymentQuote): Promise<PaymentResult>;
}

export function assertNever(x: never): never {
  throw new Error(`unhandled variant: ${String(x)}`);
}
