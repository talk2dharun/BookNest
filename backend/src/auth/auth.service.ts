import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHmac, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from '../common/constants.js';
import { parseDurationToMs } from '../common/parse-duration.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type PublicUser,
  UsersService,
} from '../users/users.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { SignupDto } from './dto/signup.dto.js';

const BCRYPT_COST = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto, res: Response) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    let user: PublicUser;
    try {
      user = await this.users.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }
    return this.issueSession(user, res);
  }

  async login(dto: LoginDto, res: Response) {
    const user = await this.users.findByEmail(dto.email);
    // Same message for unknown email and bad password so we do not leak which failed.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueSession(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      res,
    );
  }

  async refresh(rawToken: string | undefined, res: Response) {
    if (!rawToken) {
      throw new UnauthorizedException('Missing or invalid refresh token');
    }

    const tokenHash = this.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException('Missing or invalid refresh token');
    }

    // Reuse of a revoked token is treated as theft: revoke every session for that user.
    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('Missing or invalid refresh token');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('Missing or invalid refresh token');
    }

    const user = await this.users.findPublicById(stored.userId);
    if (!user) {
      this.clearRefreshCookie(res);
      throw new UnauthorizedException('Missing or invalid refresh token');
    }

    // Rotation: revoke the presented token, then issue a new cookie + access token.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSession(user, res);
  }

  async logout(rawToken: string | undefined, res: Response) {
    if (rawToken) {
      const tokenHash = this.hashRefreshToken(rawToken);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    this.clearRefreshCookie(res);
    return { success: true };
  }

  private async issueSession(user: PublicUser, res: Response) {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });

    const rawRefresh = randomBytes(48).toString('hex');
    const tokenHash = this.hashRefreshToken(rawRefresh);
    const expiresAt = new Date(
      Date.now() +
        parseDurationToMs(
          this.config.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
        ),
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    res.cookie(REFRESH_COOKIE_NAME, rawRefresh, this.cookieOptions(expiresAt));
    return { accessToken, user };
  }

  /** HMAC so a leaked token-hash table is not enough without JWT_REFRESH_SECRET. */
  private hashRefreshToken(rawToken: string): string {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
    )
      .update(rawToken)
      .digest('hex');
  }

  private cookieOptions(expiresAt: Date): CookieOptions {
    const sameSite = this.cookieSameSite();
    return {
      httpOnly: true,
      sameSite,
      secure: this.cookieSecure(),
      path: REFRESH_COOKIE_PATH,
      expires: expiresAt,
    };
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      sameSite: this.cookieSameSite(),
      secure: this.cookieSecure(),
      path: REFRESH_COOKIE_PATH,
    });
  }

  private cookieSameSite(): CookieOptions['sameSite'] {
    const value = this.config.get<string>('COOKIE_SAMESITE') ?? 'lax';
    if (value === 'none' || value === 'lax' || value === 'strict') {
      return value;
    }
    return 'lax';
  }

  private cookieSecure(): boolean {
    return this.config.get<string>('COOKIE_SECURE') === 'true';
  }
}
