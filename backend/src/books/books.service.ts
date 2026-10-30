import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  BookStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { fieldBadRequest } from '../common/http-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { toBookResponse } from './book.util.js';
import type { CreateBookDto } from './dto/create-book.dto.js';
import type {
  BookSortField,
  ListBooksQueryDto,
} from './dto/list-books-query.dto.js';
import type { UpdateBookDto } from './dto/update-book.dto.js';
import type { UpdateProgressDto } from './dto/update-progress.dto.js';

export const BOOK_SELECT = {
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
  lendings: {
    where: { returnedAt: null },
    take: 1,
    select: {
      id: true,
      lentAt: true,
      borrowerId: true,
      borrower: { select: { id: true, name: true, email: true } },
    },
  },
} as const;

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(ownerId: string, dto: CreateBookDto) {
    const book = await this.prisma.$transaction(async (tx) => {
      const created = await tx.book.create({
        data: {
          ownerId,
          title: dto.title,
          author: dto.author,
          status: dto.status,
          totalPages: dto.totalPages,
          rating: dto.rating,
          notes: dto.notes,
          finishedAt:
            dto.status === BookStatus.FINISHED ? new Date() : undefined,
        },
        select: BOOK_SELECT,
      });

      await this.activity.record(
        {
          actorId: ownerId,
          type: ActivityType.BOOK_ADDED,
          bookId: created.id,
          message: `Added "${created.title}"`,
          recipientIds: [ownerId],
        },
        tx,
      );

      return created;
    });

    this.realtime.emitActivityNew([ownerId], {
      type: ActivityType.BOOK_ADDED,
      message: `Added "${book.title}"`,
    });
    return toBookResponse(book, ownerId);
  }

  async findMany(ownerId: string, query: ListBooksQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sort: BookSortField = query.sort ?? 'createdAt';
    const order = query.order ?? 'desc';
    const search = query.search?.trim();

    const where: Prisma.BookWhereInput = {
      ownerId,
      ...(query.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { author: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // Unrated books always sort last when sorting by rating. id is a stable tiebreaker.
    const orderBy: Prisma.BookOrderByWithRelationInput[] =
      sort === 'rating'
        ? [{ rating: { sort: order, nulls: 'last' } }, { id: 'asc' }]
        : [{ [sort]: order }, { id: 'asc' }];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: BOOK_SELECT,
      }),
      this.prisma.book.count({ where }),
    ]);

    return {
      items: items.map((book) => toBookResponse(book, ownerId)),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async findOne(userId: string, id: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      select: BOOK_SELECT,
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    if (book.ownerId === userId) {
      return toBookResponse(book, userId);
    }
    if (book.lendings[0]?.borrowerId === userId) {
      return toBookResponse(book, userId);
    }
    if (await this.canViewViaShelf(userId, id)) {
      return toBookResponse(book, userId);
    }
    throw new NotFoundException('Book not found');
  }

  async update(userId: string, id: string, dto: UpdateBookDto) {
    const existing = await this.requireWritableBook(userId, id);

    if (
      dto.totalPages !== undefined &&
      dto.totalPages !== null &&
      dto.totalPages < existing.currentPage
    ) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: [
          {
            field: 'totalPages',
            message: 'totalPages cannot be less than the current page of this book',
          },
        ],
      });
    }

    const nextStatus = dto.status ?? existing.status;
    let finishedAt: Date | null | undefined = undefined;
    if (nextStatus === BookStatus.FINISHED && existing.status !== BookStatus.FINISHED) {
      finishedAt = new Date();
    } else if (
      nextStatus !== BookStatus.FINISHED &&
      existing.status === BookStatus.FINISHED
    ) {
      finishedAt = null;
    }

    const book = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.book.update({
        where: { id },
        data: {
          title: dto.title,
          author: dto.author,
          status: dto.status,
          totalPages: dto.totalPages,
          rating: dto.rating,
          notes: dto.notes,
          finishedAt,
        },
        select: BOOK_SELECT,
      });

      if (dto.status && dto.status !== existing.status) {
        await this.activity.record(
          {
            actorId: userId,
            type: ActivityType.STATUS_CHANGED,
            bookId: updated.id,
            message: `Moved "${updated.title}" from ${existing.status} to ${updated.status}`,
            recipientIds: [userId],
          },
          tx,
        );
      }

      return updated;
    });

    if (dto.status && dto.status !== existing.status) {
      this.realtime.emitActivityNew([userId], {
        type: ActivityType.STATUS_CHANGED,
        message: `Moved "${book.title}" from ${existing.status} to ${book.status}`,
      });
    }

    return toBookResponse(book, userId);
  }

  async logProgress(userId: string, id: string, dto: UpdateProgressDto) {
    const existing = await this.requireWritableBook(userId, id);

    if (existing.status !== BookStatus.READING) {
      throw fieldBadRequest(
        'status',
        'Progress can only be logged when the book status is READING',
      );
    }
    if (existing.totalPages == null) {
      throw fieldBadRequest(
        'totalPages',
        'Set total pages before logging progress',
      );
    }
    if (dto.currentPage > existing.totalPages) {
      throw fieldBadRequest(
        'currentPage',
        'Page cannot exceed total pages',
      );
    }

    const finished = dto.currentPage === existing.totalPages;
    const previousStatus = existing.status;

    const book = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.book.update({
        where: { id },
        data: {
          currentPage: dto.currentPage,
          ...(finished
            ? { status: BookStatus.FINISHED, finishedAt: new Date() }
            : {}),
        },
        select: BOOK_SELECT,
      });

      if (finished) {
        await this.activity.record(
          {
            actorId: userId,
            type: ActivityType.STATUS_CHANGED,
            bookId: updated.id,
            message: `Moved "${updated.title}" from ${previousStatus} to ${updated.status}`,
            recipientIds: [userId],
          },
          tx,
        );
      }

      return updated;
    });

    if (finished) {
      this.realtime.emitActivityNew([userId], {
        type: ActivityType.STATUS_CHANGED,
        message: `Moved "${book.title}" from ${previousStatus} to ${book.status}`,
      });
    }

    return toBookResponse(book, userId);
  }

  async remove(userId: string, id: string) {
    const book = await this.requireWritableBook(userId, id);
    const borrowerId = book.lendings[0]?.borrowerId;
    await this.prisma.book.delete({ where: { id } });
    if (borrowerId) {
      this.realtime.emitToUsers([borrowerId, userId], 'lending:returned', {
        bookId: id,
        deleted: true,
      });
    }
  }

  private async canViewViaShelf(userId: string, bookId: string) {
    const link = await this.prisma.shelfBook.findFirst({
      where: {
        bookId,
        shelf: {
          OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
        },
      },
      select: { bookId: true },
    });
    return Boolean(link);
  }

  private async requireWritableBook(userId: string, id: string) {
    const book = await this.prisma.book.findUnique({
      where: { id },
      select: BOOK_SELECT,
    });
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    if (book.ownerId === userId) {
      return book;
    }
    if (book.lendings[0]?.borrowerId === userId) {
      throw new ForbiddenException('Borrowed books are read-only');
    }
    throw new NotFoundException('Book not found');
  }
}
