import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: async () => 1 } },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('points at health and docs', () => {
      expect(appController.root()).toEqual({
        name: 'BookNest API',
        health: '/health',
        docs: '/api/docs',
      });
    });
  });
});
