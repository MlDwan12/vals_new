import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RefreshSession } from '../domain/refresh-session.entity';

interface CreateSessionRecord {
  jti: string;
  userId: number;
  fingerprint: string | null;
  expiresAt: Date;
}

@Injectable()
export class RefreshSessionsRepository {
  constructor(
    @InjectRepository(RefreshSession)
    private readonly repo: Repository<RefreshSession>,
  ) {}

  findByJti(jti: string): Promise<RefreshSession | null> {
    return this.repo.findOne({ where: { jti } });
  }

  create(data: CreateSessionRecord): Promise<RefreshSession> {
    return this.repo.save(this.repo.create({ ...data, revokedAt: null }));
  }

  async revoke(id: number): Promise<void> {
    await this.repo.update(id, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
