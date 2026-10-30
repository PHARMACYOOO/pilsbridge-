/**
 * Delivery-time estimate: packing + rider reaching the pharmacy + the ride itself. The numbers are
 * starting assumptions for Lagos motorbike couriers — tune them from real delivery times
 * (Delivery.assignedAt / pickedUpAt / deliveredAt) once there's data.
 */
export const ETA = {
  packingMinutes: 15,
  riderToPharmacyMinutes: 10,
  averageKmh: 18,
  roadFactor: 1.35, // roads are longer than a straight line
  roundToMinutes: 5,
};

/** Riders see jobs whose pickup is within this distance of where they are. */
export const RIDER_RADIUS_KM = 10;
/** A rider can carry this many jobs at once (batching nearby drops). */
export const MAX_ACTIVE_JOBS = 3;

type Point = { lat: number; lng: number };

/** Straight-line distance in km. */
export function distanceKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Minutes from payment to the door, or null when the pharmacy's location isn't known. */
export function etaMinutes(pharmacy: { lat: number | null; lng: number | null }, dropoff: Point): number | null {
  if (pharmacy.lat == null || pharmacy.lng == null) return null;
  const rideKm = distanceKm({ lat: pharmacy.lat, lng: pharmacy.lng }, dropoff) * ETA.roadFactor;
  const total = ETA.packingMinutes + ETA.riderToPharmacyMinutes + (rideKm / ETA.averageKmh) * 60;
  return Math.ceil(total / ETA.roundToMinutes) * ETA.roundToMinutes;
}

/** When a paid order should arrive. */
export const arriveBy = (o: { paidAt: Date | null; etaMinutes: number | null }) =>
  o.paidAt && o.etaMinutes ? new Date(o.paidAt.getTime() + o.etaMinutes * 60_000) : null;
