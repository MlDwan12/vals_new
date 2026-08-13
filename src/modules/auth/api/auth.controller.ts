import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { EnvConfig } from '../../../config/env.validation';
import {
  clearAuthCookies,
  setAuthCookies,
} from '../../../core/cookies/auth-cookies';
import { Public } from '../../../core/decorators/public.decorator';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../auth.constants';
import { AuthService, AuthTokens } from '../application/auth.service';
import { LoginDto } from '../dto/login.dto';
import { LoginUsernameThrottleGuard } from '../guards/login-username-throttle.guard';
import { RefreshAuthGuard } from '../guards/refresh-auth.guard';
import { AccessTokenPayload } from '../strategies/jwt.strategy';
import { RefreshTokenPayload } from '../strategies/refresh.strategy';

interface RequestWithRefreshUser extends Request {
  user: RefreshTokenPayload;
}

interface RequestWithAccessUser extends Request {
  user: AccessTokenPayload;
}

interface WhoAmI {
  username: string;
  role: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(LoginUsernameThrottleGuard)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WhoAmI> {
    const user = await this.authService.validateUser(
      dto.username,
      dto.password,
    );
    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const tokens = await this.authService.login(user, fingerprintOf(req));
    this.setCookies(res, tokens);

    return { username: user.username, role: user.role };
  }

  @Public()
  @UseGuards(RefreshAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: RequestWithRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const tokens = await this.authService.refresh(req.user, fingerprintOf(req));
    this.setCookies(res, tokens);
    return { message: 'refreshed' };
  }

  @Public()
  @UseGuards(RefreshAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @Req() req: RequestWithRefreshUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.authService.logout(req.user);
    clearAuthCookies(res, this.configService);
    return { message: 'logged out' };
  }

  @Get('me')
  async me(@Req() req: RequestWithAccessUser): Promise<WhoAmI> {
    const user = await this.authService.getMe(req.user.sub);
    return { username: user.username, role: user.role };
  }

  private setCookies(res: Response, tokens: AuthTokens): void {
    setAuthCookies(res, this.configService, tokens, {
      accessMs: ACCESS_TOKEN_TTL_SECONDS * 1000,
      refreshMs: REFRESH_TOKEN_TTL_SECONDS * 1000,
    });
  }
}

function fingerprintOf(req: Request): string {
  const userAgent = req.headers['user-agent'] ?? 'unknown';
  return `${req.ip ?? 'unknown'} | ${userAgent}`.slice(0, 512);
}
