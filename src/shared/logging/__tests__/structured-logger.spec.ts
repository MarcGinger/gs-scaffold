import { Log, BaseCtx } from '../../structured-logger';
import pino from 'pino';

describe('Log helpers', () => {
  const logger = pino({
    level: 'info',
    base: { app: 'test', environment: 'test', version: '0.0.1' },
    transport: { target: 'pino-pretty' },
  });

  it('should include required fields in info log', () => {
    const ctx: BaseCtx = {
      service: 'test-service',
      component: 'test-component',
      method: 'test-method',
    };
    const spy = jest.spyOn(logger, 'info');
    Log.info(logger, 'Test message', ctx);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'test-service',
        component: 'test-component',
        method: 'test-method',
        msg: 'Test message',
      }),
    );
    spy.mockRestore();
  });

  it('should include error object in error log', () => {
    const ctx: BaseCtx = {
      service: 'test-service',
      component: 'test-component',
      method: 'test-method',
    };
    const error = new Error('fail');
    const spy = jest.spyOn(logger, 'error');
    Log.error(logger, error, 'Error occurred', ctx);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'test-service',
        component: 'test-component',
        method: 'test-method',
        err: error,
      }),
      'Error occurred',
    );
    spy.mockRestore();
  });
});
