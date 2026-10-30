"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type ApiBatch, type ApiNotification, type ApiOrder, type ApiPharmacyPrescription, type ApiTransfer, type IncidentType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Order, OrderStatus, Prescription, RxStatus, StockItem } from "@/lib/portal-data";

/* ——— API → portal view models ——— */

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const sinceLabel = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
};
const strengthed = (p: { name: string; strength: string | null }) => (p.strength ? `${p.name} ${p.strength}` : p.name);

function toOrder(o: ApiOrder): Order {
  const first = o.patient?.firstName ?? "Patient";
  const last = o.patient?.lastName ? ` ${o.patient.lastName[0]}.` : "";
  return {
    id: o.code,
    time: hhmm(o.createdAt),
    customer: `${first}${last}`,
    area: o.deliveryAddress,
    items: o.items.map((i) => ({ name: strengthed(i.product), qty: i.quantity, price: i.unitPriceKobo / 100 })),
    rx: !!o.prescription || o.items.some((i) => i.product.classification === "POM"),
    status: o.status.toLowerCase() as OrderStatus,
    note: o.statusNote ?? (o.items.some((i) => i.product.coldChain) ? "Cold chain — pack with validated cold box" : undefined),
    createdAt: o.createdAt,
    payment: o.paymentStatus.toLowerCase() as Order["payment"],
    cold: o.items.some((i) => i.product.coldChain),
    arriveBy: o.arriveBy ?? undefined,
    delivery: o.delivery
      ? {
          code: o.delivery.code,
          status: o.delivery.status,
          provider: o.delivery.provider,
          rider: o.delivery.provider === "COURIER" ? (o.delivery.courier?.name ?? "Courier") : (o.delivery.rider?.firstName ?? undefined),
          partner: o.delivery.provider === "COURIER" ? "courier" : o.delivery.rider?.riderProfile?.partner,
          failReason: o.delivery.failReason ?? undefined,
          assignedAt: o.delivery.assignedAt ?? undefined,
          pickedUpAt: o.delivery.pickedUpAt ?? undefined,
          deliveredAt: o.delivery.deliveredAt ?? undefined,
        }
      : undefined,
  };
}

const rxStatus: Record<ApiPharmacyPrescription["status"], RxStatus> = {
  PENDING: "pending",
  APPROVED: "approved",
  CLARIFICATION_REQUESTED: "clarify",
  REJECTED: "rejected",
};

function toPrescription(r: ApiPharmacyPrescription): Prescription {
  return {
    id: r.code,
    orderId: r.order?.code ?? "—",
    patient: [r.patient.firstName, r.patient.lastName].filter(Boolean).join(" ") || "Patient",
    prescriber: r.prescriberName ?? "Not entered — check the image",
    issued: new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    waiting: r.status === "PENDING" || r.status === "CLARIFICATION_REQUESTED" ? sinceLabel(r.createdAt) : "—",
    lines: (r.order?.items ?? []).map((i) => ({ drug: strengthed(i.product), directions: "As written on the prescription", qty: `${i.quantity} pack${i.quantity > 1 ? "s" : ""}` })),
    flags: [...(r.prescriberName ? [] : ["Prescriber name not entered by the patient"]), ...(r.decisionNote && r.status === "CLARIFICATION_REQUESTED" ? [`Awaiting patient: ${r.decisionNote}`] : [])],
    status: rxStatus[r.status],
  };
}

const LOW_STOCK_AT = 5;

function toStock(b: ApiBatch): StockItem {
  const blocked = b.status !== "SALEABLE";
  return {
    sku: b.id,
    name: strengthed(b.product),
    batch: b.batchNumber,
    expiry: b.expiresAt.slice(0, 7),
    onHand: b.quantity,
    reorderAt: LOW_STOCK_AT,
    monthly: 0, // sales history isn't tracked yet
    location: b.location ?? "—",
    rx: b.product.classification === "POM",
    cold: b.product.coldChain,
    status: blocked ? "quarantined" : b.shortDated ? "expiring" : b.quantity <= LOW_STOCK_AT ? "low" : "ok",
    reason: b.status === "RECALLED" ? "Recalled" : b.status === "WRITTEN_OFF" ? "Written off" : (b.quarantineReason ?? undefined),
    priceKobo: b.priceKobo,
  };
}

/* ——— Store ——— */

type Toast = { id: number; text: string; tone: "ok" | "error" };

/** What a pharmacy can do to a transfer; the API checks who may do each. */
export type TransferAction = "publish" | "accept" | "dispatch" | "decline" | "cancel" | "receive";

type Store = {
  orders: Order[];
  prescriptions: Prescription[];
  stock: StockItem[];
  transfers: ApiTransfer[];
  notifications: ApiNotification[];
  loading: boolean;
  loadError: string | null;
  unread: boolean;
  toasts: Toast[];
  refresh: () => Promise<void>;
  setOrderStatus: (code: string, status: OrderStatus, note?: string) => Promise<boolean>;
  /** Book a new rider (after a failed delivery). */
  bookRider: (code: string) => Promise<boolean>;
  /** Check the seal code the rider or courier shows, and hand the parcel over. */
  handover: (code: string, sealCode: string) => Promise<boolean>;
  reportIncident: (code: string, type: IncidentType, description: string) => Promise<boolean>;
  reviewRx: (code: string, status: RxStatus, note?: string) => Promise<boolean>;
  adjustBatch: (id: string, delta: number, reason: string) => Promise<boolean>;
  quarantineBatch: (id: string, reason: string) => Promise<boolean>;
  releaseBatch: (id: string, note?: string) => Promise<boolean>;
  receiveBatch: (dto: { productId: string; batchNumber: string; expiresAt: string; quantity: number; priceKobo: number; location?: string }) => Promise<boolean>;
  /** A draft transfer out of a batch; offered to one pharmacy, or the network if none is given. */
  createTransfer: (batchId: string, quantity: number, toPharmacyId?: string) => Promise<boolean>;
  transferAction: (code: string, action: TransferAction, body?: Record<string, unknown>) => Promise<boolean>;
  markAllRead: () => Promise<void>;
  notify: (text: string, tone?: "ok" | "error") => void;
};

const Ctx = createContext<Store | null>(null);

export function usePortal() {
  const s = useContext(Ctx);
  if (!s) throw new Error("usePortal must be used inside <PortalProvider>");
  return s;
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong — please try again.");

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [prescriptions, setRx] = useState<Prescription[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [transfers, setTransfers] = useState<ApiTransfer[]>([]);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = ++nextId.current;
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 5000 : 3200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [o, r, b, t, n] = await Promise.all([
        api<ApiOrder[]>("/pharmacy/orders"),
        api<ApiPharmacyPrescription[]>("/pharmacy/prescriptions"),
        api<ApiBatch[]>("/pharmacy/inventory"),
        api<ApiTransfer[]>("/pharmacy/transfers"),
        api<{ unread: number; items: ApiNotification[] }>("/pharmacy/notifications"),
      ]);
      setOrders(o.map(toOrder));
      setRx(r.map(toPrescription));
      setStock(b.map(toStock));
      setTransfers(t);
      setNotifications(n.items);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load once signed in as staff, then keep the queue fresh while the tab is visible.
  const staffId = user && (user.role === "PHARMACIST" || user.role === "PHARMACY_STAFF") ? user.id : null;
  useEffect(() => {
    if (!staffId) return;
    refresh();
    const t = window.setInterval(() => document.visibilityState === "visible" && refresh(), 30_000);
    // Coming back to the tab: catch up straight away.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [staffId, refresh]);

  /** Run an API action, refresh the data, and report the outcome. */
  const run = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      try {
        await action();
        await refresh();
        notify(success);
        return true;
      } catch (e) {
        notify(errorText(e), "error");
        return false;
      }
    },
    [refresh, notify],
  );

  const setOrderStatus = useCallback(
    (code: string, status: OrderStatus, note?: string) =>
      run(() => api(`/pharmacy/orders/${code}/status`, { method: "POST", body: { status: status.toUpperCase(), ...(note ? { note } : {}) } }), `${code} · ${status.replace("_", " ")}`),
    [run],
  );

  const bookRider = useCallback(
    (code: string) => run(() => api(`/pharmacy/orders/${code}/delivery`, { method: "POST" }), `${code} · new rider requested`),
    [run],
  );

  const handover = useCallback(
    (code: string, sealCode: string) => run(() => api(`/pharmacy/orders/${code}/handover`, { method: "POST", body: { sealCode } }), `${code} handed over — customer notified`),
    [run],
  );
  const reportIncident = useCallback(
    (code: string, type: IncidentType, description: string) =>
      run(() => api(`/pharmacy/orders/${code}/incidents`, { method: "POST", body: { type, description } }), `Incident reported on ${code}`),
    [run],
  );

  const reviewRx = useCallback(
    (code: string, status: RxStatus, note?: string) => {
      const body =
        status === "approved"
          ? { decision: "APPROVE", checks: { prescriberAndDateVerified: true, doseAndQuantityAppropriate: true, noInteractionOrAllergyConcerns: true } }
          : { decision: status === "rejected" ? "REJECT" : "CLARIFY", note };
      const msg = status === "approved" ? `${code} approved — order released to the pharmacy` : status === "rejected" ? `${code} rejected — patient notified` : `Clarification request sent for ${code}`;
      return run(() => api(`/pharmacy/prescriptions/${code}/review`, { method: "POST", body }), msg);
    },
    [run],
  );

  const adjustBatch = useCallback(
    (id: string, delta: number, reason: string) => run(() => api(`/pharmacy/inventory/batches/${id}/adjust`, { method: "POST", body: { delta, reason } }), `Stock ${delta > 0 ? "+" : ""}${delta} (${reason.toLowerCase()})`),
    [run],
  );
  const quarantineBatch = useCallback(
    (id: string, reason: string) => run(() => api(`/pharmacy/inventory/batches/${id}/quarantine`, { method: "POST", body: { reason } }), "Batch quarantined"),
    [run],
  );
  const releaseBatch = useCallback(
    (id: string, note?: string) => run(() => api(`/pharmacy/inventory/batches/${id}/release`, { method: "POST", body: { qualityAssessmentConfirmed: true, ...(note ? { note } : {}) } }), "Batch released to saleable stock"),
    [run],
  );
  const receiveBatch = useCallback(
    (dto: { productId: string; batchNumber: string; expiresAt: string; quantity: number; priceKobo: number; location?: string }) =>
      run(() => api("/pharmacy/inventory/batches", { method: "POST", body: dto }), `Batch ${dto.batchNumber} added to inventory`),
    [run],
  );

  const createTransfer = useCallback(
    (batchId: string, quantity: number, toPharmacyId?: string) =>
      run(() => api("/pharmacy/transfers", { method: "POST", body: { batchId, quantity, ...(toPharmacyId ? { toPharmacyId } : {}) } }), "Draft transfer created — a pharmacist publishes it under Transfers"),
    [run],
  );

  const transferAction = useCallback(
    (code: string, action: TransferAction, body?: Record<string, unknown>) => {
      const done: Record<TransferAction, string> = {
        publish: `${code} published`,
        accept: `${code} accepted — the stock is reserved for you`,
        dispatch: `${code} marked as sent`,
        decline: `${code} declined`,
        cancel: `${code} cancelled`,
        receive: `${code} checked in to inventory`,
      };
      return run(() => api(`/pharmacy/transfers/${code}/${action}`, { method: "POST", ...(body ? { body } : {}) }), done[action]);
    },
    [run],
  );

  const markAllRead = useCallback(async () => {
    try {
      await api("/pharmacy/notifications/read", { method: "POST" });
      setNotifications((ns) => ns.map((n) => ({ ...n, unread: false })));
    } catch (e) {
      notify(errorText(e), "error");
    }
  }, [notify]);

  const unread = notifications.some((n) => n.unread);

  const value = useMemo(
    () => ({
      orders, prescriptions, stock, transfers, notifications, loading, loadError, unread, toasts,
      refresh, setOrderStatus, bookRider, handover, reportIncident, reviewRx, adjustBatch, quarantineBatch, releaseBatch, receiveBatch,
      createTransfer, transferAction, markAllRead, notify,
    }),
    [orders, prescriptions, stock, transfers, notifications, loading, loadError, unread, toasts, refresh, setOrderStatus, bookRider, handover, reportIncident, reviewRx, adjustBatch, quarantineBatch, releaseBatch, receiveBatch, createTransfer, transferAction, markAllRead, notify],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
