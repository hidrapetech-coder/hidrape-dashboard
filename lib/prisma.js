const { PrismaClient } = require('@prisma/client');

if (!global.prisma) {
  const client = new PrismaClient();
  let schemaEnsured = null;

  const ensureColumns = async () => {
    if (!schemaEnsured) {
      schemaEnsured = client.$executeRawUnsafe(
        'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timeZone" TEXT, ADD COLUMN IF NOT EXISTS "minIdeal" DOUBLE PRECISION, ADD COLUMN IF NOT EXISTS "maxIdeal" DOUBLE PRECISION;'
      ).catch(() => {});
    }
    return schemaEnsured;
  };

  if (typeof client.$use === 'function') {
    client.$use(async (params, next) => {
      try {
        return await next(params);
      } catch (err) {
        if (err && (err.code === 'P2022' || String(err.message || '').includes('does not exist'))) {
          await ensureColumns();
          return await next(params);
        }
        throw err;
      }
    });
  }

  global.prisma = client;
}

module.exports = global.prisma;
