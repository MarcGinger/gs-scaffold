// BullMQ integration: propagate traceId/correlationId in job metadata
import { Queue, Worker, Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';

// Producer example
export function addJobWithTrace(
  queue: Queue,
  cls: ClsService,
  data: any,
  domainId: string,
) {
  return queue.add(
    'send',
    {
      ...data,
      traceId: cls.get('traceId'),
      correlationId: cls.get('correlationId'),
    },
    {
      jobId: domainId,
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}

// Worker example
export function setTraceContextOnJobStart(worker: Worker, cls: ClsService) {
  worker.on('active', (job: Job) => {
    cls.set('traceId', job.data?.traceId || job.id);
    cls.set('correlationId', job.data?.correlationId);
  });
}

// ESDB integration: append events with full metadata
export function appendEventWithMetadata(
  appendToStream: Function,
  cls: ClsService,
  streamId: string,
  eventType: string,
  data: any,
) {
  return appendToStream(streamId, {
    type: eventType,
    data,
    metadata: {
      traceId: cls.get('traceId'),
      correlationId: cls.get('correlationId'),
      user: { id: cls.get('userId'), tenantId: cls.get('tenantId') },
      source: process.env.APP_NAME,
    },
  });
}

// ESDB consumer: set CLS from event metadata
export function setClsFromEventMetadata(cls: ClsService, resolvedEvent: any) {
  const meta = resolvedEvent?.event?.metadata as any;
  cls.set('traceId', meta?.traceId);
  cls.set('correlationId', meta?.correlationId);
  cls.set('tenantId', meta?.user?.tenantId);
  cls.set('userId', meta?.user?.id);
}
