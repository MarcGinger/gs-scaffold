import { RedisUtilityService } from '../redis-utility.service';
import { IUsertoken } from 'src/common';

const mockRedis = {
  hget: jest.fn(),
  hgetall: jest.fn(),
  hexists: jest.fn(),
  hvals: jest.fn(),
  hmget: jest.fn(),
  hset: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  hdel: jest.fn(),
};

const mockRedisService = {
  getOrThrow: jest.fn(() => mockRedis),
};

describe('RedisUtilityService', () => {
  let service: RedisUtilityService;
  const user: IUsertoken = { sub: '1', name: 'n', email: 'e', tenant: 't' };
  const coreUser: IUsertoken = { sub: '1', name: 'n', email: 'e' };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RedisUtilityService(mockRedisService as any);
  });

  describe('buildKey', () => {
    it('should build key with tenant', () => {
      // @ts-expect-private
      expect((service as any).buildKey(user, 'type')).toBe('type:t');
    });
    it('should default tenant to core', () => {
      expect((service as any).buildKey(coreUser, 'type')).toBe('type:core');
    });
  });

  describe('safeParse', () => {
    it('should parse valid JSON', () => {
      expect((service as any).safeParse('{"a":1}')).toEqual({ a: 1 });
    });
    it('should return null on invalid JSON', () => {
      expect((service as any).safeParse('{bad json')).toBeNull();
    });
  });

  describe('getOne', () => {
    it('should return parsed value if found', async () => {
      mockRedis.hget.mockResolvedValueOnce('{"foo":42}');
      const result = await service.getOne(user, 'cat', 'key');
      expect(result).toEqual({ foo: 42 });
      expect(mockRedis.hget).toHaveBeenCalledWith('cat:t', 'key');
    });
    it('should return null if not found', async () => {
      mockRedis.hget.mockResolvedValueOnce(null);
      const result = await service.getOne(user, 'cat', 'key');
      expect(result).toBeNull();
    });
    it('should return null if parse fails', async () => {
      mockRedis.hget.mockResolvedValueOnce('bad json');
      const result = await service.getOne(user, 'cat', 'key');
      expect(result).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return parsed map', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({ a: '{"x":1}', b: '{"y":2}' });
      const result = await service.getAll(user, 'type');
      expect(result).toEqual({ a: { x: 1 }, b: { y: 2 } });
    });
    it('should skip keys with invalid JSON', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({ a: '{"x":1}', b: 'bad' });
      const result = await service.getAll(user, 'type');
      expect(result).toEqual({ a: { x: 1 } });
    });
    it('should return empty object if no keys', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({});
      const result = await service.getAll(user, 'type');
      expect(result).toEqual({});
    });
  });

  describe('exists', () => {
    it('should return true if exists', async () => {
      mockRedis.hexists.mockResolvedValueOnce(1);
      const result = await service.exists(user, 'type', 'code');
      expect(result).toBe(true);
    });
    it('should return false if not exists', async () => {
      mockRedis.hexists.mockResolvedValueOnce(0);
      const result = await service.exists(user, 'type', 'code');
      expect(result).toBe(false);
    });
  });

  describe('getAllValues', () => {
    it('should return parsed values', async () => {
      mockRedis.hvals.mockResolvedValueOnce(['{"a":1}', '{"b":2}']);
      const result = await service.getAllValues(user, 'type');
      expect(result).toEqual([{ a: 1 }, { b: 2 }]);
    });
    it('should skip invalid JSON', async () => {
      mockRedis.hvals.mockResolvedValueOnce(['{"a":1}', 'bad']);
      const result = await service.getAllValues(user, 'type');
      expect(result).toEqual([{ a: 1 }]);
    });
    it('should return empty array if no values', async () => {
      mockRedis.hvals.mockResolvedValueOnce([]);
      const result = await service.getAllValues(user, 'type');
      expect(result).toEqual([]);
    });
  });

  describe('getMany', () => {
    it('should return parsed values for codes', async () => {
      mockRedis.hmget.mockResolvedValueOnce(['{"a":1}', '{"b":2}']);
      const result = await service.getMany(user, 'type', ['x', 'y']);
      expect(result).toEqual({ x: { a: 1 }, y: { b: 2 } });
    });
    it('should return null for missing or invalid values', async () => {
      mockRedis.hmget.mockResolvedValueOnce([null, 'bad']);
      const result = await service.getMany(user, 'type', ['x', 'y']);
      expect(result).toEqual({ x: null, y: null });
    });
    it('should return empty object if codes is empty', async () => {
      const result = await service.getMany(user, 'type', []);
      expect(result).toEqual({});
      expect(mockRedis.hmget).not.toHaveBeenCalled();
    });
  });

  describe('write', () => {
    it('should stringify and hset', async () => {
      mockRedis.hset.mockResolvedValueOnce(undefined);
      await service.write(user, 'cat', 'key', { foo: 1 });
      expect(mockRedis.hset).toHaveBeenCalledWith('cat:t', 'key', '{"foo":1}');
    });
  });

  describe('deleteCategory', () => {
    it('should del the category key', async () => {
      mockRedis.del.mockResolvedValueOnce(undefined);
      await service.deleteCategory(user, 'cat');
      expect(mockRedis.del).toHaveBeenCalledWith('cat:t');
    });
  });

  describe('deleteCategoryAndEntities', () => {
    it('should del all keys and main hash if keys exist', async () => {
      mockRedis.keys.mockResolvedValueOnce(['cat:1', 'cat:2']);
      mockRedis.del.mockResolvedValue(undefined);
      await service.deleteCategoryAndEntities('cat');
      expect(mockRedis.del).toHaveBeenCalledWith('cat:1', 'cat:2');
      expect(mockRedis.del).toHaveBeenCalledWith('cat');
    });
    it('should only del main hash if no keys', async () => {
      mockRedis.keys.mockResolvedValueOnce([]);
      mockRedis.del.mockResolvedValue(undefined);
      await service.deleteCategoryAndEntities('cat');
      expect(mockRedis.del).toHaveBeenCalledWith('cat');
    });
  });

  describe('deleteCheckpoint', () => {
    it('should hdel the checkpoint', async () => {
      mockRedis.hdel.mockResolvedValueOnce(undefined);
      await service.deleteCheckpoint('cat');
      expect(mockRedis.hdel).toHaveBeenCalledWith(
        'projection:checkpoints:projector',
        'cat',
      );
    });
  });
});
