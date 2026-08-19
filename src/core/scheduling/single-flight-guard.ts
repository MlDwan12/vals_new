import { PinoLogger } from 'nestjs-pino';

// Общий приём для @Cron-обработчиков, чей тик может растянуться дольше интервала расписания
// (полный reindex/доставка лидов) — без него следующий тик наложился бы на ещё выполняющийся.
// Было 4 независимые копии одного и того же isRunning-флага + try/finally (reuse/altitude review).
export class SingleFlightGuard {
  private isRunning = false;

  constructor(
    private readonly logger: PinoLogger,
    private readonly label: string,
  ) {}

  async run(fn: () => Promise<void>): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        `Previous ${this.label} tick is still running, skipping this one`,
      );
      return;
    }

    this.isRunning = true;
    try {
      await fn();
    } finally {
      this.isRunning = false;
    }
  }
}
