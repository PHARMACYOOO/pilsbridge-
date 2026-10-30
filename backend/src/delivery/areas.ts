/**
 * Lagos delivery areas with approximate centre points. Customers pick one at checkout; it decides
 * which pharmacies are nearest, the promised delivery time, and which riders see the job.
 */
export type Area = { key: string; name: string; lat: number; lng: number };

export const AREAS: Area[] = [
  { key: 'ikeja', name: 'Ikeja (GRA, Allen, Opebi, Alausa)', lat: 6.6018, lng: 3.3515 },
  { key: 'ogba', name: 'Ogba / Agidingbi', lat: 6.6253, lng: 3.341 },
  { key: 'agege', name: 'Agege', lat: 6.618, lng: 3.3209 },
  { key: 'egbeda', name: 'Egbeda / Idimu', lat: 6.593, lng: 3.29 },
  { key: 'ikotun', name: 'Ikotun', lat: 6.553, lng: 3.265 },
  { key: 'magodo', name: 'Magodo', lat: 6.615, lng: 3.383 },
  { key: 'ojota', name: 'Ojota / Ketu', lat: 6.585, lng: 3.383 },
  { key: 'maryland', name: 'Maryland / Mende', lat: 6.571, lng: 3.367 },
  { key: 'gbagada', name: 'Gbagada', lat: 6.554, lng: 3.387 },
  { key: 'oshodi', name: 'Oshodi / Isolo', lat: 6.544, lng: 3.329 },
  { key: 'surulere', name: 'Surulere', lat: 6.499, lng: 3.354 },
  { key: 'yaba', name: 'Yaba / Ebute-Metta', lat: 6.5095, lng: 3.3711 },
  { key: 'festac', name: 'Festac / Amuwo-Odofin', lat: 6.466, lng: 3.283 },
  { key: 'apapa', name: 'Apapa', lat: 6.4489, lng: 3.359 },
  { key: 'lagos-island', name: 'Lagos Island / Obalende', lat: 6.455, lng: 3.394 },
  { key: 'ikoyi', name: 'Ikoyi', lat: 6.452, lng: 3.435 },
  { key: 'victoria-island', name: 'Victoria Island', lat: 6.428, lng: 3.421 },
  { key: 'lekki-phase-1', name: 'Lekki Phase 1', lat: 6.447, lng: 3.473 },
  { key: 'ajah', name: 'Ajah / Sangotedo', lat: 6.468, lng: 3.567 },
  { key: 'ikorodu', name: 'Ikorodu', lat: 6.619, lng: 3.51 },
];

export const AREA_KEYS = AREAS.map((a) => a.key);
export const areaByKey = (key: string | null | undefined) => AREAS.find((a) => a.key === key) ?? null;
