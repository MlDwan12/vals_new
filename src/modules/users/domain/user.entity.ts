import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from '../../../core/enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar', select: false })
  password: string;

  // Пока без CHECK/enum на уровне БД — добавляется в этапе 2 вместе с остальной auth-схемой
  // (createdAt/updatedAt/isActive тоже туда, см. _docs/rewrite-log.md).
  @Index()
  @Column({ type: 'varchar', length: 32, default: Role.CONTENT_MANAGER })
  role: Role;
}
