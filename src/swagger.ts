import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Orzu Medical API')
    .setDescription(
      'API documentation for the operator cabinet and integrations.',
    )
    .setVersion('2.1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token returned by /api/auth/login.',
      },
      'jwt',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-api-key',
        in: 'header',
        description:
          'Integration API key from INTEGRATION_API_KEYS or EXTERNAL_API_KEY.',
      },
      'x-api-key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Orzu Medical API Docs',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
