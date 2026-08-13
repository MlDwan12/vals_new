import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AuthController } from './api/auth.controller';
import { AuthService } from './application/auth.service';
import { RefreshSession } from './domain/refresh-session.entity';
import { LoginUsernameThrottleGuard } from './guards/login-username-throttle.guard';
import { RefreshAuthGuard } from './guards/refresh-auth.guard';
import { RefreshSessionsRepository } from './infrastructure/refresh-sessions.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshStrategy } from './strategies/refresh.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshSession]),
    PassportModule,
    JwtModule.register({}),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshSessionsRepository,
    JwtStrategy,
    RefreshStrategy,
    RefreshAuthGuard,
    LoginUsernameThrottleGuard,
  ],
})
export class AuthModule {}
