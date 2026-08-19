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

  // Атомарно: WHERE revoked_at IS NULL защищает от гонки двух параллельных refresh одним
  // токеном (без этого условия оба UPDATE проходят и обе цепочки токенов остаются живы).
  // affected === 0 означает, что сессия уже была отозвана кем-то ещё — вызывающий код должен
  // трактовать это как повторное использование отозванного токена.
  async revoke(id: number): Promise<boolean> {
    const result = await this.repo.update(
      { id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
