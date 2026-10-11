const redis = require('./redis');
// Cache é opcional para dados; a cota paga usa Redis diretamente e falha fechada.
const read = async key => { try { const raw = await redis.get(key); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const write = async (key, ttl, value) => { try { await redis.setex(key, ttl, JSON.stringify(value)); } catch { console.warn('[Cache] Escrita indisponível.'); } };
const remove = async (...keys) => { try { await redis.del(...keys); } catch { console.warn('[Cache] Invalidação indisponível.'); } };
module.exports = { read, write, remove };
