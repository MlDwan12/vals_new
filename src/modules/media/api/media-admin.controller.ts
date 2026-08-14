import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CONTENT_ROLES } from '../../../core/enums/role-groups.constant';
import { MediaService } from '../application/media.service';
import { MediaListQueryDto } from '../dto/media-list-query.dto';
import { MediaResponseDto } from '../dto/media-response.dto';
import { UploadMediaDto } from '../dto/upload-media.dto';
import { MAX_SINGLE_FILE_BYTES } from '../util/media-size-budget.util';

const MAX_FILES_PER_UPLOAD = 10;

@Controller('admin/media')
@Roles(...CONTENT_ROLES)
export class MediaAdminController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  findAndCount(
    @Query() query: MediaListQueryDto,
  ): Promise<PaginatedResult<MediaResponseDto>> {
    return this.mediaService.findAndCount(query);
  }

  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_UPLOAD, {
      limits: {
        fileSize: MAX_SINGLE_FILE_BYTES,
        files: MAX_FILES_PER_UPLOAD,
      },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'image/webp') {
          cb(new BadRequestException('Разрешены только WEBP файлы'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadMediaDto,
  ): Promise<MediaResponseDto[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Файлы не загружены');
    }
    return this.mediaService.upload(files, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.mediaService.remove(id);
  }
}
