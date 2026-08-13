import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Employee } from '../domain/employee.entity';

@Injectable()
export class EmployeesRepository {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
  ) {}

  findByIds(ids: number[]): Promise<Employee[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) }, select: { id: true } });
  }
}
