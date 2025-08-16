jest.mock('../esdb-event-stream', () => {
  return {
    EsdbEventStream: jest.fn().mockImplementation((streamName, logger) => {
      return { streamName, logger };
    }),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { EventStreamModule } from '../event-store.module';
import { ILogger } from 'src/common/logger.interface';

const TEST_TOKEN = 'TEST_EVENTS_STREAM';
const TEST_SERVICE_NAME = 'test-stream';

describe('EventStreamModule', () => {
  let module: TestingModule;
  let logger: ILogger;

  beforeEach(async () => {
    logger = {
      error: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };
    module = await Test.createTestingModule({
      imports: [
        EventStreamModule.register({
          token: TEST_TOKEN,
          serviceName: TEST_SERVICE_NAME,
        }),
      ],
    })
      .overrideProvider('ILogger')
      .useValue(logger)
      .compile();
  });

  it('should provide the EsdbEventStream with correct serviceName and logger', () => {
    const stream = module.get<{ streamName: string; logger: ILogger }>(
      TEST_TOKEN,
    );
    expect(stream.streamName).toBe(TEST_SERVICE_NAME);
    expect(stream.logger).toBe(logger);
  });

  it('should export the provider', () => {
    const exported = module.get(TEST_TOKEN);
    expect(exported).toBeDefined();
  });
});
