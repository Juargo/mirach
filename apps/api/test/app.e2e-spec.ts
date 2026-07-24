import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { createApp } from '../src/infrastructure/http-express/app';
import { createContainer } from '../src/composition/container';
import { createPrismaClient } from '../src/infrastructure/persistence/create-prisma-client';

describe('AppController (e2e)', () => {
  let app: Express;
  let prisma: PrismaClient;

  beforeEach(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    app = createApp(createContainer(prisma));
  });

  it('/ (GET)', () => {
    return request(app)
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });
});
