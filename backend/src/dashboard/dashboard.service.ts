import { Injectable } from '@nestjs/common';
import { BookStatus } from '../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async get(userId: string) {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const [
      statusGroups,
      finishedThisYear,
      ratingAgg,
      topShelf,
      lentOutCount,
      sharedWithMeCount,
      recentActivity,
    ] = await Promise.all([
      this.prisma.book.groupBy({
        by: ['status'],
        where: { ownerId: userId },
        _count: { _all: true },
      }),
      this.prisma.book.count({
        where: {
          ownerId: userId,
          status: BookStatus.FINISHED,
          finishedAt: { gte: yearStart },
        },
      }),
      this.prisma.book.aggregate({
        where: { ownerId: userId, rating: { not: null } },
        _avg: { rating: true },
      }),
      this.prisma.shelf.findFirst({
        where: { ownerId: userId },
        orderBy: { books: { _count: 'desc' } },
        select: {
          id: true,
          name: true,
          _count: { select: { books: true } },
        },
      }),
      this.prisma.lending.count({
        where: { lenderId: userId, returnedAt: null },
      }),
      this.prisma.shelfShare.count({ where: { userId } }),
      this.activity.listForUser(userId, 20),
    ]);

    const countsByStatus = {
      WANT_TO_READ: 0,
      READING: 0,
      FINISHED: 0,
    };
    for (const row of statusGroups) {
      countsByStatus[row.status] = row._count._all;
    }

    return {
      countsByStatus,
      finishedThisYear,
      averageRating: ratingAgg._avg.rating,
      topShelf: topShelf
        ? {
            id: topShelf.id,
            name: topShelf.name,
            bookCount: topShelf._count.books,
          }
        : null,
      lentOutCount,
      sharedWithMeCount,
      recentActivity: recentActivity.items,
    };
  }
}
