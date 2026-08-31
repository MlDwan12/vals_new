import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
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
  async submit(
    @Body() dto: CreateLeadDto,
    @Req() request: Request,
  ): Promise<void> {
    // Сырой заголовок, без обрезки — обрезка (и решение, нужна ли она вообще) откладывается до
    // LeadsService.submit(), которая может выйти раньше по honeypot и не тратить на это время
    // (User-Agent берётся с сервера, а не с фронта — тот же заголовок, что уже читает
    // fingerprintOf() в auth.controller.ts).
    await this.leadsService.submit(dto, request.headers['user-agent'] ?? null);
  }
}
