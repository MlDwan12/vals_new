import { Module } from '@nestjs/common';
import { ContentHtmlService } from './content-html.service';

// Отдельный модуль, а не провайдер в CoreModule: CoreModule собирает глобальные guard'ы,
// интерсепторы и фильтр, наружу ничего не экспортирует, а этот сервис нужен пяти модулям с
// контентом (статьи, кейсы, новости, лендинги, сотрудники).
@Module({
  providers: [ContentHtmlService],
  exports: [ContentHtmlService],
})
export class ContentModule {}
