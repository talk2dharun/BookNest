import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ValidationError } from 'class-validator';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): { field: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const current = error.constraints
      ? Object.values(error.constraints).map((message) => ({ field, message }))
      : [];
    const children = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];
    return [...current, ...children];
  });
}

export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const frontendOrigin = config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:3000';

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const details = flattenValidationErrors(errors);
        return new BadRequestException({
          message: details[0]?.message ?? 'Validation failed',
          details,
        });
      },
    }),
  );
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('BookNest API')
    .setDescription('Reading tracker API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
