import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Service } from '../../services/domain/service.entity';

interface BillingCycle {
  periodId: number | null;
  monthCount: number | null;
  pricePerMonth: number | null;
  discountPercent: number | null;
  totalPrice: number;
}

@Entity('tariffs')
export class Tariff {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'service_id', nullable: true })
  serviceId: number | null;

  @ManyToOne(() => Service, (service) => service.tariffs, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'service_id' })
  service: Service | null;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'varchar', length: 128 })
  from: string;

  @Column({ type: 'text' })
  features: string;

  @Column({ name: 'is_popular', type: 'boolean', default: false })
  isPopular: boolean;

  @Column({ name: 'billing_cycles', type: 'jsonb', default: () => "'[]'" })
  billingCycles: BillingCycle[];

  @Column({ name: 'base_price', type: 'int', nullable: true })
  basePrice: number | null;

  @Column({ name: 'order_index', type: 'int', default: 0 })
  orderIndex: number;
}
