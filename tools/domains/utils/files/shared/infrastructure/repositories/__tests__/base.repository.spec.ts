import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ILogger } from 'src/shared/logger';
import { ConfigService } from '@nestjs/config';
import { AggregateRoot } from '@nestjs/cqrs';
import { BaseCommandRepository } from '../infrastructure.repository';

describe('BaseCommandRepository', () => {
  class TestAggregate extends AggregateRoot {}
  const exceptionMessages = {
    notFound: { message: 'Not found', errorCode: '404' },
    createError: { message: 'Create error', errorCode: 'CERR' },
    updateError: { message: 'Update error', errorCode: 'UERR' },
    deleteError: { message: 'Delete error', errorCode: 'DERR' },
  };
  let logger: jest.Mocked<ILogger>;
  let configService: jest.Mocked<ConfigService>;
  let repo: BaseCommandRepository<TestAggregate, typeof exceptionMessages>;

  beforeEach(() => {
    logger = {
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    } as unknown as jest.Mocked<ILogger>;
    configService = {
      get: jest.fn().mockReturnValue('debug'),
    } as unknown as jest.Mocked<ConfigService>;
    class TestRepo extends BaseCommandRepository<
      TestAggregate,
      typeof exceptionMessages
    > {
      getCreateEvent = jest.fn();
      getUpdateEvent = jest.fn();
      getDeleteEvent = jest.fn();
    }
    repo = new TestRepo(
      configService,
      logger,
      exceptionMessages,
      TestAggregate,
    );
  });

  it('sets debug to false if LOGGER_LEVEL does not include debug', () => {
    configService.get = jest.fn().mockReturnValue('info');
    class TestRepo extends BaseCommandRepository<
      TestAggregate,
      typeof exceptionMessages
    > {
      getCreateEvent = jest.fn();
      getUpdateEvent = jest.fn();
      getDeleteEvent = jest.fn();
    }
    const testRepo = new TestRepo(
      configService,
      logger,
      exceptionMessages,
      TestAggregate,
    );
    expect((testRepo as unknown as { debug: boolean }).debug).toBe(false);
  });

  it('sets debug to false if LOGGER_LEVEL is undefined', () => {
    configService.get = jest.fn().mockReturnValue(undefined);
    class TestRepo extends BaseCommandRepository<
      TestAggregate,
      typeof exceptionMessages
    > {
      getCreateEvent = jest.fn();
      getUpdateEvent = jest.fn();
      getDeleteEvent = jest.fn();
    }
    const testRepo = new TestRepo(
      configService,
      logger,
      exceptionMessages,
      TestAggregate,
    );
    expect((testRepo as unknown as { debug: boolean }).debug).toBe(false);
  });

  describe('sanitizeForLog', () => {
    it('returns null/undefined as is', () => {
      expect(repo['sanitizeForLog'](null)).toBeNull();
      expect(repo['sanitizeForLog'](undefined)).toBeUndefined();
    });
    it('returns deep copy for objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const result = repo['sanitizeForLog'](obj);
      expect(result).toEqual(obj);
      expect(result).not.toBe(obj);
    });
    it('logs and returns fallback on error', () => {
      const circular: Record<string, unknown> = {};
      circular['self'] = circular;
      const out = repo['sanitizeForLog'](circular);
      expect(logger.warn.mock.calls.length).toBeGreaterThan(0);
      const callArg = logger.warn.mock.calls[0][0] as unknown;
      if (
        typeof callArg === 'object' &&
        callArg !== null &&
        'message' in callArg
      ) {
        expect((callArg as { message: string }).message).toEqual(
          expect.stringContaining('Failed to sanitize object'),
        );
      }
      expect(out).toEqual({ sanitizationFailed: true });
    });
    it('logs correct message if thrown error is not an Error instance', () => {
      // Intentionally override JSON.stringify to throw a string for branch coverage
      const originalStringify = JSON.stringify;
      JSON.stringify = () => {
        // linter: throwing a string is intentional for this test
        throw 'not an error object';
      };
      try {
        const out = repo['sanitizeForLog']({ foo: 'bar' });
        expect(logger.warn.mock.calls.length).toBeGreaterThan(0);
        const callArg = logger.warn.mock.calls[
          logger.warn.mock.calls.length - 1
        ][0] as unknown;
        if (
          typeof callArg === 'object' &&
          callArg !== null &&
          'message' in callArg
        ) {
          expect((callArg as { message: string }).message).toContain(
            'Failed to sanitize object for logging: not an error object',
          );
        }
        expect(out).toEqual({ sanitizationFailed: true });
      } finally {
        JSON.stringify = originalStringify;
      }
    });
  });

  const mockUser = {
    sub: 'sub',
    name: 'Test',
    email: 'test@example.com',
    tenant: 't1',
  };
  const mockPayload = { foo: 'bar' };

  describe('handleError', () => {
    it('logs and throws BadRequestException (debug=false)', () => {
      (repo as unknown as { debug: boolean }).debug = false;
      expect(() =>
        repo['handleError'](
          new Error('fail'),
          mockUser,
          mockPayload,
          exceptionMessages.createError,
          123,
        ),
      ).toThrow(BadRequestException);
      expect(logger.error.mock.calls.length).toBeGreaterThan(0);
      const callArg = logger.error.mock.calls[0][0] as unknown;
      if (
        typeof callArg === 'object' &&
        callArg !== null &&
        'message' in callArg
      ) {
        expect((callArg as { message: string }).message).toEqual(
          expect.stringContaining('Operation failed after 123ms'),
        );
      }
    });
    it('throws with error details in debug mode', () => {
      (repo as unknown as { debug: boolean }).debug = true;
      try {
        repo['handleError'](
          new Error('fail'),
          mockUser,
          mockPayload,
          exceptionMessages.createError,
          123,
        );
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException);
        expect((e as BadRequestException).getResponse()).toEqual(
          expect.objectContaining({
            message: exceptionMessages.createError,
            errorDetails: 'fail',
          }),
        );
      }
    });
  });

  describe('validateEntityExists', () => {
    it('throws NotFoundException if entity is null/undefined', () => {
      expect(() =>
        repo['validateEntityExists'](null, exceptionMessages.notFound),
      ).toThrow(NotFoundException);
      expect(() =>
        repo['validateEntityExists'](undefined, exceptionMessages.notFound),
      ).toThrow(NotFoundException);
    });
    it('does not throw if entity exists', () => {
      expect(() =>
        repo['validateEntityExists']({}, exceptionMessages.notFound),
      ).not.toThrow();
    });
  });

  describe('formatMissingCodesMessage', () => {
    it('formats missing codes', () => {
      expect(repo['formatMissingCodesMessage']('Foo', ['a', 'b'])).toBe(
        'Foo codes not found: a, b',
      );
    });
  });

  describe('findMissingIdentifiers', () => {
    it('finds missing by property', () => {
      const found = [{ code: 'a' }, { code: 'b' }];
      expect(
        repo['findMissingIdentifiers'](['a', 'b', 'c'], found, 'code'),
      ).toEqual(['c']);
    });
    it('works with other property', () => {
      const found = [{ id: '1' }, { id: '2' }];
      expect(
        repo['findMissingIdentifiers'](['1', '2', '3'], found, 'id'),
      ).toEqual(['3']);
    });
  });

  describe('validateEntityIdentifiersFound', () => {
    it('throws if found.length !== expected.length', () => {
      const found = [{ code: 'a' }];
      expect(() =>
        repo['validateEntityIdentifiersFound'](
          found,
          ['a', 'b'],
          'Foo',
          { ctx: 1 },
          // omit identifierProperty to use default 'code'
        ),
      ).toThrow(BadRequestException);
      expect(logger.warn.mock.calls.length).toBeGreaterThan(0);
      const callArg = logger.warn.mock.calls[0][0] as unknown;
      if (
        typeof callArg === 'object' &&
        callArg !== null &&
        'message' in callArg
      ) {
        expect((callArg as { message: string }).message).toEqual(
          expect.stringContaining('Some Foo codes not found: b'),
        );
      }
    });
    it('does not throw if all found', () => {
      const found = [{ code: 'a' }, { code: 'b' }];
      expect(() =>
        repo['validateEntityIdentifiersFound'](
          found,
          ['a', 'b'],
          'Foo',
          { ctx: 1 },
          // omit identifierProperty to use default 'code'
        ),
      ).not.toThrow();
    });
  });

  describe('validateEntityIdentifiersFound (default parameter branch)', () => {
    it('uses default identifierProperty when omitted', () => {
      const found = [{ code: 'a' }];
      expect(() =>
        repo['validateEntityIdentifiersFound'](
          found,
          ['a', 'b'],
          'Foo',
          { ctx: 1 },
          // identifierProperty omitted, should default to 'code'
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('extractErrorMessage', () => {
    it('extracts from response.message/errorCode', () => {
      const err = { response: { message: 'msg', errorCode: 'E' } };
      expect(
        repo['extractErrorMessage'](err, exceptionMessages.createError),
      ).toEqual({ message: 'msg', errorCode: 'E' });
    });
    it('extracts from message/errorCode', () => {
      const err = { message: 'msg', errorCode: 'E' };
      expect(
        repo['extractErrorMessage'](err, exceptionMessages.createError),
      ).toEqual({ message: 'msg', errorCode: 'E' });
    });
    it('extracts from message only', () => {
      const err = { message: 'msg' };
      expect(
        repo['extractErrorMessage'](err, exceptionMessages.createError),
      ).toEqual({ message: 'msg', errorCode: 'UNKNOWN' });
    });
    it('returns fallback', () => {
      expect(
        repo['extractErrorMessage']({}, exceptionMessages.createError),
      ).toEqual(exceptionMessages.createError);
    });
  });

  describe('findMissingCodes', () => {
    it('finds missing codes', () => {
      const found = [{ code: 'a' }, { code: 'b' }];
      // 'c' is missing
      expect(repo['findMissingCodes'](['a', 'b', 'c'], found)).toEqual(['c']);
    });
  });

  describe('validateEntityCodesFound', () => {
    it('validateEntityCodesFound calls validateEntityIdentifiersFound (deprecated)', () => {
      const found = [{ code: 'a' }];
      // Should throw because 'b' is missing
      expect(() =>
        repo['validateEntityCodesFound'](found, ['a', 'b'], 'Foo', { ctx: 1 }),
      ).toThrow(BadRequestException);
      // Should not throw if all found
      expect(() =>
        repo['validateEntityCodesFound'](
          [{ code: 'a' }, { code: 'b' }],
          ['a', 'b'],
          'Foo',
          { ctx: 1 },
        ),
      ).not.toThrow();
    });
  });
});
