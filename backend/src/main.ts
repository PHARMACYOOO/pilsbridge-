import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './setup.js';

async function bootstrap() {
  // rawBody: courier webhooks are verified against the exact bytes they signed.
  const app = configureApp(await NestFactory.create(AppModule, { rawBody: true }));
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API on http://localhost:${port}/v1 · docs at http://localhost:${port}/docs`, 'Bootstrap');
}
await bootstrap();
