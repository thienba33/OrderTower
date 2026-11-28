// SPDX-License-Identifier: Apache-2.0
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AutomationService } from './automation.service';
import type { AutomationJobName } from './automation.types';

const START_DELAY_MS = 5_000;

// Scheduler nội bộ, không thêm dependency: mỗi job một interval, chống chạy
// chồng bằng inFlight của AutomationService. Job chỉ ghi notification/run log,
// không tự đổi trạng thái nghiệp vụ.
@Injectable()
export class AutomationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationScheduler.name);
  private readonly timers: Array<ReturnType<typeof setInterval>> = [];
  private readonly initialRuns: Array<ReturnType<typeof setTimeout>> = [];

  constructor(private readonly automation: AutomationService) {}

  onModuleInit(): void {
    if (!this.automation.enabled) {
      this.logger.log('Automation scheduler đang tắt (AUTOMATION_ENABLED=0 hoặc test).');
      return;
    }
    this.schedule('outbox-relay', this.automation.outboxIntervalMs);
    this.schedule('sla-scan', this.automation.slaIntervalMs);
    // Archive nặng hơn; cho API ổn định rồi mới chạy lần đầu.
    this.schedule(
      'lakehouse-archive',
      this.automation.archiveIntervalMs,
      30_000,
    );
    this.logger.log(
      `Automation scheduler bật: outbox ${this.automation.outboxIntervalMs}ms, SLA ${this.automation.slaIntervalMs}ms, archive ${this.automation.archiveIntervalMs}ms.`,
    );
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    for (const timer of this.initialRuns) {
      clearTimeout(timer);
    }
    this.timers.length = 0;
    this.initialRuns.length = 0;
  }

  private schedule(
    job: AutomationJobName,
    intervalMs: number,
    initialDelayMs = START_DELAY_MS,
  ): void {
    const initial = setTimeout(() => void this.tick(job), initialDelayMs);
    initial.unref?.();
    this.initialRuns.push(initial);
    const timer = setInterval(() => void this.tick(job), intervalMs);
    timer.unref?.();
    this.timers.push(timer);
  }

  private async tick(job: AutomationJobName): Promise<void> {
    try {
      await this.automation.run(job, 'schedule');
    } catch (error) {
      // Conflict do lần chạy trước chưa xong là bình thường; lỗi thật đã được
      // ghi vào automation_runs và log bởi AutomationService.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('đang chạy')) {
        this.logger.warn(`Job ${job} không chạy được: ${message}`);
      }
    }
  }
}
