import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { SocialProvider } from '../generated/prisma/client.js';

export type VerifiedIdentity = {
  provider: SocialProvider;
  subject: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
};

type ProviderConfig = { keys: JWTVerifyGetKey; issuers: string[]; audience?: string };

/**
 * Verifies ID tokens issued by Google and Apple against their published signing keys,
 * checking issuer, audience (our client ID) and expiry. Nothing about the token is trusted
 * until this passes.
 */
@Injectable()
export class SocialVerifier {
  private readonly providers: Record<SocialProvider, ProviderConfig>;

  constructor(
    config: ConfigService,
    /** Tests inject local keys; production fetches (and caches) the providers' JWKS. */
    keys?: Partial<Record<SocialProvider, JWTVerifyGetKey>>,
  ) {
    this.providers = {
      [SocialProvider.GOOGLE]: {
        keys: keys?.GOOGLE ?? createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
        issuers: ['https://accounts.google.com', 'accounts.google.com'],
        audience: config.get<string>('GOOGLE_CLIENT_ID') || undefined,
      },
      [SocialProvider.APPLE]: {
        keys: keys?.APPLE ?? createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
        issuers: ['https://appleid.apple.com'],
        audience: config.get<string>('APPLE_CLIENT_ID') || undefined,
      },
    };
  }

  async verify(provider: SocialProvider, idToken: string): Promise<VerifiedIdentity> {
    const p = this.providers[provider];
    const label = provider === SocialProvider.GOOGLE ? 'Google' : 'Apple';
    // Without our client ID we can't check the audience, so the token can't be trusted.
    if (!p.audience) throw new ServiceUnavailableException(`${label} sign-in isn’t configured on the server`);

    let claims: Record<string, unknown>;
    try {
      ({ payload: claims } = await jwtVerify(idToken, p.keys, { issuer: p.issuers, audience: p.audience, algorithms: ['RS256', 'ES256'] }));
    } catch {
      throw new UnauthorizedException(`We couldn’t verify your ${label} sign-in — please try again`);
    }
    if (typeof claims.sub !== 'string' || !claims.sub) throw new UnauthorizedException(`Invalid ${label} account`);

    // Only use the email if the provider says it's verified (Apple sends it as a string).
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    const email = verified && typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
    const given = typeof claims.given_name === 'string' ? claims.given_name : null;
    const family = typeof claims.family_name === 'string' ? claims.family_name : null;
    const [first = null, ...rest] = typeof claims.name === 'string' ? claims.name.trim().split(/\s+/) : [];
    return {
      provider,
      subject: claims.sub,
      email,
      firstName: given ?? first,
      lastName: family ?? (rest.length ? rest.join(' ') : null),
    };
  }
}
