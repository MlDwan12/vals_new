import { Injectable } from '@nestjs/common';
import {
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Injectable()
export class HealthService {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly typeOrmIndicator: TypeOrmHealthIndicator,
  ) {}

  check(): Promise<HealthCheckResult> {
    return this.healthCheckService.check([
      () => this.typeOrmIndicator.pingCheck('database'),
    ]);
  }
}
