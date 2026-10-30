import { Injectable } from '@nestjs/common';
import { ActivityType, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type RecordActivityInput = {
  actorId: string;
  type: ActivityType;
  message: string;
  bookId?: string;
  shelfId?: string;
  targetUserId?: string;
  /** Users who should see this event in their feed (actor plus anyone affected). */
  recipientIds: string[];
};

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordActivityInput, tx: Prisma.TransactionClient = this.prisma) {
    const recipientIds = [...new Set(input.recipientIds)];
    return tx.activity.create({
      data: {
        actorId: input.actorId,
        type: input.type,
        message: input.message,
        bookId: input.bookId,
        shelfId: input.shelfId,
        targetUserId: input.targetUserId,
        recipients: {
          create: recipientIds.map((userId) => ({ userId })),
        },
      },
    });
  }
}
