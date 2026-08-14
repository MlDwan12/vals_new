import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagsAdminController } from './api/tags-admin.controller';
import { TagsController } from './api/tags.controller';
import { TagsService } from './application/tags.service';
import { Tag } from './domain/tag.entity';
import { TagsRepository } from './infrastructure/tags.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Tag])],
  controllers: [TagsController, TagsAdminController],
  providers: [TagsService, TagsRepository],
  exports: [TagsRepository],
})
export class TagsModule {}
