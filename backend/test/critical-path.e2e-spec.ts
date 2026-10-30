import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Critical paths (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const stamp = Date.now();
  const password = 'Password123';
  const emailA = `e2e-a-${stamp}@example.com`;
  const emailB = `e2e-b-${stamp}@example.com`;
  const emailC = `e2e-c-${stamp}@example.com`;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await prisma.shelfBook.deleteMany({
        where: { addedById: { in: createdUserIds } },
      });
      await prisma.lending.deleteMany({
        where: {
          OR: [
            { lenderId: { in: createdUserIds } },
            { borrowerId: { in: createdUserIds } },
          ],
        },
      });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await app.close();
  });

  function signup(name: string, email: string) {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({ name, email, password });
  }

  it('signup, login, 401, refresh rotation and reuse', async () => {
    const signupRes = await signup('Ada', emailA).expect(201);
    createdUserIds.push(signupRes.body.user.id);
    expect(signupRes.body.accessToken).toBeDefined();
    expect(signupRes.body.user.passwordHash).toBeUndefined();
    const cookies = signupRes.headers['set-cookie'];
    expect(cookies?.join(';')).toMatch(/refresh_token=/);

    await signup('Ada', emailA).expect(409);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emailA, password: 'WrongPass1' })
      .expect(401)
      .expect((res) => {
        expect(res.body.message).toBe('Invalid email or password');
      });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emailA, password })
      .expect(200);
    const loginCookie = login.headers['set-cookie'][0];

    await request(app.getHttpServer()).get('/auth/me').expect(401);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(emailA);

    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', loginCookie)
      .expect(200);
    const rotated = refresh.headers['set-cookie'][0];
    expect(rotated).not.toBe(loginCookie);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', loginCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotated)
      .expect(401);
  });

  it('progress validation and auto-finish', async () => {
    const a = await signup('Owner', emailB).expect(201);
    createdUserIds.push(a.body.user.id);
    const token = a.body.accessToken;

    const reading = await request(app.getHttpServer())
      .post('/books')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Paged',
        author: 'A',
        status: 'READING',
        totalPages: 100,
      })
      .expect(201);

    const noPages = await request(app.getHttpServer())
      .post('/books')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'No pages', author: 'A', status: 'READING' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/books/${noPages.body.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPage: 1 })
      .expect(400)
      .expect((res) => {
        expect(JSON.stringify(res.body)).toContain(
          'Set total pages before logging progress',
        );
      });

    await request(app.getHttpServer())
      .patch(`/books/${reading.body.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPage: 101 })
      .expect(400)
      .expect((res) => {
        expect(JSON.stringify(res.body)).toContain(
          'Page cannot exceed total pages',
        );
      });

    await request(app.getHttpServer())
      .patch(`/books/${reading.body.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPage: -2 })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/books/${reading.body.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPage: 1.5 })
      .expect(400);

    const done = await request(app.getHttpServer())
      .patch(`/books/${reading.body.id}/progress`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPage: 100 })
      .expect(200);
    expect(done.body.status).toBe('FINISHED');
    expect(done.body.progressPercentage).toBe(100);
    expect(done.body.finishedAt).toBeTruthy();
  });

  it('shelf roles and lending rules', async () => {
    const ownerRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emailB, password })
      .expect(200);
    const editorRes = await signup('Editor', emailC).expect(201);
    createdUserIds.push(editorRes.body.user.id);
    const viewerEmail = `e2e-v-${stamp}@example.com`;
    const viewerRes = await signup('Viewer', viewerEmail).expect(201);
    createdUserIds.push(viewerRes.body.user.id);

    const ownerToken = ownerRes.body.accessToken;
    const editorToken = editorRes.body.accessToken;
    const viewerToken = viewerRes.body.accessToken;

    const shelf = await request(app.getHttpServer())
      .post('/shelves')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Club' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/shelves/${shelf.body.id}/shares`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: emailC, role: 'EDITOR' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/shelves/${shelf.body.id}/shares`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail, role: 'VIEWER' })
      .expect(201);

    const ownerBook = await request(app.getHttpServer())
      .post('/books')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Owned', author: 'A', status: 'READING' })
      .expect(201);

    const editorBook = await request(app.getHttpServer())
      .post('/books')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Editor book', author: 'B', status: 'READING' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/shelves/${shelf.body.id}/books`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ bookId: ownerBook.body.id })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/shelves/${shelf.body.id}/books`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ bookId: editorBook.body.id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/shelves/${shelf.body.id}/shares`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ email: emailA, role: 'VIEWER' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/shelves/${shelf.body.id}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);

    const lendBook = await request(app.getHttpServer())
      .post('/books')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Lendable', author: 'A', status: 'WANT_TO_READ' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/books/${lendBook.body.id}/lend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: emailB })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/books/${lendBook.body.id}/lend`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ email: viewerEmail })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/books/${lendBook.body.id}/lend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: emailC })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/books/${lendBook.body.id}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Hacked' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/books/${lendBook.body.id}/lend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/books/${lendBook.body.id}/return`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect((res) => {
        if (![200, 201].includes(res.status)) {
          throw new Error(`return status ${res.status}`);
        }
      });

    await request(app.getHttpServer())
      .post(`/books/${lendBook.body.id}/lend`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: viewerEmail })
      .expect((res) => {
        if (![200, 201].includes(res.status)) {
          throw new Error(`relend status ${res.status}`);
        }
      });
  });
});
