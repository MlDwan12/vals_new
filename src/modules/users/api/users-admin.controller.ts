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
} from '@nestjs/common';
import { ADMIN_ROLES } from '../../../core/enums/role-groups.constant';
import { Role } from '../../../core/enums/role.enum';
import { Roles } from '../../../core/decorators/roles.decorator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { UsersService } from '../application/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';

@Controller('admin/users')
export class UsersAdminController {
  constructor(private readonly usersService: UsersService) {}

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

  @Patch(':id')
  @Roles(Role.DEVELOPER)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.DEVELOPER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.usersService.remove(id);
  }
}
