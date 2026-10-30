/**
 * Client for the Pilbridge API (backend/). Holds the access token and turns API errors
 * into readable messages.
 */

export const TOKEN_KEY = "pilbridge-token";
export const SESSION_EXPIRED_KEY = "pilbridge-session-expired";

/** Called when the API rejects our token (expired or revoked), so the UI can sign out. */
const expiredListeners = new Set<() => void>();
export function onSessionExpired(fn: () => void) {
  expiredListeners.add(fn);
  return () => {
    expiredListeners.delete(fn);
  };
}

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const token = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(t: string | null) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {}
  },
};

type Options = { method?: string; body?: unknown; form?: FormData; auth?: boolean };

export async function api<T>(path: string, { method = "GET", body, form, auth = true }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const t = auth ? token.get() : null;
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: form ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError("Can’t reach Pilbridge right now. Check your connection and try again.", 0);
  }

  if (res.status === 401 && t) {
    // Our token was rejected: end the session everywhere in the UI, and say why on the sign-in page.
    token.set(null);
    try {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, "1");
    } catch {}
    expiredListeners.forEach((fn) => fn());
  }

  if (!res.ok) {
    let message = `Something went wrong (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (data.message) message = Array.isArray(data.message) ? data.message[0] : data.message;
    } catch {}
    throw new ApiError(message, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Fetch a protected binary (e.g. a prescription image) as an object URL. Revoke it when done. */
export async function apiBlobUrl(path: string): Promise<string> {
  const t = token.get();
  const res = await fetch(`${API_URL}${path}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new ApiError(res.status === 403 ? "Only pharmacists can view prescription images" : "Image unavailable", res.status);
  return URL.createObjectURL(await res.blob());
}

export const koboToNaira = (k: number) => k / 100;
export const formatKobo = (k: number) => "₦" + (k / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 });

/* ——— Response shapes ——— */

export type Role = "PATIENT" | "PHARMACIST" | "PHARMACY_STAFF" | "PLATFORM_ADMIN" | "RIDER";

export type ApiProfile = {
  id: string;
  /** Null for Google/Apple accounts that haven't added a number. */
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  pharmacyId: string | null;
  profileComplete: boolean;
  linkedAccounts?: ("GOOGLE" | "APPLE")[];
  pharmacy: { id: string; name: string; area: string; status: string; licenceExpiresAt: string } | null;
};

export type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  genericName: string;
  form: string;
  strength: string | null;
  packDescription: string;
  unitsPerPack: number;
  manufacturer: string;
  category: string;
  classification: "OTC" | "POM" | "DEVICE";
  coldChain: boolean;
  storage: string;
  uses: string | null;
  /** False: pharmacy pickup only, never delivered. */
  deliveryAllowed: boolean;
  pharmaciesInStock: number;
  fromPriceKobo: number | null;
};

export type ApiPharmacy = { id: string; slug: string; name: string; area: string; coldChain: boolean };

export type ApiQuote = {
  pharmacy: { id: string; name: string; area: string; coldChain: boolean };
  /** Estimated minutes from payment to the door, when a delivery area was given. */
  etaMinutes: number | null;
  distanceKm: number | null;
  lines: { productId: string; quantity: number; available: boolean; unitPriceKobo: number | null }[];
  unavailable: number;
  subtotalKobo: number;
  deliveryKobo: number;
  serviceKobo: number;
  totalKobo: number;
};

export type OrderStatus = "PHARMACIST_REVIEW" | "ACCEPTED" | "PREPARING" | "READY" | "PICKED_UP" | "DELIVERED" | "REJECTED" | "CANCELLED";

export type DeliveryStatus = "AWAITING_RIDER" | "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "FAILED" | "CANCELLED";

export type ApiDelivery = {
  code: string;
  status: DeliveryStatus;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failReason: string | null;
  dropoffCode?: string | null;
  provider: "PILBRIDGE_RIDERS" | "COURIER";
  trackingUrl: string | null;
  courier: { name: string } | null;
  rider: { firstName: string | null; riderProfile: { partner: string } | null } | null;
};

export type IncidentType = "DAMAGED" | "TAMPERED" | "LOST" | "TEMPERATURE_EXCURSION" | "WRONG_ITEM" | "OTHER";

export const incidentLabel: Record<IncidentType, string> = {
  DAMAGED: "Parcel damaged",
  TAMPERED: "Seal broken or opened",
  LOST: "Parcel lost",
  TEMPERATURE_EXCURSION: "Temperature problem (cold items)",
  WRONG_ITEM: "Wrong item",
  OTHER: "Something else",
};

export type ApiOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  statusNote: string | null;
  /** Payable once ACCEPTED; the pharmacy prepares it only once PAID. */
  paymentStatus: "UNPAID" | "PAID" | "REFUND_DUE";
  paidAt: string | null;
  deliveryAddress: string;
  deliveryArea: string | null;
  etaMinutes: number | null;
  /** Paid orders: when it should arrive. */
  arriveBy: string | null;
  /** The latest delivery attempt. The drop-off code is shown only to the patient, until it's delivered. */
  delivery: ApiDelivery | null;
  subtotalKobo: number;
  deliveryKobo: number;
  serviceKobo: number;
  totalKobo: number;
  createdAt: string;
  updatedAt: string;
  pharmacy: { name: string; area: string };
  prescription: { code: string; status: string } | null;
  patient?: { firstName: string | null; lastName: string | null };
  items: {
    id: string;
    quantity: number;
    unitPriceKobo: number;
    product: { name: string; strength: string | null; classification: string; coldChain: boolean };
    batch: { batchNumber: string; expiresAt: string } | null;
  }[];
};

export type ApiPharmacyPrescription = {
  id: string;
  code: string;
  status: "PENDING" | "APPROVED" | "CLARIFICATION_REQUESTED" | "REJECTED";
  prescriberName: string | null;
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  patient: { firstName: string | null; lastName: string | null };
  order: { code: string; items: { quantity: number; product: { name: string; strength: string | null } }[] } | null;
};

export type ApiBatch = {
  id: string;
  batchNumber: string;
  expiresAt: string;
  quantity: number;
  priceKobo: number;
  location: string | null;
  status: "SALEABLE" | "QUARANTINED" | "RECALLED" | "WRITTEN_OFF";
  quarantineReason: string | null;
  expired: boolean;
  shortDated: boolean;
  product: { name: string; strength: string | null; classification: string; coldChain: boolean };
};

/* ——— Pharmacy network: transfers, settlements, compliance, portal ——— */

export type ApiTransferStatus = "DRAFT" | "OFFERED" | "ACCEPTED" | "IN_TRANSIT" | "RECEIVED" | "DECLINED" | "CANCELLED";

export type ApiTransfer = {
  id: string;
  code: string;
  status: ApiTransferStatus;
  direction: "OUTGOING" | "INCOMING";
  quantity: number;
  note: string | null;
  closeReason: string | null;
  /** Why it can't go ahead as things stand (stock on hold, expired…). */
  blocked: string | null;
  fromPharmacy: { id: string; name: string; area: string };
  /** Null while offered to the whole network. */
  toPharmacy: { id: string; name: string; area: string } | null;
  product: { id: string; name: string; strength: string | null; classification: string; coldChain: boolean };
  batch: { batchNumber: string; expiresAt: string; status: string };
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  acceptedAt: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
};

export type ApiNotification = { id: string; kind: string; title: string; body: string; href: string; at: string; unread: boolean };

export type SettlementTotals = { orderCount: number; grossKobo: number; feesKobo: number; netKobo: number };

export type ApiPayout = SettlementTotals & {
  id: string;
  code: string;
  status: "SCHEDULED" | "PAID" | "VOID";
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  reference: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  createdAt: string;
};

export type BankState = { payable: boolean; reason: string | null; holdUntil: string | null };

export type ApiSettlements = {
  unsettled: SettlementTotals;
  payouts: ApiPayout[];
  bank: BankState & { bankName: string | null; accountName: string | null; accountNumber: string | null; verified: boolean };
};

export type DocumentKind = "PREMISES_LICENCE" | "SUPERINTENDENT_LICENCE" | "CAC_CERTIFICATE" | "COLD_CHAIN_CALIBRATION" | "INSURANCE" | "OTHER";

export type ApiDocument = {
  id: string;
  kind: DocumentKind;
  label: string;
  reference: string;
  issuer: string;
  expiresAt: string | null;
  fileName: string | null;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  expiry: "valid" | "expiring" | "expired" | null;
};

export type ApiCompliance = {
  pharmacy: { name: string; status: string; premisesLicenceNo: string; licenceExpiresAt: string; suspendedReason: string | null };
  kinds: {
    kind: DocumentKind;
    name: string;
    issuer: string;
    expires: boolean;
    reference: string | null;
    expiresAt: string | null;
    state: "valid" | "expiring" | "expired" | "missing";
    current: ApiDocument | null;
    pending: ApiDocument | null;
    rejected: ApiDocument | null;
  }[];
  documents: ApiDocument[];
};

export type ApiActivity = { id: string; at: string; who: string; action: string; text: string };

export type ApiSettings = {
  profile: { name: string; area: string; address: string; premisesLicenceNo: string; licenceExpiresAt: string; superintendentName: string | null; status: string; coldChain: boolean };
  contact: { phone: string | null; email: string | null };
  hours: { openDays: number[]; opensAt: string | null; lastOrderAt: string | null };
  coverageAreas: string[];
  areas: { key: string; name: string }[];
  bank: { bankName: string | null; accountName: string | null; accountNumber: string | null; verified: boolean; updatedAt: string | null; holdUntil: string | null };
};

export type ApiTeamMember = { id: string; firstName: string | null; lastName: string | null; role: Role; phone: string | null; pcnRegNo: string | null };

/* ——— Sign-in results ——— */

export type SignedIn = { status: "signed_in"; accessToken: string; user: ApiProfile; isNewUser?: boolean; recoveryCodes?: string[] };
/** Admins and pharmacists: finish with an authenticator code (set it up the first time). */
export type MfaChallenge = { status: "mfa_required" | "mfa_setup_required"; mfaToken: string; isNewUser?: boolean };
export type SignInResult = SignedIn | MfaChallenge;
