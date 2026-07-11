import 'dotenv/config'
import path from 'node:path'
import { defineConfig, env } from 'prisma/config'

type Env = {
  DATABASE_URL: string
  DIRECT_URL?: string
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    // Prisma 7: el comando de seed se declara aquí, NO en package.json#prisma.seed.
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    // env() lanza PrismaConfigEnvError si la variable no existe, así que la
    // variable opcional DIRECT_URL se chequea vía process.env antes de resolverla.
    url: process.env.DIRECT_URL
      ? env<Env>('DIRECT_URL')
      : env<Env>('DATABASE_URL'),
  },
})
