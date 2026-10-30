import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, Prisma } from '../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { toBookResponse } from '../books/book.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { UsersService } from '../users/users.service.js';
import type { LendBookDto } from './dto/lend-book.dto.js';

const ACTIVE_LENDING_SELECT = {
  where: { returnedAt: null },
  take: 1,
  select: {
    id: true,
    lentAt: true,
    borrower: { select: { id: true, name: true, email: true } },
  },
} as const;

@Injectable()
export class LendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  async lend(ownerId: string, bookId: string, dto: LendBookDto) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, ownerId },
      select: {
        id: true,
        title: true,
        ownerId: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const borrower = await this.users.findPublicByEmail(dto.email);
    if (!borrower) {
      throw new NotFoundException('No user found with that email');
    }
    if (borrower.id === ownerId) {
      throw new BadRequestException('You cannot lend a book to yourself');
    }

    const lending = await this.prisma.$transaction(async (tx) => {
      const active = await tx.lending.findFirst({
        where: { bookId, returnedAt: null },
        select: { id: true },
      });
      if (active) {
        throw new ConflictException('This book is already lent to someone');
      }

      try {
        const created = await tx.lending.create({
          data: {
            bookId,
            lenderId: ownerId,
            borrowerId: borrower.id,
          },
          select: {
            id: true,
            lentAt: true,
            bookId: true,
            borrower: { select: { id: true, name: true, email: true } },
          },
        });
        await this.activity.record(
          {
            actorId: ownerId,
            type: ActivityType.BOOK_LENT,
            bookId,
            targetUserId: borrower.id,
            message: `Lent "${book.title}" to ${borrower.name}`,
            recipientIds: [ownerId, borrower.id],
          },
          tx,
        );
        return created;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('This book is already lent to someone');
        }
        throw error;
      }
    });

    const payload = {
      lendingId: lending.id,
      bookId: lending.bookId,
      borrower: lending.borrower,
      lentAt: lending.lentAt,
    };
    this.realtime.emitToUsers(
      [ownerId, borrower.id],
      'lending:created',
      payload,
    );
    this.realtime.emitActivityNew([ownerId, borrower.id], {
      type: ActivityType.BOOK_LENT,
      message: `Lent "${book.title}" to ${borrower.name}`,
    });

    console.log(
      `\n[MOCK EMAIL NOTIFICATION]\n` +
      `To: ${borrower.email} (${borrower.name})\n` +
      `From: ${book.owner?.email ?? 'noreply@booknest.app'}\n` +
      `Subject: "${book.title}" has been lent to you!\n` +
      `Message: Hi ${borrower.name}, ${book.owner?.name ?? 'A friend'} has lent you their copy of "${book.title}". You can now view it under your Borrowed books.\n`,
    );

    return payload;
  }

  async markReturned(ownerId: string, bookId: string) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, ownerId },
      select: { id: true, title: true },
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const active = await tx.lending.findFirst({
        where: { bookId, returnedAt: null },
      });
      if (!active) {
        throw new BadRequestException('This book is not currently lent');
      }

      const updated = await tx.lending.update({
        where: { id: active.id },
        data: { returnedAt: new Date() },
        select: {
          id: true,
          returnedAt: true,
          borrowerId: true,
          borrower: { select: { id: true, name: true } },
        },
      });

      await this.activity.record(
        {
          actorId: ownerId,
          type: ActivityType.BOOK_RETURNED,
          bookId,
          targetUserId: active.borrowerId,
          message: `${updated.borrower.name} returned "${book.title}"`,
          recipientIds: [ownerId, active.borrowerId],
        },
        tx,
      );

      return updated;
    });

    const payload = {
      lendingId: result.id,
      bookId,
      returnedAt: result.returnedAt,
    };
    this.realtime.emitToUsers(
      [ownerId, result.borrowerId],
      'lending:returned',
      payload,
    );
    this.realtime.emitActivityNew([ownerId, result.borrowerId], {
      type: ActivityType.BOOK_RETURNED,
      message: `${result.borrower.name} returned "${book.title}"`,
    });

    return payload;
  }

  async listBorrowed(userId: string) {
    const rows = await this.prisma.lending.findMany({
      where: { borrowerId: userId, returnedAt: null },
      orderBy: { lentAt: 'desc' },
      select: {
        id: true,
        lentAt: true,
        book: {
          select: {
            id: true,
            ownerId: true,
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
            lendings: ACTIVE_LENDING_SELECT,
          },
        },
      },
    });

    return {
      items: rows.map((row) => ({
        lendingId: row.id,
        lentAt: row.lentAt,
        ...toBookResponse(row.book, userId),
      })),
    };
  }
}
