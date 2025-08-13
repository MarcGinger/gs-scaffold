import { Queue, Worker, Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import {
  addJobWithTrace,
  setTraceContextOnJobStart,
} from '../logging-integrations';

describe('BullMQ trace propagation', () => {
  it('should propagate traceId from producer to worker', async (done) => {
    const queue = new Queue('test-queue', {
      connection: { host: 'localhost', port: 6379 },
    });
    const cls = new ClsService();
    const traceId = 'smoke-trace-id';
    cls.set('traceId', traceId);
    await addJobWithTrace(queue, cls, { foo: 'bar' }, 'domain-id');

    const worker = new Worker(
      'test-queue',
      async (job: Job) => {
        setTraceContextOnJobStart(worker, cls);
        expect(cls.get('traceId')).toBe(traceId);
        done();
      },
      { connection: { host: 'localhost', port: 6379 } },
    );
  });
});
