/**
 * @file apps/api/src/main.ts
 * @shared NestJS bootstrap
 * @dependencies @nestjs/core, ValidationPipe
 */

import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { assertDatabaseEnvironment } from './shared/config/database-environment';
import { assertEnvironment } from './shared/config/environment';
import { accessLogMiddleware } from './shared/http/access-log';
import { startMetricsSummary } from './shared/http/http-metrics';
import { ApiExceptionFilter } from './shared/filters/api-exception.filter';
import { trustProxySetting } from './shared/http/client-ip';
import { requestIdMiddleware } from './shared/http/request-id';
import { securityHeadersMiddleware } from './shared/http/security-headers.middleware';
import { urlLengthMiddleware } from './shared/http/url-length.middleware';
import { dropRawBodyOutsideWebhooks, webhookSizeGuard } from './shared/http/webhook-raw-body';
import { IdParamPipe } from './shared/validation/id-param.pipe';
import { apiValidationPipeOptions } from './shared/validation/validation-exception.factory';

/** JSON bodies larger than this are refused (413). The biggest real request is a few kilobytes. */
const JSON_BODY_LIMIT = '100kb';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // Unsafe production settings stop the boot here, with every problem listed. Development just warns.
  for (const warning of [...assertEnvironment(process.env), ...assertDatabaseEnvironment(process.env)]) {
    logger.warn(warning);
  }

  // The body parser is configured by hand below so the size limit is explicit. `rawBody: true` makes the parser keep
  // the exact bytes (a webhook signature covers bytes, not parsed JSON); dropRawBodyOutsideWebhooks removes them again
  // from every route except POST /payments/webhooks/*, and webhookSizeGuard refuses an oversized webhook unread.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, rawBody: true });
  app.disable('x-powered-by');
  // First, so every response is logged and counted, including the ones the body parser or the size guards refuse (413):
  // the request id, then one structured line per request (docs/13 R2-24; no query strings, bodies, IPs or emails).
  app.use(requestIdMiddleware);
  const accessLogger = new Logger('Http');
  app.use(
    accessLogMiddleware({
      log: (line: string): void => accessLogger.log(line),
      warn: (line: string): void => accessLogger.warn(line),
      error: (line: string): void => accessLogger.error(line),
    }),
  );
  startMetricsSummary((line: string): void => accessLogger.log(line));
  app.use(webhookSizeGuard);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: false });
  app.use(dropRawBodyOutsideWebhooks);

  // TRUST_PROXY=<hops> only when a reverse proxy sits in front: otherwise X-Forwarded-For is client-controlled.
  app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));
  app.use(securityHeadersMiddleware);
  app.use(urlLengthMiddleware);

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((origin: string): string => origin.trim());

  app.enableCors({ origin: origins, exposedHeaders: ['x-request-id', 'retry-after'] });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new IdParamPipe(),
    new ValidationPipe(apiValidationPipeOptions()),
  );

  const port = Number.parseInt(process.env.PORT ?? '3002', 10);
  await app.listen(port);
}

void bootstrap();
