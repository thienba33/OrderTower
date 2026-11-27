// SPDX-License-Identifier: Apache-2.0
import { InMemoryAddressProposalStore } from './address-proposal.store';
import { AddressProposal } from './address.types';

function makeProposal(overrides: Partial<AddressProposal> = {}): AddressProposal {
  const now = '2026-11-27T00:00:00.000Z';
  return {
    id: 'AC-1001',
    orderId: 'DH-1001',
    status: 'Chờ duyệt',
    source: 'rules',
    before: {
      address: {
        province: 'Hà Nội',
        ward: 'Phường Trần Hưng Đạo',
        street: 'Số 12 ngõ 34 phố Hàng Bè',
      },
      trust: 60,
      level: 'Rủi ro cao',
      reasons: ['Phường cũ "Phường Trần Hưng Đạo" đã sáp nhập toàn bộ thành "Phường Cửa Nam".'],
    },
    after: {
      address: {
        province: 'Hà Nội',
        ward: 'Phường Cửa Nam',
        street: 'Số 12 ngõ 34 phố Hàng Bè',
      },
      trust: 100,
      level: 'Tin cậy cao',
      reasons: ['Phường cũ "Phường Trần Hưng Đạo" đã sáp nhập toàn bộ thành "Phường Cửa Nam".'],
    },
    requestedBy: 'dispatcher1',
    requestedAt: now,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    appliedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('InMemoryAddressProposalStore', () => {
  it('lưu rồi đọc lại được đúng đề xuất', async () => {
    const store = new InMemoryAddressProposalStore();
    const proposal = makeProposal();
    await store.save(proposal);
    expect(await store.findById('AC-1001')).toEqual(proposal);
    expect(await store.findById('AC-9999')).toBeNull();
  });

  it('đọc ra là bản sao: sửa bản đọc ra không làm đổi bản đã lưu', async () => {
    const store = new InMemoryAddressProposalStore();
    await store.save(makeProposal());
    const first = await store.findById('AC-1001');
    first!.status = 'Đã áp dụng';
    expect((await store.findById('AC-1001'))!.status).toBe('Chờ duyệt');
  });

  it('update đổi trạng thái và người quyết định', async () => {
    const store = new InMemoryAddressProposalStore();
    const proposal = makeProposal();
    await store.save(proposal);
    proposal.status = 'Đã từ chối';
    proposal.decidedBy = 'dispatcher1';
    proposal.decidedAt = '2026-11-27T01:00:00.000Z';
    proposal.decisionReason = 'Địa chỉ sai phường.';
    await store.update(proposal);
    const found = await store.findById('AC-1001');
    expect(found!.status).toBe('Đã từ chối');
    expect(found!.decisionReason).toBe('Địa chỉ sai phường.');
  });

  it('listByOrderId chỉ trả đề xuất của đơn đó, mới nhất trước', async () => {
    const store = new InMemoryAddressProposalStore();
    await store.save(makeProposal({ id: 'AC-1001', createdAt: '2026-11-27T00:00:00.000Z' }));
    await store.save(makeProposal({ id: 'AC-1002', createdAt: '2026-11-27T02:00:00.000Z' }));
    await store.save(makeProposal({ id: 'AC-1003', orderId: 'DH-1002' }));
    const list = await store.listByOrderId('DH-1001');
    expect(list.map((p) => p.id)).toEqual(['AC-1002', 'AC-1001']);
  });

  it('listIds trả toàn bộ id để nối số thứ tự', async () => {
    const store = new InMemoryAddressProposalStore();
    await store.save(makeProposal({ id: 'AC-1001' }));
    await store.save(makeProposal({ id: 'AC-1002' }));
    expect((await store.listIds()).sort()).toEqual(['AC-1001', 'AC-1002']);
  });
});
