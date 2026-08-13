import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Article } from './domain/article.entity';
import { ArticleFaq } from './domain/article-faq.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Article, ArticleFaq])],
})
export class ArticlesModule {}
