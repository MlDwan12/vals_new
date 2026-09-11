import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Audit } from '../../../core/decorators/audit.decorator';
import { Perm } from '../../../core/decorators/perm.decorator';
import { AuthenticatedRequestUser } from '../../../core/guards/auth.guard';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { RoleResponseDto } from '../../roles/dto/role-response.dto';
import { UsersService } from '../application/users.service';
import { ChangeUserRoleDto } from '../dto/change-user-role.dto';
import { CreateUserWithRoleDto } from '../dto/create-user-with-role.dto';
import { ExpiringUsersQueryDto } from '../dto/expiring-users-query.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { SetAccessExpiryDto } from '../dto/set-access-expiry.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedRequestUser;
}

const DEFAULT_EXPIRING_DAYS = 14;

@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

  // Три легаси-ручки создания (/admin/users/content-managers|client-managers|admins) удалены
  // в срезе A.4 вместе с переводом админки на POST /admin/users: роль там фиксировалась путём,
  // а createWithRole() не проверял актёра — единственное место в модуле, где можно было завести
  // пользователя роли старше своей. Заодно ушёл последний @Roles() в проекте.
  @Post()
  @Perm(PERMISSIONS.USERS_MANAGE)
  async create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateUserWithRoleDto,
  ): Promise<void> {
    await this.usersService.createWithRoleId(req.user, dto);
  }

  // До @Get(':id') — Nest матчит роуты в порядке объявления, иначе 'assignable-roles' уехало бы
  // в ParseIntPipe как id.
  @Get('assignable-roles')
  @Perm(PERMISSIONS.USERS_MANAGE)
  findAssignableRoles(@Req() req: RequestWithUser): Promise<RoleResponseDto[]> {
    return this.usersService.findAssignableRoles(req.user);
  }

  @Get('expiring')
  @Perm(PERMISSIONS.USERS_MANAGE)
  findExpiring(
    @Query() query: ExpiringUsersQueryDto,
  ): Promise<UserResponseDto[]> {
    return this.usersService.findExpiring(query.days ?? DEFAULT_EXPIRING_DAYS);
  }

  @Get()
  @Perm(PERMISSIONS.USERS_MANAGE)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    return this.usersService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Perm(PERMISSIONS.USERS_MANAGE)
  findById(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @Perm(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'role_change' })
  changeRole(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeUserRoleDto,
  ): Promise<UserResponseDto> {
    return this.usersService.changeRole(req.user, id, dto);
  }

  @Patch(':id/access-expiry')
  @Perm(PERMISSIONS.USERS_MANAGE)
  @Audit({ action: 'access_expiry_change' })
  setAccessExpiry(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAccessExpiryDto,
  ): Promise<UserResponseDto> {
    return this.usersService.setAccessExpiry(req.user, id, dto);
  }

  // Отдельное право от users.manage (EXPANSION_TASKS.md §1.6) — сброс чужого пароля отдаёт чужую
  // личность, это доверие другого уровня.
  @Patch(':id/password')
  @Perm(PERMISSIONS.USERS_RESET_PASSWORD)
  @Audit({ action: 'password_reset' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.usersService.resetPassword(req.user, id, dto);
  }

  // users.manage, а не developer-only: рангом и is_system цель защищена в самом сервисе
  // (canManageTargetUser), а держатель права уже может сменить цели роль и срок доступа
  // соседними ручками — запрет на переименование/отключение был только легаси-перекосом.
  @Patch(':id')
  @Perm(PERMISSIONS.USERS_MANAGE)
  update(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(req.user, id, dto);
  }

  @Delete(':id')
  @Perm(PERMISSIONS.USERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.usersService.remove(req.user, id);
  }
}
