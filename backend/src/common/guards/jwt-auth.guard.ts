import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthUser } from '../decorators/current-user.decorator.js';
import { UsersService } from '../../users/users.service.js';

type AccessPayload = {
  sub: string;
  email: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    if (context.getType() !== 'http') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const path = (request.originalUrl ?? request.url).split('?')[0];
    if (path.startsWith('/api/docs')) {
      return true;
    }

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid access token');
    }

    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(header.slice(7));
      const user = await this.users.findPublicById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Missing or invalid access token');
      }
      (request as Request & { user: AuthUser }).user = {
        id: user.id,
        email: user.email,
        name: user.name,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Missing or invalid access token');
    }
  }
}
