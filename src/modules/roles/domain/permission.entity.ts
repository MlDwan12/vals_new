import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Заводится только сидом (миграция AddRolesAndPermissions) — из панели не редактируется
// (EXPANSION_TASKS.md §1.2), поэтому здесь нет create/update-путей вообще.
@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 64 })
  group: string;
}
