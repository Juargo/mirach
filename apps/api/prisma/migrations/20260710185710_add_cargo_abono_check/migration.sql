-- Guard de dinero no negativo en Transaccion (follow-up diferido de US-011 PR1/PR2).
-- cargo/abono son montos en valor absoluto (enteros positivos); esta CHECK evita
-- que datos corruptos violen esa invariante a nivel de base de datos.
-- Prisma no modela CHECK en el PSL, por eso la migración es SQL puro y NO altera schema.prisma.
ALTER TABLE "Transaccion"
  ADD CONSTRAINT "Transaccion_cargo_abono_no_negativos" CHECK ("cargo" >= 0 AND "abono" >= 0);
