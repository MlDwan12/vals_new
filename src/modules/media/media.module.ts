import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MediaAdminController } from './api/media-admin.controller';
import { MediaService } from './application/media.service';
import { Media } from './domain/media.entity';
import { MediaRepository } from './infrastructure/media.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Media])],
  controllers: [MediaAdminController],
  providers: [MediaService, MediaRepository],
})
export class MediaModule {}
