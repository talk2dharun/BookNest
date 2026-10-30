import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, Prisma } from '../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import type { AddShelfBookDto } from './dto/add-shelf-book.dto.js';
import type { CreateShelfDto } from './dto/create-shelf.dto.js';
import type { ShareShelfDto } from './dto/share-shelf.dto.js';
import type { UpdateShareDto } from './dto/update-share.dto.js';
import type { UpdateShelfDto } from './dto/update-shelf.dto.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import {
  AccessRole,
  ShelfAccessService,
} from './shelf-access.service.js';

const SHELF_BOOK_SELECT = {
  addedAt: true,
  addedById: true,
  book: {
    select: {
      id: true,
      title: true,
      author: true,
      status: true,
      totalPages: true,
      currentPage: true,
      rating: true,
      notes: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: { id: true, name: true } },
    },
  },
} as const;

@Injectable()
export class ShelvesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ShelfAccessService,
    private readonly users: UsersService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  create(ownerId: string, dto: CreateShelfDto) {
    return this.prisma.shelf.create({
      data: { ownerId, name: dto.name },
      select: {
        id: true,
        ownerId: true,
        name: true,
        createdAt: true,
      },
    });
  }

  async findMine(ownerId: string) {
    const items = await this.prisma.shelf.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ownerId: true,
        name: true,
        createdAt: true,
        _count: { select: { books: true, shares: true } },
      },
    });
    return {
      items: items.map(({ _count, ...shelf }) => ({
        ...shelf,
        bookCount: _count.books,
        collaboratorCount: _count.shares,
        myRole: AccessRole.OWNER,
      })),
    };
  }

  async findSharedWithMe(userId: string) {
    const shares = await this.prisma.shelfShare.findMany({
      where: { userId },
      orderBy: { shelf: { createdAt: 'desc' } },
      select: {
        role: true,
        shelf: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            owner: { select: { id: true, name: true } },
            _count: { select: { books: true } },
          },
        },
      },
    });
    return {
      items: shares.map((share) => ({
        id: share.shelf.id,
        name: share.shelf.name,
        createdAt: share.shelf.createdAt,
        owner: share.shelf.owner,
        bookCount: share.shelf._count.books,
        myRole: share.role,
      })),
    };
  }

  async findOne(userId: string, shelfId: string) {
    const { role } = await this.access.requireRole(
      shelfId,
      userId,
      AccessRole.VIEWER,
    );
    const shelf = await this.prisma.shelf.findUnique({
      where: { id: shelfId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        owner: { select: { id: true, name: true } },
        books: {
          orderBy: { addedAt: 'asc' },
          select: SHELF_BOOK_SELECT,
        },
        shares: {
          orderBy: { user: { name: 'asc' } },
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!shelf) {
      throw new NotFoundException('Shelf not found');
    }
    return {
      id: shelf.id,
      name: shelf.name,
      createdAt: shelf.createdAt,
      owner: shelf.owner,
      myRole: role,
      books: shelf.books.map((row) => ({
        ...row.book,
        addedAt: row.addedAt,
        addedById: row.addedById,
      })),
      collaborators: shelf.shares.map((share) => ({
        id: share.user.id,
        name: share.user.name,
        email: share.user.email,
        role: share.role,
      })),
    };
  }

  async rename(userId: string, shelfId: string, dto: UpdateShelfDto) {
    await this.access.requireRole(shelfId, userId, AccessRole.OWNER);
    return this.prisma.shelf.update({
      where: { id: shelfId },
      data: { name: dto.name },
      select: {
        id: true,
        ownerId: true,
        name: true,
        createdAt: true,
      },
    });
  }

  async remove(userId: string, shelfId: string) {
    await this.access.requireRole(shelfId, userId, AccessRole.OWNER);
    await this.prisma.shelf.delete({ where: { id: shelfId } });
    await this.realtime.closeShelfRoom(shelfId);
  }

  async addBook(userId: string, shelfId: string, dto: AddShelfBookDto) {
    await this.access.requireRole(shelfId, userId, AccessRole.EDITOR);
    const book = await this.prisma.book.findFirst({
      where: { id: dto.bookId, ownerId: userId },
      select: { id: true, title: true },
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }

    try {
      await this.prisma.shelfBook.create({
        data: {
          shelfId,
          bookId: book.id,
          addedById: userId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This book is already on this shelf');
      }
      throw error;
    }

    this.realtime.emitToShelf(shelfId, 'shelf:book-added', {
      shelfId,
      bookId: book.id,
    });
    return this.findOne(userId, shelfId);
  }

  async removeBook(userId: string, shelfId: string, bookId: string) {
    await this.access.requireRole(shelfId, userId, AccessRole.EDITOR);
    const link = await this.prisma.shelfBook.findUnique({
      where: { shelfId_bookId: { shelfId, bookId } },
    });
    if (!link) {
      throw new NotFoundException('Book is not on this shelf');
    }
    await this.prisma.shelfBook.delete({
      where: { shelfId_bookId: { shelfId, bookId } },
    });
    this.realtime.emitToShelf(shelfId, 'shelf:book-removed', {
      shelfId,
      bookId,
    });
  }

  async share(userId: string, shelfId: string, dto: ShareShelfDto) {
    const { shelf } = await this.access.requireRole(
      shelfId,
      userId,
      AccessRole.OWNER,
    );
    const target = await this.users.findPublicByEmail(dto.email);
    if (!target) {
      throw new NotFoundException('No user found with that email');
    }
    if (target.id === userId) {
      throw new BadRequestException('You cannot share a shelf with yourself');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.shelfShare.create({
          data: {
            shelfId,
            userId: target.id,
            role: dto.role,
          },
        });
        await this.activity.record(
          {
            actorId: userId,
            type: ActivityType.SHELF_SHARED,
            shelfId,
            targetUserId: target.id,
            message: `Shared "${shelf.name}" with ${target.name} as ${dto.role}`,
            recipientIds: [userId, target.id],
          },
          tx,
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This user already has access to this shelf',
        );
      }
      throw error;
    }

    await this.realtime.joinUserToShelf(target.id, shelfId);
    this.realtime.emitToUser(target.id, 'shelf:shared', {
      shelfId,
      role: dto.role,
    });
    this.realtime.emitActivityNew([userId, target.id], {
      type: ActivityType.SHELF_SHARED,
      message: `Shared "${shelf.name}" with ${target.name} as ${dto.role}`,
    });

    return this.findOne(userId, shelfId);
  }

  async updateShare(
    userId: string,
    shelfId: string,
    collaboratorId: string,
    dto: UpdateShareDto,
  ) {
    const { shelf } = await this.access.requireRole(
      shelfId,
      userId,
      AccessRole.OWNER,
    );
    const share = await this.prisma.shelfShare.findUnique({
      where: { shelfId_userId: { shelfId, userId: collaboratorId } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!share) {
      throw new NotFoundException('Collaborator not found');
    }

    if (share.role === dto.role) {
      return this.findOne(userId, shelfId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shelfShare.update({
        where: { id: share.id },
        data: { role: dto.role },
      });
      await this.activity.record(
        {
          actorId: userId,
          type: ActivityType.ROLE_CHANGED,
          shelfId,
          targetUserId: collaboratorId,
          message: `Changed ${share.user.name}'s role on "${shelf.name}" to ${dto.role}`,
          recipientIds: [userId, collaboratorId],
        },
        tx,
      );
    });

    this.realtime.emitToUser(collaboratorId, 'shelf:role-changed', {
      shelfId,
      role: dto.role,
    });
    this.realtime.emitActivityNew([userId, collaboratorId], {
      type: ActivityType.ROLE_CHANGED,
      message: `Changed ${share.user.name}'s role on "${shelf.name}" to ${dto.role}`,
    });

    return this.findOne(userId, shelfId);
  }

  async removeShare(userId: string, shelfId: string, collaboratorId: string) {
    const { shelf } = await this.access.requireRole(
      shelfId,
      userId,
      AccessRole.OWNER,
    );
    const share = await this.prisma.shelfShare.findUnique({
      where: { shelfId_userId: { shelfId, userId: collaboratorId } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!share) {
      throw new NotFoundException('Collaborator not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shelfShare.delete({ where: { id: share.id } });
      await this.activity.record(
        {
          actorId: userId,
          type: ActivityType.COLLABORATOR_REMOVED,
          shelfId,
          targetUserId: collaboratorId,
          message: `Removed ${share.user.name} from "${shelf.name}"`,
          recipientIds: [userId, collaboratorId],
        },
        tx,
      );
    });

    await this.realtime.removeUserFromShelf(collaboratorId, shelfId);
    this.realtime.emitToUser(collaboratorId, 'shelf:access-removed', {
      shelfId,
    });
    this.realtime.emitActivityNew([userId, collaboratorId], {
      type: ActivityType.COLLABORATOR_REMOVED,
      message: `Removed ${share.user.name} from "${shelf.name}"`,
    });
  }
}
