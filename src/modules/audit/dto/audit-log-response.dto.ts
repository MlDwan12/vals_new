import { AuditLog } from '../domain/audit-log.entity';

export class AuditLogResponseDto {
  id: number;
  userId: number | null;
  username: string | null;
  role: string | null;
  action: string;
  method: string;
  path: string;
  resource: string | null;
  resourceId: number | null;
  statusCode: number;
  errorMessage: string | null;
  ip: string | null;
  createdAt: Date;

  static fromEntity(log: AuditLog): AuditLogResponseDto {
    const dto = new AuditLogResponseDto();
    dto.id = log.id;
    dto.userId = log.userId;
    dto.username = log.username;
    dto.role = log.role;
    dto.action = log.action;
    dto.method = log.method;
    dto.path = log.path;
    dto.resource = log.resource;
    dto.resourceId = log.resourceId;
    dto.statusCode = log.statusCode;
    dto.errorMessage = log.errorMessage;
    dto.ip = log.ip;
    dto.createdAt = log.createdAt;
    return dto;
  }
}
