const { PrismaClient } = require('@prisma/client');

// Corrige automaticamente URL do Supabase Pooler na porta 5432 (Session Mode sem suporte a PgBouncer transaction) para 6543
const normalizePoolerUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.includes('.pooler.supabase.com')) {
      if (parsed.port === '5432') {
        parsed.port = '6543';
      }
      if (!parsed.searchParams.has('pgbouncer')) {
        parsed.searchParams.set('pgbouncer', 'true');
      }
      if (!parsed.searchParams.has('connection_limit')) {
        parsed.searchParams.set('connection_limit', '1');
      }
      return parsed.toString();
    }
  } catch {
    // mantém original se não for URL válida
  }
  return rawUrl;
};

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
  let legacyMode = false;

  const dbUrl = normalizePoolerUrl(process.env.DATABASE_URL);
  if (dbUrl && dbUrl !== process.env.DATABASE_URL) {
    process.env.DATABASE_URL = dbUrl;
  }

  const baseClient = new PrismaClient(
    dbUrl ? { datasources: { db: { url: dbUrl } } } : undefined
  );
  const extendedClient = baseClient.$extends({
    query: {
      user: {
        async $allOperations({ operation, args, query }) {
          const runLegacy = async () => {
            const safeArgs = { ...(args || {}) };
            if (!safeArgs.select && !safeArgs.include && ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'delete'].includes(operation)) {
              safeArgs.select = LEGACY_USER_SELECT;
            }
            if (safeArgs.data) {
              safeArgs.data = stripNewUserFields(safeArgs.data);
            }
            const res = await query(safeArgs);
            if (res && typeof res === 'object' && !Array.isArray(res)) {
              return { timeZone: null, minIdeal: null, maxIdeal: null, ...res };
            }
            if (Array.isArray(res)) {
              return res.map(item => (item && typeof item === 'object' ? { timeZone: null, minIdeal: null, maxIdeal: null, ...item } : item));
            }
            return res;
          };

          if (legacyMode) {
            return runLegacy();
          }

          try {
            return await query(args);
          } catch (err) {
            if (isMissingColumnError(err)) {
              legacyMode = true;
              return runLegacy();
            }
            throw err;
          }
        }
      }
    }
  });

  global.prisma = extendedClient;
}

module.exports = global.prisma;
