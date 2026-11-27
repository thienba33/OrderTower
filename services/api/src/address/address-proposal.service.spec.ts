// SPDX-License-Identifier: Apache-2.0
// Kiểm thử AddressProposalService với kho bộ nhớ + đơn/audit giả lập
// (theo mẫu bi.service.spec.ts: service dựng bằng tay, kho thật, service
// ngoài stub bằng object thường). Không cần khởi động NestJS hay Postgres.
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Caller } from '../auth/auth.types';
import { AddressService } from './address.service';
import { AddressProposalService } from './address-proposal.service';
import { InMemoryAddressProposalStore } from './address-proposal.store';
import { AddressInput, AddressProposal } from './address.types';

interface StubOrder {
  id: string;
  state: string;
  address: AddressInput;
}

const CALLER: Caller = {
  userId: 'user-1',
  username: 'dispatcher1',
  roles: ['Điều phối viên'],
};

function buildOrders(): {
  orders: Map<string, StubOrder>;
  findOne: jest.Mock;
  update: jest.Mock;
} {
  const orders = new Map<string, StubOrder>([
    [
      'DH-1001',
      {
        id: 'DH-1001',
        state: 'Mới tạo',
        address: {
          province: 'Hà Nội',
          ward: 'Phường Trần Hưng Đạo',
          district: 'Hoàn Kiếm',
          street: 'Số 12 ngõ 34 phố Hàng Bè',
        },
      },
    ],
    [
      'DH-1002',
      {
        id: 'DH-1002',
        state: 'Hoàn',
        address: {
          province: 'Hà Nội',
          ward: 'Phường Cửa Nam',
          street: 'Số 1 phố Hàng Bè',
        },
      },
    ],
    [
      'DH-1003',
      {
        id: 'DH-1003',
        state: 'Mới tạo',
        address: {
          province: 'Hà Nội',
          ward: 'Phường Cửa Nam',
          street: 'Số 12 ngõ 34 phố Hàng Bè',
        },
      },
    ],
  ]);
  const findOne = jest.fn(async (id: string) => {
    const order = orders.get(id);
    if (!order) throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    return order;
  });
  // Giả lập OrdersService.update: chỉ sửa địa chỉ, chấm lại tin cậy.
  const update = jest.fn(async (id: string, input: { address?: AddressInput }) => {
    const order = orders.get(id);
    if (!order) throw new NotFoundException(`Không tìm thấy đơn ${id}.`);
    if (input.address) order.address = input.address;
    return order;
  });
  return { orders, findOne, update };
}

type LlmStub = {
  enabled: boolean;
  parseAddress: jest.Mock;
};

function buildLlmStub(
  parse: (raw: string) => unknown,
  enabled = true,
): LlmStub {
  return {
    enabled,
    parseAddress: jest.fn(async (raw: string) => parse(raw)),
  };
}

async function buildService(llm?: LlmStub): Promise<{
  service: AddressProposalService;
  store: InMemoryAddressProposalStore;
  orders: Map<string, StubOrder>;
  auditAppend: jest.Mock;
  llm?: LlmStub;
}> {
  const addressService = new AddressService();
  await addressService.onModuleInit();
  const store = new InMemoryAddressProposalStore();
  const { orders, findOne, update } = buildOrders();
  const auditAppend = jest.fn(async () => undefined);
  const service = new AddressProposalService(
    store,
    addressService,
    { findOne, update } as never,
    { append: auditAppend } as never,
    llm as never,
  );
  await service.onModuleInit();
  return { service, store, orders, auditAppend, llm };
}

describe('AddressProposalService.suggest', () => {
  it('mức cao: tự áp dụng vào đơn qua đường sửa đơn có sẵn, ghi audit auto-applied', async () => {
    const { service, orders, auditAppend } = await buildService();
    const response = await service.suggest(CALLER, { orderId: 'DH-1001' });
    expect(response.applied).toBe(true);
    expect(response.proposal).not.toBeNull();
    expect(response.proposal!.status).toBe('Tự áp dụng');
    expect(response.proposal!.id).toBe('AC-1001');
    expect(response.after.address).toEqual({
      province: 'Hà Nội',
      ward: 'Phường Cửa Nam',
      street: 'Số 12 ngõ 34 phố Hàng Bè',
    });
    expect(response.after.trust).toBe(100);
    expect(orders.get('DH-1001')!.address.ward).toBe('Phường Cửa Nam');
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'address-proposal.auto-applied',
        orderId: 'DH-1001',
      }),
    );
  });

  it('mức giữa (thiếu đường, 80): lưu đề xuất Chờ duyệt, chưa áp dụng', async () => {
    const { service, orders, auditAppend } = await buildService();
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Phường Cửa Nam, Hà Nội',
    });
    expect(response.applied).toBe(false);
    expect(response.proposal).not.toBeNull();
    expect(response.proposal!.status).toBe('Chờ duyệt');
    expect(response.after.trust).toBe(80);
    expect(orders.get('DH-1001')!.address.ward).toBe('Phường Trần Hưng Đạo');
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'address-proposal.created',
        orderId: 'DH-1001',
      }),
    );
  });

  it('mức thấp: không có đề xuất áp dụng được, trả danh sách phường đúng', async () => {
    const { service } = await buildService();
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Số 12 ngõ 34 phố Hàng Bè, Hà Nội',
    });
    expect(response.proposal).toBeNull();
    expect(response.applied).toBe(false);
    expect(response.after.trust).toBe(60);
    expect(response.choices!.wards).toHaveLength(126);
    expect(response.choices!.wards).toContain('Phường Cửa Nam');
  });

  it('địa chỉ đã đạt mức cao thì không cần đề xuất', async () => {
    const { service } = await buildService();
    const response = await service.suggest(CALLER, { orderId: 'DH-1003' });
    expect(response.proposal).toBeNull();
    expect(response.applied).toBe(false);
    expect(response.note).toContain('đã đạt độ tin cậy cao');
  });

  it('đơn đã đóng: không tự áp dụng, không lưu đề xuất', async () => {
    const { service, orders } = await buildService();
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1002',
      raw: 'Số 12 ngõ 34 phố Hàng Bè, p. trần hưng đạo, q. hoàn kiếm, hà nội',
    });
    expect(response.proposal).toBeNull();
    expect(response.applied).toBe(false);
    expect(response.note).toContain('Đơn đã đóng');
    expect(orders.get('DH-1002')!.address.ward).toBe('Phường Cửa Nam');
  });

  it('chỉ gửi address, không kèm đơn: trả đề xuất, không lưu, không áp dụng', async () => {
    const { service, store } = await buildService();
    const response = await service.suggest(CALLER, {
      address: {
        province: 'Hà Nội',
        ward: 'Phường Trần Hưng Đạo',
        street: 'Số 12 ngõ 34 phố Hàng Bè',
      },
    });
    expect(response.proposal).toBeNull();
    expect(response.after.address.ward).toBe('Phường Cửa Nam');
    expect(response.after.trust).toBe(100);
    expect(await store.listIds()).toEqual([]);
  });

  it('thiếu cả orderId, raw, address thì 400', async () => {
    const { service } = await buildService();
    await expect(service.suggest(CALLER, {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('gửi cả raw và address thì 400', async () => {
    const { service } = await buildService();
    await expect(
      service.suggest(CALLER, {
        raw: 'Số 12 ngõ 34 phố Hàng Bè, Hà Nội',
        address: { province: 'Hà Nội' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('đơn không tồn tại thì 404', async () => {
    const { service } = await buildService();
    await expect(
      service.suggest(CALLER, { orderId: 'DH-9999' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('id đề xuất nối tiếp AC-1001, AC-1002...', async () => {
    const { service } = await buildService();
    const first = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Phường Cửa Nam, Hà Nội',
    });
    const second = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Phường Hoàn Kiếm, Hà Nội',
    });
    expect(first.proposal!.id).toBe('AC-1001');
    expect(second.proposal!.id).toBe('AC-1002');
  });
});

describe('AddressProposalService.decide / getProposal', () => {
  async function buildWithPending(): Promise<{
    service: AddressProposalService;
    proposal: AddressProposal;
    orders: Map<string, StubOrder>;
    auditAppend: jest.Mock;
  }> {
    const built = await buildService();
    const response = await built.service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Phường Cửa Nam, Hà Nội',
    });
    return { ...built, proposal: response.proposal! };
  }

  it('duyệt: áp dụng địa chỉ đề xuất vào đơn, ghi audit applied', async () => {
    const { service, proposal, orders, auditAppend } = await buildWithPending();
    const decided = await service.decide(CALLER, proposal.id, {
      decision: 'approved',
    });
    expect(decided.status).toBe('Đã áp dụng');
    expect(decided.decidedBy).toBe('dispatcher1');
    expect(decided.appliedAt).not.toBeNull();
    expect(orders.get('DH-1001')!.address).toEqual({
      province: 'Hà Nội',
      ward: 'Phường Cửa Nam',
    });
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'address-proposal.applied',
        orderId: 'DH-1001',
      }),
    );
  });

  it('duyệt với địa chỉ đã sửa trong modal: áp dụng địa chỉ đã sửa, chấm lại điểm', async () => {
    const { service, proposal, orders } = await buildWithPending();
    const decided = await service.decide(CALLER, proposal.id, {
      decision: 'approved',
      address: {
        province: 'Hà Nội',
        ward: 'Phường Hoàn Kiếm',
        street: 'Số 3 phố Hàng Bạc',
      },
    });
    expect(decided.status).toBe('Đã áp dụng');
    expect(decided.after.address.ward).toBe('Phường Hoàn Kiếm');
    expect(decided.after.trust).toBe(100);
    expect(orders.get('DH-1001')!.address.ward).toBe('Phường Hoàn Kiếm');
  });

  it('từ chối không có lý do thì 400', async () => {
    const { service, proposal } = await buildWithPending();
    await expect(
      service.decide(CALLER, proposal.id, { decision: 'rejected' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('từ chối có lý do: trạng thái Đã từ chối, không sửa đơn', async () => {
    const { service, proposal, orders, auditAppend } = await buildWithPending();
    const decided = await service.decide(CALLER, proposal.id, {
      decision: 'rejected',
      reason: 'Khách xác nhận phường khác.',
    });
    expect(decided.status).toBe('Đã từ chối');
    expect(decided.decisionReason).toBe('Khách xác nhận phường khác.');
    expect(orders.get('DH-1001')!.address.ward).toBe('Phường Trần Hưng Đạo');
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'address-proposal.rejected',
        orderId: 'DH-1001',
      }),
    );
  });

  it('quyết định lại đề xuất đã quyết định thì 409', async () => {
    const { service, proposal } = await buildWithPending();
    await service.decide(CALLER, proposal.id, {
      decision: 'rejected',
      reason: 'Sai phường.',
    });
    await expect(
      service.decide(CALLER, proposal.id, { decision: 'approved' }),
    ).rejects.toThrow(ConflictException);
  });

  it('duyệt khi đơn đã đóng thì 409, đề xuất vẫn Chờ duyệt', async () => {
    const built = await buildWithPending();
    built.orders.get('DH-1001')!.state = 'Hoàn';
    await expect(
      built.service.decide(CALLER, built.proposal.id, { decision: 'approved' }),
    ).rejects.toThrow(ConflictException);
    const again = await built.service.getProposal(built.proposal.id);
    expect(again.status).toBe('Chờ duyệt');
  });

  it('getProposal: tìm thấy và không tìm thấy thì 404', async () => {
    const { service, proposal } = await buildWithPending();
    expect((await service.getProposal(proposal.id)).id).toBe(proposal.id);
    await expect(service.getProposal('AC-9999')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('decide đề xuất không tồn tại thì 404', async () => {
    const { service } = await buildService();
    await expect(
      service.decide(CALLER, 'AC-9999', { decision: 'approved' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('AddressProposalService.suggest (LLM lai)', () => {
  it('LLM sửa được phường viết tắt mà luật không khớp, tự áp dụng, ghi audit llm-suggested', async () => {
    const llm = buildLlmStub(() => ({
      province: 'Hà Nội',
      ward: 'Phường Hoàn Kiếm',
      street: 'Số 1 phố Hàng Bè',
    }));
    const { service, store, auditAppend } = await buildService(llm);
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Số 1 phố Hàng Bè, p. HK, Hà Nội',
    });
    expect(llm.parseAddress).toHaveBeenCalledWith(
      'Số 1 phố Hàng Bè, p. HK, Hà Nội',
    );
    expect(response.source).toBe('llm');
    expect(response.applied).toBe(true);
    expect(response.proposal).not.toBeNull();
    expect(response.proposal!.status).toBe('Tự áp dụng');
    expect(response.proposal!.source).toBe('llm');
    expect(response.after.address.ward).toBe('Phường Hoàn Kiếm');
    expect(response.after.trust).toBe(100);
    expect((await store.findById(response.proposal!.id))!.source).toBe('llm');
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'address-proposal.llm-suggested',
        orderId: 'DH-1001',
      }),
    );
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'address-proposal.auto-applied',
        orderId: 'DH-1001',
      }),
    );
  });

  it('LLM điền được phường còn thiếu mà luật không suy ra được', async () => {
    const llm = buildLlmStub(() => ({
      province: 'Hà Nội',
      ward: 'Phường Cửa Nam',
      street: 'Số 12 ngõ 34 phố Hàng Bè',
    }));
    const { service } = await buildService(llm);
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Số 12 ngõ 34 phố Hàng Bè, Hà Nội',
    });
    expect(response.source).toBe('llm');
    expect(response.applied).toBe(true);
    expect(response.after.address.ward).toBe('Phường Cửa Nam');
    expect(response.after.trust).toBe(100);
  });

  it('LLM mức giữa thì lưu đề xuất Chờ duyệt, ghi audit llm-suggested', async () => {
    const llm = buildLlmStub(() => ({
      province: 'Hà Nội',
      ward: 'Phường Hoàn Kiếm',
      street: '',
    }));
    const { service, store, auditAppend } = await buildService(llm);
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'p. HK, Hà Nội',
    });
    expect(response.source).toBe('llm');
    expect(response.applied).toBe(false);
    expect(response.proposal).not.toBeNull();
    expect(response.proposal!.status).toBe('Chờ duyệt');
    expect(response.proposal!.source).toBe('llm');
    expect(response.after.trust).toBe(80);
    expect((await store.findById(response.proposal!.id))!.source).toBe('llm');
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'address-proposal.created',
        orderId: 'DH-1001',
      }),
    );
    expect(auditAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'address-proposal.llm-suggested',
        orderId: 'DH-1001',
      }),
    );
  });

  it('LLM bịa phường không có trong danh mục thì bỏ, dùng luật', async () => {
    const llm = buildLlmStub(() => ({
      province: 'Hà Nội',
      ward: 'Phường Không Có Thật',
      street: 'Số 12 ngõ 34 phố Hàng Bè',
    }));
    const { service, auditAppend } = await buildService(llm);
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Số 12 ngõ 34 phố Hàng Bè, Hà Nội',
    });
    expect(llm.parseAddress).toHaveBeenCalled();
    expect(response.source).toBe('rules');
    expect(response.proposal).toBeNull();
    expect(response.applied).toBe(false);
    expect(response.after.trust).toBe(60);
    expect(auditAppend).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'address-proposal.llm-suggested' }),
    );
  });

  it('LLM lỗi (trả null) thì dùng luật', async () => {
    const llm = buildLlmStub(() => null);
    const { service } = await buildService(llm);
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Số 12 ngõ 34 phố Hàng Bè, Hà Nội',
    });
    expect(response.source).toBe('rules');
    expect(response.after.trust).toBe(60);
  });

  it('LLM ném lỗi thì dùng luật, không làm hỏng suggest', async () => {
    const llm = buildLlmStub(() => {
      throw new Error('Workers AI timeout');
    });
    const { service } = await buildService(llm);
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Số 12 ngõ 34 phố Hàng Bè, p. trần hưng đạo, q. hoàn kiếm, hà nội',
    });
    expect(response.source).toBe('rules');
    expect(response.applied).toBe(true);
    expect(response.after.trust).toBe(100);
  });

  it('LLM chưa cấu hình (enabled = false) thì không gọi parseAddress, dùng luật', async () => {
    const llm = buildLlmStub(
      () => ({
        province: 'Hà Nội',
        ward: 'Phường Hoàn Kiếm',
        street: 'Số 1 phố Hàng Bè',
      }),
      false,
    );
    const { service } = await buildService(llm);
    const response = await service.suggest(CALLER, {
      orderId: 'DH-1001',
      raw: 'Số 1 phố Hàng Bè, p. HK, Hà Nội',
    });
    expect(llm.parseAddress).not.toHaveBeenCalled();
    expect(response.source).toBe('rules');
    expect(response.proposal).toBeNull();
    expect(response.after.trust).toBe(60);
  });

  it('địa chỉ đã đạt mức cao thì không gọi LLM', async () => {
    const llm = buildLlmStub(() => ({
      province: 'Hà Nội',
      ward: 'Phường Hoàn Kiếm',
      street: 'Số 1 phố Hàng Bè',
    }));
    const { service } = await buildService(llm);
    const response = await service.suggest(CALLER, { orderId: 'DH-1003' });
    expect(llm.parseAddress).not.toHaveBeenCalled();
    expect(response.source).toBe('rules');
    expect(response.proposal).toBeNull();
    expect(response.note).toContain('đã đạt độ tin cậy cao');
  });
});
