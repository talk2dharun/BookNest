import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export const AccessRole = {
  VIEWER: 'VIEWER',
  EDITOR: 'EDITOR',
  OWNER: 'OWNER',
} as const;

export type AccessRole = (typeof AccessRole)[keyof typeof AccessRole];

const ROLE_RANK: Record<AccessRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

export type ShelfAccess = {
  shelf: { id: string; ownerId: string; name: string; createdAt: Date };
  role: AccessRole;
};

@Injectable()
export class ShelfAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccess(
    shelfId: string,
    userId: string,
  ): Promise<ShelfAccess | null> {
    const shelf = await this.prisma.shelf.findUnique({
      where: { id: shelfId },
      select: {
        id: true,
        ownerId: true,
        name: true,
        createdAt: true,
        shares: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    });
    if (!shelf) {
      return null;
    }
    if (shelf.ownerId === userId) {
      return {
        shelf: {
          id: shelf.id,
          ownerId: shelf.ownerId,
          name: shelf.name,
          createdAt: shelf.createdAt,
        },
        role: AccessRole.OWNER,
      };
    }
    const share = shelf.shares[0];
    if (!share) {
      return null;
    }
    return {
      shelf: {
        id: shelf.id,
        ownerId: shelf.ownerId,
        name: shelf.name,
        createdAt: shelf.createdAt,
      },
      role: share.role,
    };
  }

  /**
   * Unknown shelves and shelves the caller cannot see both return 404.
   * If they can see it but their role is too low, return 403.
   */
  async requireRole(
    shelfId: string,
    userId: string,
    minRole: AccessRole,
  ): Promise<ShelfAccess> {
    const access = await this.getAccess(shelfId, userId);
    if (!access) {
      throw new NotFoundException('Shelf not found');
    }
    if (ROLE_RANK[access.role] < ROLE_RANK[minRole]) {
      if (minRole === AccessRole.OWNER) {
        throw new ForbiddenException('Only the shelf owner can do this');
      }
      throw new ForbiddenException(
        'Viewers cannot add or remove books on this shelf',
      );
    }
    return access;
  }
}
