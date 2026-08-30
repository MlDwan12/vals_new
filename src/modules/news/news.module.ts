import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module';
import { MediaModule } from '../media/media.module';
import { SearchModule } from '../search/search.module';
import { TagsModule } from '../tags/tags.module';
import { NewsAdminController } from './api/news-admin.controller';
import { NewsController } from './api/news.controller';
import { NewsReindexScheduler } from './application/news-reindex.scheduler';
import { NewsService } from './application/news.service';
import { News } from './domain/news.entity';
import { NewsRepository } from './infrastructure/news.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([News]),
    EmployeesModule,
    MediaModule,
    TagsModule,
    SearchModule,
  ],
  controllers: [NewsController, NewsAdminController],
  providers: [NewsService, NewsRepository, NewsReindexScheduler],
  exports: [NewsRepository],
})
export class NewsModule {}
