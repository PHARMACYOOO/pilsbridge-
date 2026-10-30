import type { BadgeTone } from "@/components/ui";
import type { ApiTransfer, DeliveryStatus } from "./api";

// Pharmacy portal view types and labels. Everything shown in the portal comes from the API.

export type OrderStatus =
  | "pharmacist_review"
  | "accepted"
  | "preparing"
  | "ready"
  | "picked_up"
  | "delivered"
  | "rejected"
  | "cancelled";

export const orderStatus: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  pharmacist_review: { label: "Pharmacist review", tone: "warn" },
  accepted: { label: "Accepted", tone: "neutral" },
  preparing: { label: "Preparing", tone: "neutral" },
  ready: { label: "Ready for pickup", tone: "ok" },
  picked_up: { label: "In transit", tone: "ok" },
  delivered: { label: "Delivered", tone: "ok" },
  rejected: { label: "Rejected", tone: "alert" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/**
 * The next step a pharmacy can take on an order, if any. Collection and hand-over belong to the
 * rider (with the customer's code), so the pharmacy's part ends at "ready".
 */
export const nextStep: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  accepted: { to: "preparing", label: "Start preparing" },
  preparing: { to: "ready", label: "Mark ready for pickup" },
};

export type PortalDelivery = {
  code: string;
  status: DeliveryStatus;
  provider: "PILBRIDGE_RIDERS" | "COURIER";
  /** Rider's first name, or the courier company. */
  rider?: string;
  partner?: string;
  failReason?: string;
  assignedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
};

export const deliveryStatus: Record<DeliveryStatus, { label: string; tone: BadgeTone }> = {
  AWAITING_RIDER: { label: "Finding a rider", tone: "warn" },
  ASSIGNED: { label: "Rider on the way to you", tone: "neutral" },
  PICKED_UP: { label: "Out for delivery", tone: "ok" },
  DELIVERED: { label: "Delivered", tone: "ok" },
  FAILED: { label: "Failed · back at pharmacy", tone: "alert" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export type Order = {
  id: string;
  time: string;
  customer: string;
  area: string;
  items: { name: string; qty: number; price: number }[];
  rx: boolean;
  status: OrderStatus;
  note?: string;
  createdAt?: string;
  /** Prepared only once paid. */
  payment: "unpaid" | "paid" | "refund_due";
  cold: boolean;
  /** Paid orders: promised arrival time (ISO). */
  arriveBy?: string;
  /** The latest delivery attempt. */
  delivery?: PortalDelivery;
};

export const orderTotal = (o: Order) => (o.status === "rejected" ? 0 : o.items.reduce((s, i) => s + i.qty * i.price, 0));

export type RxStatus = "pending" | "approved" | "clarify" | "rejected";

export type Prescription = {
  id: string;
  orderId: string;
  patient: string;
  prescriber: string;
  issued: string;
  waiting: string;
  lines: { drug: string; directions: string; qty: string }[];
  flags: string[];
  status: RxStatus;
};

export type StockStatus = "ok" | "low" | "expiring" | "quarantined";

export type StockItem = {
  sku: string;
  name: string;
  batch: string;
  expiry: string; // YYYY-MM
  onHand: number;
  reorderAt: number;
  monthly: number;
  location: string;
  rx: boolean;
  cold?: boolean;
  status: StockStatus;
  reason?: string;
  priceKobo?: number;
};

export const stockStatus: Record<StockStatus, { label: string; tone: BadgeTone }> = {
  ok: { label: "Healthy", tone: "ok" },
  low: { label: "Low stock", tone: "warn" },
  expiring: { label: "Short-dated", tone: "warn" },
  quarantined: { label: "Quarantined", tone: "alert" },
};

/** A transfer's badge, from the viewing pharmacy's side. */
export function transferBadge(t: ApiTransfer): { label: string; tone: BadgeTone } {
  if (t.blocked && ["DRAFT", "OFFERED", "ACCEPTED"].includes(t.status)) return { label: "Blocked", tone: "alert" };
  switch (t.status) {
    case "DRAFT":
      return { label: "Draft · needs a pharmacist", tone: "neutral" };
    case "OFFERED":
      return t.direction === "INCOMING" ? { label: "Needs approval", tone: "warn" } : { label: t.toPharmacy ? "Offered" : "Offered to network", tone: "neutral" };
    case "ACCEPTED":
      return t.direction === "OUTGOING" ? { label: "Accepted · send it", tone: "warn" } : { label: "Accepted · awaiting dispatch", tone: "ok" };
    case "IN_TRANSIT":
      return t.direction === "INCOMING" ? { label: "On its way · check in", tone: "warn" } : { label: "In transit", tone: "ok" };
    case "RECEIVED":
      return { label: "Received", tone: "neutral" };
    case "DECLINED":
      return { label: "Declined", tone: "neutral" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
  }
}
