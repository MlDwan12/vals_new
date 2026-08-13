import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { EnvConfig } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const configService = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.use(compression());

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
