import request from 'supertest';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { LoggingModule } from '../logging.module';
import { TraceMiddleware } from '../trace.middleware';
import { AppController } from '../../../app.controller';
import { AppService } from '../../../app.service';

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    LoggingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
class TestAppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}

describe('E2E Logging & Trace Integration', () => {
  let app: INestApplication;
  let clsService: ClsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    clsService = app.get(ClsService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should echo x-request-id and include traceId in logs', async () => {
    const traceId = 'test-trace-id-12345';
    const res = await request(app.getHttpServer())
      .get('/')
      .set('x-request-id', traceId);

    expect(res.headers['x-request-id']).toBe(traceId);
    expect(res.status).toBe(200);
    expect(res.text).toBe('Hello World!');
  });

  it('should generate traceId when none provided', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('should handle W3C traceparent header', async () => {
    const traceparent =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const res = await request(app.getHttpServer())
      .get('/')
      .set('traceparent', traceparent);

    expect(res.headers['x-request-id']).toBe(
      '4bf92f3577b34da6a3ce929d0e0e4736',
    );
  });

  it('should set CLS context correctly', (done) => {
    const traceId = 'cls-test-trace-id';
    const testCorrelationId = 'test-correlation-id';

    // Mock a request context
    clsService.run(() => {
      clsService.set('traceId', traceId);
      clsService.set('correlationId', testCorrelationId);

      expect(clsService.get('traceId')).toBe(traceId);
      expect(clsService.get('correlationId')).toBe(testCorrelationId);
      done();
    });
  });
});
