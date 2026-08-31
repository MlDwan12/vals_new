import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Service } from './service.entity';

// "Смотрите также" — редакторская перелинковка между услугами (EXPANSION_TASKS.md задача 9).
// Однонаправленная связь с порядком: service → relatedService, обратного зеркалирования нет —
// список A не обязан совпадать со списком B, это осознанный выбор контент-менеджера, не
// симметричное отношение. Оба FK — CASCADE: это чисто редакторская ссылка, не структурная
// зависимость вроде landings.service_id (§10.1), удаление любой из двух услуг просто убирает
// ссылку, не блокируется.
@Entity('service_relations')
@Index('IDX_service_relations_pair_unique', ['service', 'relatedService'], {
  unique: true,
})
@Index('IDX_service_relations_order_unique', ['service', 'order'], {
  unique: true,
})
export class ServiceRelation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'service_id' })
  serviceId: number;

  @ManyToOne(() => Service, (service) => service.relatedServices, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'service_id' })
  service: Service;

  @Column({ name: 'related_service_id' })
  relatedServiceId: number;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'related_service_id' })
  relatedService: Service;

  @Column({ type: 'int' })
  order: number;
}
