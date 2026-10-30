import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { isLocalEnv } from './common/env.js';

/** Shared by main.ts and the e2e tests so both run the same pipeline. */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  // Behind a load balancer / reverse proxy, read the real client IP (needed for per-IP rate limits).
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    const express = app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void };
    express.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true' ? true : trustProxy);
  }
  app.use(helmet());
  app.enableCors({ origin: (config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000').split(','), credentials: false });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();

  // API docs: on your own machine, or where DOCS_ENABLED=true (e.g. staging).
  if (isLocalEnv(config.get('NODE_ENV')) || config.get('DOCS_ENABLED') === 'true') {
    const doc = new DocumentBuilder()
      .setTitle('Pilbridge API')
      .setDescription('Pharmaceutical redistribution & delivery platform — MVP')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, doc));
  }
  return app;
}
