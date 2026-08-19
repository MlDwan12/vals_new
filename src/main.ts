import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  // За nginx: без этого req.ip у ThrottlerGuard/аудита = IP nginx, а не клиента (весь rate
  // limit/аудит превращается в один общий бакет). nginx обязан переписывать X-Forwarded-For,
  // не дописывать к клиентскому.
  app.set('trust proxy', 1);

  // cross-origin — иначе Cross-Origin-Resource-Policy: same-origin (дефолт helmet) блокирует
  // загрузку /uploads с другого origin (фронт на отдельном домене).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.use(compression());
  // TipTap JSON контент статей/кейсов легко превышает дефолтный лимит body-parser'а (100kb).
  // Регистрируется до app.listen() — значит до того, как Nest сам навесит дефолтные парсеры
  // (NestApplication.init() -> registerParserMiddleware(), вызывается только из listen()), эти
  // парсеры первыми встают в стек и реально ограничивают лимит; дефолтные, добавленные позже,
  // видят body-parser'овский onFinished(req) === true и молча пропускают повторный парсинг.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.enableCors({
    origin: configService
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });

  if (configService.get('ENABLE_SWAGGER', { infer: true })) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('VALS.DIGITAL API')
        .setVersion('0.1.0')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(configService.get('APP_PORT', { infer: true }));
}

bootstrap().catch((error: unknown) => {
  console.error('Не удалось запустить приложение', error);
  process.exit(1);
});
