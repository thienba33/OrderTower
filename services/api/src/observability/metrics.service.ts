// SPDX-License-Identifier: Apache-2.0
import { Injectable } from '@nestjs/common';

interface DurationMetric {
  count: number;
  sumSeconds: number;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, number>();
  private readonly durations = new Map<string, DurationMetric>();
  private inFlight = 0;

  startRequest(): void {
    this.inFlight += 1;
  }

  finishRequest(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  recordRequest(
    method: string,
    route: string,
    status: number,
    durationMs: number,
  ): void {
    const requestKey = `${method}|${route}|${status}`;
    this.requests.set(requestKey, (this.requests.get(requestKey) ?? 0) + 1);
    const durationKey = `${method}|${route}`;
    const current = this.durations.get(durationKey) ?? {
      count: 0,
      sumSeconds: 0,
    };
    current.count += 1;
    current.sumSeconds += Math.max(0, durationMs) / 1000;
    this.durations.set(durationKey, current);
  }

  render(): string {
    const lines: string[] = [
      '# HELP http_requests_total Tổng số request HTTP.',
      '# TYPE http_requests_total counter',
    ];
    const requestRows = [...this.requests.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    for (const [key, count] of requestRows) {
      const [method, route, status] = key.split('|');
      lines.push(
        `http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${escapeLabel(status)}"} ${count}`,
      );
    }

    lines.push(
      '# HELP http_request_duration_seconds Thời lượng request HTTP.',
      '# TYPE http_request_duration_seconds summary',
    );
    const durationRows = [...this.durations.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    for (const [key, metric] of durationRows) {
      const [method, route] = key.split('|');
      const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}"`;
      lines.push(
        `http_request_duration_seconds_sum{${labels}} ${metric.sumSeconds.toFixed(6)}`,
        `http_request_duration_seconds_count{${labels}} ${metric.count}`,
      );
    }

    lines.push(
      '# HELP http_requests_in_flight Số request đang xử lý.',
      '# TYPE http_requests_in_flight gauge',
      `http_requests_in_flight ${this.inFlight}`,
      '# HELP app_info Thông tin ứng dụng.',
      '# TYPE app_info gauge',
      `app_info{name="ordertower-api",version="${escapeLabel(process.env.npm_package_version ?? '0.1.0')}"} 1`,
      '',
    );
    return lines.join('\n');
  }
}
