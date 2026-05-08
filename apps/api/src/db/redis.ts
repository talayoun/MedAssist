import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (err) => {
  console.error('Redis client error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

const REVOCATION_KEY_PREFIX = 'jwt:revoked:';

export async function addToRevocationSet(token: string, ttlSeconds: number): Promise<void> {
  await redis.set(`${REVOCATION_KEY_PREFIX}${token}`, '1', 'EX', ttlSeconds);
}

export async function isTokenRevoked(token: string): Promise<boolean> {
  const val = await redis.get(`${REVOCATION_KEY_PREFIX}${token}`);
  return val !== null;
}

export const redisClient = redis;
export default redis;
