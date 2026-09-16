const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

let redisClient;

if (!global.redis) {
  if (redisUrl) {
    global.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null; // Não retentar infinitamente
        return Math.min(times * 100, 3000);
      }
    });
    
    global.redis.on('error', (err) => {
      console.warn('[Redis] Erro de conexão:', err.message);
    });
  } else {
    // Fallback se faltar variável, não deve acontecer devido ao Zod, mas por precaução.
    global.redis = {
      get: async () => null,
      setex: async () => null,
      set: async () => null,
      del: async () => null
    };
  }
}

redisClient = global.redis;

module.exports = redisClient;
