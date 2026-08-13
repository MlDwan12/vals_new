import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from './domain/tag.entity';
import { TagsRepository } from './infrastructure/tags.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Tag])],
  providers: [TagsRepository],
  exports: [TagsRepository],
})
export class TagsModule {}
