// SPDX-License-Identifier: Apache-2.0
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  it('render counter, duration và in-flight theo Prometheus text', () => {
    const metrics = new MetricsService();
    metrics.startRequest();
    metrics.recordRequest('GET', '/api/orders', 200, 12.5);
    metrics.finishRequest();
    metrics.recordRequest('GET', '/api/orders', 500, 7.5);

    const text = metrics.render();
    expect(text).toContain(
      'http_requests_total{method="GET",route="/api/orders",status="200"} 1',
    );
    expect(text).toContain(
      'http_requests_total{method="GET",route="/api/orders",status="500"} 1',
    );
    expect(text).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/orders"} 2',
    );
    expect(text).toContain(
      'http_request_duration_seconds_sum{method="GET",route="/api/orders"} 0.020000',
    );
    expect(text).toContain('http_requests_in_flight 0');
    expect(text).toContain('app_info{name="ordertower-api"');
  });

  it('escape nhãn có dấu nháy và xuống dòng', () => {
    const metrics = new MetricsService();
    metrics.recordRequest('GET', '/a"b\nc', 200, 1);
    expect(metrics.render()).toContain('route="/a\\"b\\nc"');
  });
});
