import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from './domain/media.entity';
import { ImageLibItem } from './domain/image-lib-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Media, ImageLibItem])],
})
export class MediaModule {}
