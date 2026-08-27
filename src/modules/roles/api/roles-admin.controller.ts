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
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Perm } from '../../../core/decorators/perm.decorator';
import { AuthenticatedRequestUser } from '../../../core/guards/auth.guard';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { RolesService } from '../application/roles.service';
import { CreateRoleDto } from '../dto/create-role.dto';
import { RoleResponseDto } from '../dto/role-response.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedRequestUser;
}

@Controller('admin/roles')
@Perm(PERMISSIONS.ROLES_MANAGE)
export class RolesAdminController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll(): Promise<RoleResponseDto[]> {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<RoleResponseDto> {
    return this.rolesService.findById(id);
  }

  @Post()
  create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.create(req.user, dto);
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
  ): Promise<RoleResponseDto> {
    return this.rolesService.update(req.user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    await this.rolesService.remove(req.user, id);
  }
}
