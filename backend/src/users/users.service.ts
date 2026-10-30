import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findPublicByEmail(email: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: USER_PUBLIC_SELECT,
    });
  }

  findPublicById(id: string): Promise<PublicUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: USER_PUBLIC_SELECT,
    });
  }

  create(data: { name: string; email: string; passwordHash: string }) {
    return this.prisma.user.create({
      data,
      select: USER_PUBLIC_SELECT,
    });
  }
}
