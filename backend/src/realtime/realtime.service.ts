import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitToUser(userId: string, event: string, payload: unknown) {
    this.gateway.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    for (const userId of new Set(userIds)) {
      this.emitToUser(userId, event, payload);
    }
  }

  emitToShelf(shelfId: string, event: string, payload: unknown) {
    this.gateway.server?.to(`shelf:${shelfId}`).emit(event, payload);
  }

  emitActivityNew(userIds: string[], payload: unknown) {
    this.emitToUsers(userIds, 'activity:new', payload);
  }

  async joinUserToShelf(userId: string, shelfId: string) {
    const sockets = await this.gateway.server?.in(`user:${userId}`).fetchSockets();
    if (!sockets) {
      return;
    }
    for (const socket of sockets) {
      socket.join(`shelf:${shelfId}`);
    }
  }

  async removeUserFromShelf(userId: string, shelfId: string) {
    const sockets = await this.gateway.server?.in(`user:${userId}`).fetchSockets();
    if (!sockets) {
      return;
    }
    for (const socket of sockets) {
      socket.leave(`shelf:${shelfId}`);
    }
  }

  async closeShelfRoom(shelfId: string) {
    const sockets = await this.gateway.server
      ?.in(`shelf:${shelfId}`)
      .fetchSockets();
    if (!sockets) {
      return;
    }
    for (const socket of sockets) {
      socket.leave(`shelf:${shelfId}`);
    }
  }
}
