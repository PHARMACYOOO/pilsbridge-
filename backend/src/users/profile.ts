import type { Pharmacy, SocialIdentity, User } from '../generated/prisma/client.js';

/** The fields a client may see about a user. Staff also get a summary of their pharmacy. */
export function profileOf(u: User & { pharmacy?: Pharmacy | null; socialIdentities?: SocialIdentity[] }) {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    pharmacyId: u.pharmacyId,
    profileComplete: Boolean(u.firstName && u.lastName && u.consentAt),
    linkedAccounts: (u.socialIdentities ?? []).map((s) => s.provider),
    pharmacy: u.pharmacy
      ? { id: u.pharmacy.id, name: u.pharmacy.name, area: u.pharmacy.area, status: u.pharmacy.status, licenceExpiresAt: u.pharmacy.licenceExpiresAt }
      : null,
  };
}
