const { PrismaClient } = require('@prisma/client');

const LEGACY_USER_SELECT = {
  id: true,
  nome: true,
  email: true,
  senha: true,
  tipoPlantacao: true,
  cidade: true,
  estado: true,
  lat: true,
  lon: true,
  tamanhoFazenda: true,
  blynkToken: true,
  whatsappPhone: true,
  callmebotApiKey: true,
  criadoEm: true,
  atualizadoEm: true,
  resetPasswordToken: true,
  resetPasswordExpire: true,
  passwordChangedAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  role: true
};

const NEW_USER_FIELDS = ['timeZone', 'minIdeal', 'maxIdeal'];

const stripNewUserFields = (data) => {
  if (!data || typeof data !== 'object') return data;
  const copy = { ...data };
  for (const field of NEW_USER_FIELDS) {
    delete copy[field];
  }
  return copy;
};

const isMissingColumnError = (err) => {
  if (!err) return false;
  const msg = String(err.message || '');
  return err.code === 'P2022' || msg.includes('does not exist') || msg.includes('timeZone') || msg.includes('minIdeal') || msg.includes('maxIdeal');
};

if (!global.prisma) {
  const client = new PrismaClient();
  let migrationAttempted = false;
  let legacyMode = false;

  const tryEnsureColumns = async () => {
    if (migrationAttempted) return;
    migrationAttempted = true;
    try {
      await client.$executeRawUnsafe(
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timeZone" TEXT, ADD COLUMN IF NOT EXISTS "minIdeal" DOUBLE PRECISION, ADD COLUMN IF NOT EXISTS "maxIdeal" DOUBLE PRECISION;'
      );
    } catch {
      legacyMode = true;
    }
  };

  const wrapUserMethod = (methodName) => {
    const original = client.user[methodName].bind(client.user);
    client.user[methodName] = async (args = {}) => {
      if (legacyMode) {
        const safeArgs = { ...args };
        if (!safeArgs.select && !safeArgs.include) {
          safeArgs.select = LEGACY_USER_SELECT;
        }
        if (safeArgs.data) {
          safeArgs.data = stripNewUserFields(safeArgs.data);
        }
        const res = await original(safeArgs);
        if (res && typeof res === 'object' && !Array.isArray(res)) {
          return { timeZone: null, minIdeal: null, maxIdeal: null, ...res };
        }
        return res;
      }

      try {
        return await original(args);
      } catch (err) {
        if (isMissingColumnError(err)) {
          await tryEnsureColumns();
          try {
            return await original(args);
          } catch (retryErr) {
            if (isMissingColumnError(retryErr)) {
              legacyMode = true;
              const safeArgs = { ...args };
              if (!safeArgs.select && !safeArgs.include) {
                safeArgs.select = LEGACY_USER_SELECT;
              }
              if (safeArgs.data) {
                safeArgs.data = stripNewUserFields(safeArgs.data);
              }
              const res = await original(safeArgs);
              if (res && typeof res === 'object' && !Array.isArray(res)) {
                return { timeZone: null, minIdeal: null, maxIdeal: null, ...res };
              }
              return res;
            }
            throw retryErr;
          }
        }
        throw err;
      }
    };
  };

  for (const method of ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'delete']) {
    if (client.user && typeof client.user[method] === 'function') {
      wrapUserMethod(method);
    }
  }

  global.prisma = client;
}

module.exports = global.prisma;
