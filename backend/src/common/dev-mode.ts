import type { ConfigService } from '@nestjs/config';
import { isLocalEnv } from './env.js';

/**
 * Local development conveniences (OTP codes in responses, demo sign-in and demo payments). Needs
 * both OTP_DEV_ECHO=true and NODE_ENV=development (or test); validateEnv refuses to start otherwise.
 */
export const isDevMode = (config: ConfigService) => config.get('OTP_DEV_ECHO') === 'true' && isLocalEnv(config.get('NODE_ENV'));
