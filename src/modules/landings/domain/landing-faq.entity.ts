import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Landing } from './landing.entity';

@Entity('landing_faq')
export class LandingFaq {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'landing_id' })
  landingId: number;

  @ManyToOne(() => Landing, (landing) => landing.faq, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'landing_id' })
  landing: Landing;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'text' })
  answer: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
