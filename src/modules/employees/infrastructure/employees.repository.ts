import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { applyDefinedFields } from '../../../core/persistence/apply-defined-fields.util';
import { Employee } from '../domain/employee.entity';

interface CreateEmployeeRecord {
  slug: string;
  name: string;
  position: string;
  photoUrl?: string;
  shortBio?: string;
  bio?: Record<string, unknown>;
  bioHtml?: string;
  experience?: string;
  sameAs?: string[];
  metaTitle?: string;
  metaDescription?: string;
  priority?: number;
  isVisible?: boolean;
}

type UpdateEmployeeRecord = Partial<CreateEmployeeRecord>;

@Injectable()
export class EmployeesRepository {
  constructor(
    @InjectRepository(Employee) private readonly repo: Repository<Employee>,
  ) {}

  findByIds(ids: number[]): Promise<Employee[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({ where: { id: In(ids) }, select: { id: true } });
  }

  findById(id: number): Promise<Employee | null> {
    return this.repo.findOne({ where: { id } });
  }

  create(data: CreateEmployeeRecord): Promise<Employee> {
    return this.repo.save(this.repo.create(data));
  }

  // repo.update() не годится — QueryDeepPartialEntity не принимает jsonb-поля (bio) как плоский
  // объект, поэтому патчим уже загруженную сущность и сохраняем целиком.
  async update(
    id: number,
    patch: UpdateEmployeeRecord,
  ): Promise<Employee | null> {
    const employee = await this.findById(id);
    if (!employee) return null;

    applyDefinedFields(employee, patch);
    return this.repo.save(employee);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  // Админ-таблица — все сотрудники, включая скрытых, с пагинацией.
  findAndCount(page: number, limit: number): Promise<[Employee[], number]> {
    return this.repo.findAndCount({
      order: { priority: 'DESC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  // Публичный эндпоинт — блок «Команда» на «О компании».
  findPublishedList(): Promise<Employee[]> {
    return this.repo.find({
      where: { isVisible: true },
      order: { priority: 'DESC', id: 'ASC' },
    });
  }

  // Публичный эндпоинт — персональная страница /ob-avtore/:slug.
  findBySlugPublished(slug: string): Promise<Employee | null> {
    return this.repo.findOne({ where: { slug, isVisible: true } });
  }
}
