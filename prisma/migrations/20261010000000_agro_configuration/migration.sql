-- Não inferir fuso nem faixas para cadastros legados. NULL mantém o bloqueio/UTC explícito.
ALTER TABLE "User" ADD COLUMN "timeZone" TEXT,
    ADD COLUMN "minIdeal" DOUBLE PRECISION,
    ADD COLUMN "maxIdeal" DOUBLE PRECISION;
ALTER TABLE "User" ADD CONSTRAINT "User_moisture_limits_check"
    CHECK (("minIdeal" IS NULL AND "maxIdeal" IS NULL) OR
           ("minIdeal" IS NOT NULL AND "maxIdeal" IS NOT NULL AND
            "minIdeal" >= 0 AND "maxIdeal" <= 100 AND "minIdeal" < "maxIdeal"));
