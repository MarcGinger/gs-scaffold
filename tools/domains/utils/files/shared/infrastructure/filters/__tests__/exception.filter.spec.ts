import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionFilter } from '../exception.filter';
import { ILogger } from 'src/common/logger.interface';

describe('AllExceptionFilter', () => {
  let filter: AllExceptionFilter;
  let logger: ILogger;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    logger = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
    };
    filter = new AllExceptionFilter(logger);
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = {
      url: '/test',
      path: '/test',
      method: 'GET',
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;
  });

  it('should handle HttpException', () => {
    const exception = new HttpException(
      { message: 'error', errorCode: 'E1' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'error',
        errorCode: 'E1',
        path: '/test',
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should handle generic Error', () => {
    const exception = new Error('fail');
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'fail',
        errorCode: '',
        path: '/test',
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should handle policyresult on request', () => {
    mockRequest.policyresult = {
      status_code: 403,
      message: 'policy error',
      error_code: 'POLICY',
    };
    const exception = new HttpException(
      { message: 'error', errorCode: 'E1' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        message: 'policy error',
        errorCode: 'POLICY',
        path: '/test',
      }),
    );
  });

  it('should log error for status 500', () => {
    const exception = new HttpException(
      { message: 'err', errorCode: 'E2' },
      500,
    );
    filter.catch(exception, mockHost);
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle exception without message property', () => {
    const exception = { foo: 'bar' };
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: undefined,
        errorCode: '',
        path: '/test',
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should handle request.policyresult with missing fields', () => {
    mockRequest.policyresult = {};
    const exception = new HttpException(
      { message: 'error', errorCode: 'E1' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'error',
        errorCode: 'E1',
        path: '/test',
      }),
    );
  });

  it('should handle undefined request', () => {
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => undefined,
      }),
    } as any;
    const exception = new Error('fail');
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'fail',
        errorCode: '',
        path: '',
      }),
    );
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should handle status 500 with stack', () => {
    const exception = new HttpException(
      { message: 'err', errorCode: 'E2' },
      500,
    );
    (exception as any).stack = 'stacktrace';
    filter.catch(exception, mockHost);
    const errorCall = (logger.error as jest.Mock).mock.calls[0];
    expect(errorCall[0]).toMatchObject({ stack: 'stacktrace' });
    expect(errorCall[1]).toBe('End Request for /test');
  });

  it('should handle status 500 without stack', () => {
    const exception = new HttpException(
      { message: 'err', errorCode: 'E2' },
      500,
    );
    filter.catch(exception, mockHost);
    const errorCall = (logger.error as jest.Mock).mock.calls[0];
    expect(errorCall[0]).toMatchObject({ stack: '' });
    expect(errorCall[1]).toBe('End Request for /test');
  });

  it('should handle message as string', () => {
    const exception = new HttpException('string error', HttpStatus.BAD_REQUEST);
    filter.catch(exception, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'string error',
        path: '/test',
      }),
    );
  });
});
