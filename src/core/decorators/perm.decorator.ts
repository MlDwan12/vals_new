import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '../permissions/permission.registry';

export const PERM_KEY = 'perm';

// Семантика — И (нужны все перечисленные коды), не ИЛИ: на практике везде используется один код
// за раз, но так семантика однозначна для будущих составных случаев.
export const Perm = (...codes: PermissionCode[]) =>
  SetMetadata(PERM_KEY, codes);
