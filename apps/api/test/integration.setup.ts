import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';

// Compartido por test:integration Y test:e2e — ambos MUTAN la BD real
// (deleteMany, seed, o el pipeline completo de ingesta vía HTTP). Aborta la
// suite si no hay opt-in explícito (ALLOW_DESTRUCTIVE_DB=1) o si la cadena
// parece prod. dotenv/config ya corrió (setupFiles previo) y cargó
// apps/api/.env.
assertDestructiveDbAllowed();
