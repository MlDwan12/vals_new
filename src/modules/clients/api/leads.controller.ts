import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../core/decorators/public.decorator';
import { LeadsService } from '../application/leads.service';
import { CreateLeadDto } from '../dto/create-lead.dto';

// Путь сохранён как в старом контракте (POST /bitrix) — публичная форма сайта уже шлёт сюда,
// переименование потребовало бы синхронной правки фронта без содержательной причины (CLAUDE.md §4).
@Controller('bitrix')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  async submit(@Body() dto: CreateLeadDto): Promise<void> {
    await this.leadsService.submit(dto);
  }
}
