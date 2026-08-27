import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsAdminController } from './api/permissions-admin.controller';
import { RolesAdminController } from './api/roles-admin.controller';
import { RolesService } from './application/roles.service';
import { Permission } from './domain/permission.entity';
import { Role } from './domain/role.entity';
import { PermissionsRepository } from './infrastructure/permissions.repository';
import { RolesRepository } from './infrastructure/roles.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  controllers: [RolesAdminController, PermissionsAdminController],
  providers: [RolesService, RolesRepository, PermissionsRepository],
  // PermissionsRepository используется только внутри этого модуля (RolesService,
  // PermissionsAdminController) — наружу нужен лишь RolesRepository (UsersService).
  exports: [RolesRepository],
})
export class RolesModule {}
