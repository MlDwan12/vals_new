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
import { ADMIN_ROLES } from '../../../core/enums/role-groups.constant';
import { Role } from '../../../core/enums/role.enum';
import { Perm } from '../../../core/decorators/perm.decorator';
import { Roles } from '../../../core/decorators/roles.decorator';
import { AuthenticatedRequestUser } from '../../../core/guards/auth.guard';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { UsersService } from '../application/users.service';
import { ChangeUserRoleDto } from '../dto/change-user-role.dto';
import { CreateUserDto } from '../dto/create-user.dto';
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

  // --- Легаси-путь (роль фиксирована путём, не телом) — не трогаем, фронта под перевод на
  // POST /admin/users нет в этой сессии (EXPANSION_TASKS.md §1.7).
  @Post('content-managers')
  @Roles(...ADMIN_ROLES)
  async createContentManager(@Body() dto: CreateUserDto): Promise<void> {
    await this.usersService.createWithRole(
      dto.username,
      dto.password,
      Role.CONTENT_MANAGER,
    );
  }

  @Post('client-managers')
  @Roles(...ADMIN_ROLES)
  async createClientManager(@Body() dto: CreateUserDto): Promise<void> {
    await this.usersService.createWithRole(
      dto.username,
      dto.password,
      Role.CLIENT_MANAGER,
    );
  }

  @Post('admins')
  @Roles(Role.DEVELOPER)
  async createAdmin(@Body() dto: CreateUserDto): Promise<void> {
    await this.usersService.createWithRole(
      dto.username,
      dto.password,
      Role.ADMIN,
    );
  }

  // --- Новый универсальный путь (EXPANSION_TASKS.md §1) — под любую роль, включая заведённые
  // из панели.
  @Post()
  @Perm(PERMISSIONS.USERS_MANAGE)
  async create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateUserWithRoleDto,
  ): Promise<void> {
    await this.usersService.createWithRoleId(req.user, dto);
  }

  @Get('expiring')
  @Perm(PERMISSIONS.USERS_MANAGE)
  findExpiring(
    @Query() query: ExpiringUsersQueryDto,
  ): Promise<UserResponseDto[]> {
    return this.usersService.findExpiring(query.days ?? DEFAULT_EXPIRING_DAYS);
  }

  @Get()
  @Roles(...ADMIN_ROLES)
  paginate(
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResult<UserResponseDto>> {
    return this.usersService.paginate(query.page, query.limit);
  }

  @Get(':id')
  @Roles(...ADMIN_ROLES)
  findById(@Param('id', ParseIntPipe) id: number): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }

  @Patch(':id/role')
  @Perm(PERMISSIONS.USERS_MANAGE)
  changeRole(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeUserRoleDto,
  ): Promise<UserResponseDto> {
    return this.usersService.changeRole(req.user, id, dto);
  }

  @Patch(':id/access-expiry')
  @Perm(PERMISSIONS.USERS_MANAGE)
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
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    await this.usersService.resetPassword(req.user, id, dto);
  }

  @Patch(':id')
  @Roles(Role.DEVELOPER)
  update(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(req.user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.DEVELOPER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.usersService.remove(req.user, id);
  }
}
