// SPDX-License-Identifier: Apache-2.0
import {
  InMemoryIdSequenceStore,
  IdSequenceService,
  PostgresIdSequenceStore,
} from './id-sequence';
import { createTestDbService } from './test-helpers';

describe('IdSequenceService', () => {
  it('bộ nhớ cấp tuần tự và tách theo tên', async () => {
    const service = new IdSequenceService(new InMemoryIdSequenceStore());
    await expect(service.next('order:DH', 1001)).resolves.toBe(1001);
    await expect(service.next('order:DH', 1001)).resolves.toBe(1002);
    await expect(service.next('order:LS', 1001)).resolves.toBe(1001);
    await expect(service.next('workflow:WF', 1001)).resolves.toBe(1001);
  });

  it('Postgres counter cấp tuần tự và không quay lui khi initial thấp hơn', async () => {
    const db = await createTestDbService();
    const service = new IdSequenceService(new PostgresIdSequenceStore(db));
    await expect(service.next('order:DH', 1001)).resolves.toBe(1001);
    await expect(service.next('order:DH', 1001)).resolves.toBe(1002);
    // DB đã restore từ bản có ID lớn hơn: initial thắng counter cũ.
    await expect(service.next('order:DH', 2000)).resolves.toBe(2000);
    await expect(service.next('order:DH', 1001)).resolves.toBe(2001);
    await expect(service.next('order:LS', 1001)).resolves.toBe(1001);
  });

  it('từ chối tên rỗng hoặc initial không hợp lệ', async () => {
    const service = new IdSequenceService(new InMemoryIdSequenceStore());
    await expect(service.next('', 1)).rejects.toThrow('Tên bộ đếm');
    await expect(service.next('order:DH', 0)).rejects.toThrow(
      'số nguyên dương',
    );
  });
});
