import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import { json, urlencoded } from 'express';
import { runSeed } from './seed';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');
  const port = process.env.PORT || 3000;

  app.setGlobalPrefix('api');

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors({
    origin: "*",
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const uploadsPath = path.join(__dirname, '..', 'uploads');
  app.useStaticAssets(uploadsPath, {
    prefix: '/uploads/',
  });

  try {
    await runSeed(app);
  } catch (e) {
    logger.error('Seed error:', e);
  }

  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}/api`);
  logger.log(`📂 Serving static files from: ${uploadsPath}`);
}
bootstrap();
