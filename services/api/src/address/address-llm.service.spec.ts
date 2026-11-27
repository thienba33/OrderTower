// SPDX-License-Identifier: Apache-2.0
// Kiểm thử AddressLlmService với fetch giả lập: không bao giờ gọi API
// thật (không mạng, không key trong CI). Env đọc lúc dựng service nên
// mỗi test đặt env rồi mới new service.
import { AddressLlmService } from './address-llm.service';

const ACCOUNT_ID = 'test-account-id';
const API_TOKEN = 'test-api-token';

function fakeResponse(status: number, bodyText: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => bodyText,
  } as Response;
}

function workersAiBody(responseText: string): string {
  return JSON.stringify({ success: true, result: { response: responseText } });
}

describe('AddressLlmService', () => {
  const fetchMock = jest.fn();
  let savedAccountId: string | undefined;
  let savedApiToken: string | undefined;
  let savedModel: string | undefined;

  beforeEach(() => {
    savedAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    savedApiToken = process.env.CLOUDFLARE_API_TOKEN;
    savedModel = process.env.CLOUDFLARE_AI_MODEL;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_AI_MODEL;
    fetchMock.mockReset();
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        (...args: unknown[]) => fetchMock(...args) as Promise<Response>,
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    if (savedAccountId === undefined) {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
    } else {
      process.env.CLOUDFLARE_ACCOUNT_ID = savedAccountId;
    }
    if (savedApiToken === undefined) {
      delete process.env.CLOUDFLARE_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_API_TOKEN = savedApiToken;
    }
    if (savedModel === undefined) {
      delete process.env.CLOUDFLARE_AI_MODEL;
    } else {
      process.env.CLOUDFLARE_AI_MODEL = savedModel;
    }
  });

  function buildService(): AddressLlmService {
    process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;
    process.env.CLOUDFLARE_API_TOKEN = API_TOKEN;
    return new AddressLlmService();
  }

  it('chưa cấu hình account/token thì enabled = false, parseAddress không gọi fetch', async () => {
    const service = new AddressLlmService();
    expect(service.enabled).toBe(false);
    await expect(
      service.parseAddress('Số 1 phố Hàng Bè, Hà Nội'),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('thiếu token thì enabled = false', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;
    expect(new AddressLlmService().enabled).toBe(false);
  });

  it('phân tích được JSON dạng result.response, gọi đúng URL + header + model mặc định', async () => {
    const service = buildService();
    fetchMock.mockResolvedValue(
      fakeResponse(
        200,
        workersAiBody(
          '{"province": "Hà Nội", "ward": "Phường Cửa Nam", "street": "Số 12 ngõ 34 phố Hàng Bè"}',
        ),
      ),
    );
    await expect(
      service.parseAddress('Số 12 ngõ 34 phố Hàng Bè, p. trần hưng đạo, hà nội'),
    ).resolves.toEqual({
      province: 'Hà Nội',
      ward: 'Phường Cửa Nam',
      street: 'Số 12 ngõ 34 phố Hàng Bè',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_TOKEN}`,
    );
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(
      (body.messages as Array<{ content: string }>)[1].content,
    ).toContain('Số 12 ngõ 34 phố Hàng Bè');
  });

  it('phân tích được JSON dạng result.choices', async () => {
    const service = buildService();
    fetchMock.mockResolvedValue(
      fakeResponse(
        200,
        JSON.stringify({
          success: true,
          result: {
            choices: [
              {
                message: {
                  content:
                    '{"province": "Hà Nội", "ward": "Phường Hoàn Kiếm", "street": "Số 1 phố Hàng Bè"}',
                },
              },
            ],
          },
        }),
      ),
    );
    await expect(
      service.parseAddress('Số 1 phố Hàng Bè, p. HK, Hà Nội'),
    ).resolves.toEqual({
      province: 'Hà Nội',
      ward: 'Phường Hoàn Kiếm',
      street: 'Số 1 phố Hàng Bè',
    });
  });

  it('lấy được JSON dù LLM trả kèm chữ thừa quanh object', async () => {
    const service = buildService();
    fetchMock.mockResolvedValue(
      fakeResponse(
        200,
        workersAiBody(
          'Đây là địa chỉ đã phân tích: {"province": "Hà Nội", "ward": "Phường Cửa Nam", "street": ""} hết.',
        ),
      ),
    );
    await expect(service.parseAddress('Phường Cửa Nam, Hà Nội')).resolves.toEqual({
      province: 'Hà Nội',
      ward: 'Phường Cửa Nam',
    });
  });

  it('dùng model trong CLOUDFLARE_AI_MODEL khi có', async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;
    process.env.CLOUDFLARE_API_TOKEN = API_TOKEN;
    process.env.CLOUDFLARE_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    const service = new AddressLlmService();
    fetchMock.mockResolvedValue(
      fakeResponse(200, workersAiBody('{"province": "Hà Nội"}')),
    );
    await service.parseAddress('Hà Nội');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  });

  it('Workers AI trả 401 thì trả null, không ném lỗi', async () => {
    const service = buildService();
    fetchMock.mockResolvedValue(
      fakeResponse(
        401,
        JSON.stringify({
          success: false,
          errors: [{ message: 'Invalid token' }],
        }),
      ),
    );
    await expect(service.parseAddress('Hà Nội')).resolves.toBeNull();
  });

  it('lỗi mạng thì trả null, không ném lỗi', async () => {
    const service = buildService();
    fetchMock.mockRejectedValue(new Error('fetch failed'));
    await expect(service.parseAddress('Hà Nội')).resolves.toBeNull();
  });

  it('hết thời gian 10s thì trả null, không ném lỗi', async () => {
    jest.useFakeTimers();
    const service = buildService();
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const pending = service.parseAddress('Hà Nội');
    await jest.advanceTimersByTimeAsync(10_001);
    await expect(pending).resolves.toBeNull();
  });

  it('body không phải JSON thì trả null', async () => {
    const service = buildService();
    fetchMock.mockResolvedValue(fakeResponse(200, 'not json at all'));
    await expect(service.parseAddress('Hà Nội')).resolves.toBeNull();
  });

  it('JSON không có trường nào thì trả null', async () => {
    const service = buildService();
    fetchMock.mockResolvedValue(
      fakeResponse(200, workersAiBody('{"foo": "bar"}')),
    );
    await expect(service.parseAddress('Hà Nội')).resolves.toBeNull();
  });

  it('chuỗi rỗng thì trả null, không gọi fetch', async () => {
    const service = buildService();
    await expect(service.parseAddress('   ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
