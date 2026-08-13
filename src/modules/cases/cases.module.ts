import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Case } from './domain/case.entity';
import { CaseFaq } from './domain/case-faq.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Case, CaseFaq])],
})
export class CasesModule {}
