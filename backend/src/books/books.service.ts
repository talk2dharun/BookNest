import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  BookStatus,
  Prisma,
} from '../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBookDto } from './dto/create-book.dto.js';
import type {
  BookSortField,
  ListBooksQueryDto,
} from './dto/list-books-query.dto.js';
import type { UpdateBookDto } from './dto/update-book.dto.js';

const BOOK_SELECT = {
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
} as const;

@Injectable()
export class BooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async create(ownerId: string, dto: CreateBookDto) {
    return this.prisma.$transaction(async (tx) => {
      const book = await tx.book.create({
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
          bookId: book.id,
          message: `Added "${book.title}"`,
          recipientIds: [ownerId],
        },
        tx,
      );

      return book;
    });
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
      items,
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  async findOne(ownerId: string, id: string) {
    return this.requireOwnedBook(ownerId, id);
  }

  async update(ownerId: string, id: string, dto: UpdateBookDto) {
    const existing = await this.requireOwnedBook(ownerId, id);

    if (
      dto.totalPages !== undefined &&
      dto.totalPages !== null &&
      dto.totalPages < existing.currentPage
    ) {
      throw new BadRequestException({
        message: 'Validation failed',
        details: [
          'totalPages cannot be less than the current page of this book',
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

    return this.prisma.$transaction(async (tx) => {
      const book = await tx.book.update({
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
            actorId: ownerId,
            type: ActivityType.STATUS_CHANGED,
            bookId: book.id,
            message: `Moved "${book.title}" from ${existing.status} to ${book.status}`,
            recipientIds: [ownerId],
          },
          tx,
        );
      }

      return book;
    });
  }

  async remove(ownerId: string, id: string) {
    await this.requireOwnedBook(ownerId, id);
    await this.prisma.book.delete({ where: { id } });
  }

  private async requireOwnedBook(ownerId: string, id: string) {
    const book = await this.prisma.book.findFirst({
      where: { id, ownerId },
      select: BOOK_SELECT,
    });
    // Same 404 whether the book is missing or belongs to someone else.
    if (!book) {
      throw new NotFoundException('Book not found');
    }
    return book;
  }
}
