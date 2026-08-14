import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { TagsService } from '../application/tags.service';
import { TagPublicListQueryDto } from '../dto/tag-public-list-query.dto';
import { TagResponseDto } from '../dto/tag-response.dto';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Public()
  @Get()
  findPublicList(
    @Query() query: TagPublicListQueryDto,
  ): Promise<TagResponseDto[]> {
    return this.tagsService.findPublicList(query.type);
  }
}
