import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../../core/decorators/roles.decorator';
import { CONTENT_ROLES } from '../../../core/enums/role-groups.constant';
import { TagsService } from '../application/tags.service';
import { CreateTagDto } from '../dto/create-tag.dto';
import { TagResponseDto } from '../dto/tag-response.dto';
import { TagWithCountsResponseDto } from '../dto/tag-with-counts-response.dto';
import { UpdateTagDto } from '../dto/update-tag.dto';

@Controller('admin/tags')
@Roles(...CONTENT_ROLES)
export class TagsAdminController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  create(@Body() dto: CreateTagDto): Promise<TagResponseDto> {
    return this.tagsService.create(dto);
  }

  // Без пагинации — тегов мало, таблице в админке пагинация не нужна, зато нужны
  // articlesCount/casesCount.
  @Get()
  findAllWithCounts(): Promise<TagWithCountsResponseDto[]> {
    return this.tagsService.findAllWithCounts();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<TagResponseDto> {
    return this.tagsService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
  ): Promise<TagResponseDto> {
    return this.tagsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.tagsService.remove(id);
  }
}
