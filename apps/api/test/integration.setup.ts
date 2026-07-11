import { assertDestructiveDbAllowed } from '../src/infrastructure/persistence/db-safety';

// Los tests de integración MUTAN la BD (deleteMany, seed). Aborta la suite si
// no hay opt-in explícito (ALLOW_DESTRUCTIVE_DB=1) o si la cadena parece prod.
// dotenv/config ya corrió (setupFiles previo) y cargó apps/api/.env.
assertDestructiveDbAllowed();
