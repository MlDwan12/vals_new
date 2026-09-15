import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Audit } from '../../../core/decorators/audit.decorator';
import { Perm } from '../../../core/decorators/perm.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { PERMISSIONS } from '../../../core/permissions/permission.registry';
import { ClientLeadsAdminService } from '../application/client-leads-admin.service';
import { ClientLeadContactsResponseDto } from '../dto/client-lead-contacts-response.dto';
import { ClientLeadListQueryDto } from '../dto/client-lead-list-query.dto';
import { ClientLeadResponseDto } from '../dto/client-lead-response.dto';
import { AdminLeadFacets } from '../infrastructure/client-leads.repository';

@Controller('admin/client-leads')
export class ClientLeadsAdminController {
  constructor(
    private readonly clientLeadsAdminService: ClientLeadsAdminService,
  ) {}

  @Get()
  @Perm(PERMISSIONS.CLIENTS_READ)
  findAndCount(
    @Query() query: ClientLeadListQueryDto,
  ): Promise<PaginatedResult<ClientLeadResponseDto>> {
    return this.clientLeadsAdminService.findAndCount(query);
  }

  // Значения для селектов фильтра. Объявлен до @Get(':id') — иначе 'facets' ушёл бы в
  // ParseIntPipe параметрического маршрута и отдал 400.
  @Get('facets')
  @Perm(PERMISSIONS.CLIENTS_READ)
  findFacets(): Promise<AdminLeadFacets> {
    return this.clientLeadsAdminService.findFacets();
  }

  @Get('client/:clientId')
  @Perm(PERMISSIONS.CLIENTS_READ)
  findByClientId(
    @Param('clientId', ParseIntPipe) clientId: number,
  ): Promise<ClientLeadResponseDto[]> {
    return this.clientLeadsAdminService.findByClientId(clientId);
  }

  @Get(':id')
  @Perm(PERMISSIONS.CLIENTS_READ)
  findById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientLeadResponseDto> {
    return this.clientLeadsAdminService.findById(id);
  }

  // Полные контакты заявки. POST, а не GET, хотя ничего не меняет: журнал действий пишет только
  // мутирующие методы, а каждый просмотр персональных данных должен остаться в нём — кто, когда,
  // чью заявку (resourceId). Отказ без права пишется туда же, HttpExceptionFilter'ом.
  // Лимит строже общего: кнопка «Показать контакты» нужна по одной заявке, а не подряд по всему
  // списку.
  @Post(':id/contacts')
  @Perm(PERMISSIONS.CLIENTS_VIEW_CONTACTS)
  @Audit({ action: 'contacts_view' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  findContacts(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ClientLeadContactsResponseDto> {
    return this.clientLeadsAdminService.findContacts(id);
  }

  @Post(':id/retry')
  @Perm(PERMISSIONS.CLIENTS_WRITE)
  retry(@Param('id', ParseIntPipe) id: number): Promise<ClientLeadResponseDto> {
    return this.clientLeadsAdminService.retry(id);
  }
}
