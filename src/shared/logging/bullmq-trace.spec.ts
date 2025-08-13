import { Test } from '@nestjs/testing';
import { ClsModule, ClsService } from 'nestjs-cls';
import { Queue, Worker } from 'bullmq';
import {
  addJobWithTrace,
  setTraceContextOnJobStart,
} from './logging-integrations';

describe('BullMQ Trace Propagation', () => {
  let clsService: ClsService;
  let queue: Queue;
  let worker: Worker;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ClsModule.forRoot({
          global: true,
        }),
      ],
    }).compile();

    clsService = module.get(ClsService);

    // Mock Redis connection for testing
    const connection = {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    };

    queue = new Queue('test-queue', { connection });
    worker = new Worker(
      'test-queue',
      async (job) => {
        // Job processor - in real implementation would contain business logic
        return { processed: true, traceId: job.data?.traceId };
      },
      { connection },
    );
  });

  afterEach(async () => {
    await queue.close();
    await worker.close();
  });

  it('should propagate traceId through job metadata', (done) => {
    const testTraceId = 'bull-test-trace-12345';
    const testCorrelationId = 'bull-correlation-12345';

    clsService.run(async () => {
      clsService.set('traceId', testTraceId);
      clsService.set('correlationId', testCorrelationId);

      // Set up worker to verify trace context
      setTraceContextOnJobStart(worker, clsService);

      // Add job with trace context
      const job = await addJobWithTrace(
        queue,
        clsService,
        { message: 'Test job data' },
        'test-job-id',
      );

      expect(job.data.traceId).toBe(testTraceId);
      expect(job.data.correlationId).toBe(testCorrelationId);

      done();
    });
  });

  it('should set CLS context when job starts processing', (done) => {
    const testTraceId = 'worker-trace-12345';

    // Mock job data with trace information
    const mockJob = {
      id: 'mock-job-id',
      data: {
        traceId: testTraceId,
        correlationId: 'worker-correlation-id',
        message: 'Test message',
      },
    };

    clsService.run(() => {
      setTraceContextOnJobStart(worker, clsService);

      // Simulate job activation
      worker.emit('active', mockJob);

      // Verify CLS context is set
      expect(clsService.get('traceId')).toBe(testTraceId);
      expect(clsService.get('correlationId')).toBe('worker-correlation-id');

      done();
    });
  });

  it('should handle missing trace context gracefully', (done) => {
    // Mock job without trace information
    const mockJob = {
      id: 'fallback-job-id',
      data: {
        message: 'Test message without trace',
      },
    };

    clsService.run(() => {
      setTraceContextOnJobStart(worker, clsService);

      // Simulate job activation
      worker.emit('active', mockJob);

      // Should fall back to job ID as trace
      expect(clsService.get('traceId')).toBe('fallback-job-id');

      done();
    });
  });
});
