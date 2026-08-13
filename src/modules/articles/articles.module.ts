import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module';
import { TagsModule } from '../tags/tags.module';
import { ArticleFaqAdminController } from './api/article-faq-admin.controller';
import { ArticlesAdminController } from './api/articles-admin.controller';
import { ArticlesController } from './api/articles.controller';
import { ArticleFaqService } from './application/article-faq.service';
import { ArticlesService } from './application/articles.service';
import { ArticleFaq } from './domain/article-faq.entity';
import { Article } from './domain/article.entity';
import { ArticleFaqRepository } from './infrastructure/article-faq.repository';
import { ArticlesRepository } from './infrastructure/articles.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, ArticleFaq]),
    EmployeesModule,
    TagsModule,
  ],
  controllers: [
    ArticlesController,
    ArticlesAdminController,
    ArticleFaqAdminController,
  ],
  providers: [
    ArticlesService,
    ArticlesRepository,
    ArticleFaqService,
    ArticleFaqRepository,
  ],
})
export class ArticlesModule {}
