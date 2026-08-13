import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../../core/enums/role.enum';

@Entity('users')
@Check(
  `"role" IN (${Object.values(Role)
    .map((role) => `'${role}'`)
    .join(', ')})`,
)
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar', select: false })
  password: string;

  @Index()
  @Column({ type: 'varchar', length: 32, default: Role.CONTENT_MANAGER })
  role: Role;

  // Отключение аккаунта должно действовать немедленно (ТЗ §5) — проверяется на каждом refresh.
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
