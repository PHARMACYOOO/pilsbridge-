import type { ConfigService } from '@nestjs/config';

/** The website's public address, for links in text messages. Defaults to the first CORS origin. */
export function appUrl(config: ConfigService) {
  const url = config.get<string>('APP_URL') || (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000').split(',')[0];
  return url.replace(/\/$/, '');
}
