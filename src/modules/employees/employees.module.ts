import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './domain/employee.entity';
import { EmployeesRepository } from './infrastructure/employees.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Employee])],
  providers: [EmployeesRepository],
  exports: [EmployeesRepository],
})
export class EmployeesModule {}
