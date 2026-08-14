import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesAdminController } from './api/employees-admin.controller';
import { EmployeesController } from './api/employees.controller';
import { EmployeesService } from './application/employees.service';
import { Employee } from './domain/employee.entity';
import { EmployeesRepository } from './infrastructure/employees.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Employee])],
  controllers: [EmployeesController, EmployeesAdminController],
  providers: [EmployeesService, EmployeesRepository],
  exports: [EmployeesRepository],
})
export class EmployeesModule {}
