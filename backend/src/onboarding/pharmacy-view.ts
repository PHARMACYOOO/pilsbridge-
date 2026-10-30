import type { Prisma } from '../generated/prisma/client.js';

/** What platform admins see about a pharmacy: identity, licence, status, location and settlement account. */
export const pharmacyAdminSelect = {
  id: true, slug: true, name: true, area: true, address: true, status: true, coldChain: true, lat: true, lng: true, phone: true, email: true,
  premisesLicenceNo: true, licenceExpiresAt: true, superintendentName: true, verifiedAt: true, suspendedAt: true, suspendedReason: true,
  bankName: true, bankAccountName: true, bankAccountNumber: true, bankUpdatedAt: true, bankVerifiedAt: true, createdAt: true,
  _count: { select: { staff: true } },
} satisfies Prisma.PharmacySelect;
