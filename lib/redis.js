const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

let redisClient;

if (!global.redis) {
  if (redisUrl) {
    global.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2000,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 3) return null; // Não retentar infinitamente
        return Math.min(times * 100, 3000);
      }
    });
    
    global.redis.on('error', (err) => {
      console.warn('[Redis] Conexão indisponível.');
    });
  } else {
    // Fallback se faltar variável, não deve acontecer devido ao Zod, mas por precaução.
    global.redis = {
      available: false,
      eval: async () => { throw new Error('REDIS_REQUIRED'); },
      get: async () => null,
      setex: async () => null,
      set: async () => null,
      del: async () => null
    };
  }
}

redisClient = global.redis;

module.exports = redisClient;
