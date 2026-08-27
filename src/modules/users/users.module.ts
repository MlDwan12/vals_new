import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesModule } from '../roles/roles.module';
import { UsersAdminController } from './api/users-admin.controller';
import { AuthContextService } from './application/auth-context.service';
import { UsersService } from './application/users.service';
import { User } from './domain/user.entity';
import { UsersRepository } from './infrastructure/users.repository';

@Module({
  imports: [TypeOrmModule.forFeature([User]), RolesModule],
  controllers: [UsersAdminController],
  providers: [UsersService, UsersRepository, AuthContextService],
  exports: [UsersService, AuthContextService],
})
export class UsersModule {}
