import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../roles/domain/role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar', select: false })
  password: string;

  @Column({ name: 'role_id' })
  roleId: number;

  // RESTRICT — как Service.category (service.entity.ts) — удалить роль с живыми пользователями
  // физически невозможно без единой строчки бизнес-логики (EXPANSION_TASKS.md §1.4).
  @ManyToOne(() => Role, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  // Отключение аккаунта должно действовать немедленно (ТЗ §5) — проверяется на каждом запросе
  // через AuthContextService, не только на refresh (EXPANSION_TASKS.md §1.4).
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  // null — бессрочно (владельцы/системные роли). Истёкший доступ отклоняется отдельным
  // сообщением, отличным от "неверный пароль"/"аккаунт отключён" (EXPANSION_TASKS.md §1.3/1.6).
  @Column({ name: 'access_expires_at', type: 'timestamptz', nullable: true })
  accessExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
