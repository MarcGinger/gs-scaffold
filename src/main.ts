import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, {
      bufferLogs: true,
    });
    app.useLogger(app.get(Logger));
    await app.listen(process.env.PORT ?? 3020);
  } catch (err) {
    // Use pino directly for startup errors
    // If LoggingModule is not available, fallback to console
    try {
      const pinoLogger = require('pino')();
      pinoLogger.error({ err }, 'Application failed to start 123');
    } catch {
      // Fallback
      // eslint-disable-next-line no-console
      console.error('Application failed to start', err);
    }
    process.exit(1);
  }
}
void bootstrap();
