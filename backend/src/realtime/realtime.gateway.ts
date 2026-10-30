import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';

type AccessPayload = {
  sub: string;
  email: string;
};

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    // Reject invalid tokens before the socket is fully connected so clients
    // cannot pick rooms or receive events they should not see.
    server.use(async (socket, next) => {
      try {
        const token = (socket.handshake.auth as { token?: string } | undefined)
          ?.token;
        if (!token) {
          return next(new Error('Unauthorized'));
        }
        const payload = await this.jwt.verifyAsync<AccessPayload>(token);
        const user = await this.users.findPublicById(payload.sub);
        if (!user) {
          return next(new Error('Unauthorized'));
        }
        socket.data.userId = user.id;
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  async handleConnection(socket: Socket) {
    const userId = socket.data.userId as string | undefined;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${userId}`);

    const shelves = await this.prisma.shelf.findMany({
      where: {
        OR: [{ ownerId: userId }, { shares: { some: { userId } } }],
      },
      select: { id: true },
    });
    for (const shelf of shelves) {
      socket.join(`shelf:${shelf.id}`);
    }

    this.logger.debug(`socket ${socket.id} joined user:${userId}`);
  }
}
