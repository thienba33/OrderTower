// SPDX-License-Identifier: Apache-2.0
import { Injectable, Logger } from '@nestjs/common';
import type { LlmParsedAddress } from './address.types';

// Model text mặc định cho Workers AI (đã dùng ở AniMan: tóm tắt 0,9s,
// 5,8 neuron). Ghi đè bằng CLOUDFLARE_AI_MODEL khi cần model khác.
export const DEFAULT_CLOUDFLARE_AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const WORKERS_AI_TIMEOUT_MS = 10_000;
const WORKERS_AI_MAX_TOKENS = 256;

const LLM_SYSTEM_PROMPT = [
  'Bạn phân tích địa chỉ Việt Nam thành JSON. Chỉ trả JSON, không giải thích, không thêm chữ nào khác.',
  'Các trường (chuỗi, trường nào không có thì để ""):',
  '- "province": tỉnh/thành phố, ví dụ "Hà Nội".',
  '- "ward": xã/phường, ví dụ "Phường Cửa Nam".',
  '- "street": số nhà, ngõ, đường, ví dụ "Số 12 ngõ 34 phố Hàng Bè".',
  'Giữ nguyên tên như trong chuỗi, chỉ sửa lỗi gõ nhẹ (ví dụ "Cua Nma" thành "Cửa Nam"). Không bịa thêm phường hay tỉnh không có trong chuỗi.',
  'Bỏ qua quận/huyện cũ (q., quận, huyện): đó không phải phường, không lấy tên quận làm phường.',
  'Trả đúng dạng: {"province": "...", "ward": "...", "street": "..."}.',
].join('\n');

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Lấy message lỗi đầu tiên từ body lỗi Cloudflare ({ errors: [{ message }] }).
function cloudflareErrorMessage(bodyText: string): string {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    const errors = (parsed as { errors?: { message?: unknown }[] }).errors;
    const first = errors?.[0]?.message;
    if (typeof first === 'string' && first.length > 0) {
      return first.slice(0, 300);
    }
  } catch {
    // Bỏ qua: dùng thông báo chung bên dưới.
  }
  return '';
}

// Lấy chuỗi text từ body trả về của Workers AI: dạng { result: { response } }
// hoặc { result: { choices: [{ message: { content } }] } } (xem AniMan
// cloudflare-novel-ai.provider.ts). Ném lỗi khi body không phải JSON,
// success = false, hoặc không có chuỗi text nào.
function extractText(bodyText: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error('Workers AI trả về body không phải JSON');
  }
  const result = (parsed as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null) {
    throw new Error('Workers AI trả về hình dạng không ngờ tới');
  }
  const choices = (result as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const content = (choices[0] as { message?: { content?: unknown } }).message
      ?.content;
    if (typeof content === 'string' && content.trim().length > 0) {
      return content;
    }
  }
  const response = (result as { response?: unknown }).response;
  if (typeof response === 'string' && response.trim().length > 0) {
    return response;
  }
  const success = (parsed as { success?: unknown }).success;
  if (success === false) {
    throw new Error(
      cloudflareErrorMessage(bodyText) || 'Workers AI báo lỗi',
    );
  }
  throw new Error('Workers AI trả về chuỗi rỗng');
}

// Lấy object JSON đầu tiên trong chuỗi LLM trả về (model ép JSON bằng
// response_format nên thường là JSON thuần; cắt phần bao quanh nếu có
// chữ thừa). Chỉ nhận 3 trường province/ward/street dạng chuỗi; cả 3
// đều rỗng thì coi như không phân tích được.
function parseLlmJson(text: string): LlmParsedAddress | null {
  const trimmed = text.trim();
  let candidate: string | null = null;
  try {
    JSON.parse(trimmed);
    candidate = trimmed;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      candidate = trimmed.slice(start, end + 1);
    }
  }
  if (!candidate) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const out: LlmParsedAddress = {};
  for (const key of ['province', 'ward', 'street'] as const) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      out[key] = value.trim();
    }
  }
  if (!out.province && !out.ward && !out.street) return null;
  return out;
}

// Gọi Cloudflare Workers AI để phân tích chuỗi địa chỉ thô thành
// {province, ward, street}. Chỉ dùng khi đủ CLOUDFLARE_ACCOUNT_ID +
// CLOUDFLARE_API_TOKEN; không có thì enabled = false và service gọi bỏ
// qua bước LLM, dùng luật. Mọi lỗi (mạng, 4xx/5xx, JSON sai hình, hết
// thời gian 10s) đều ghi warn và trả null, không bao giờ ném ra ngoài:
// service gọi chỉ cần kiểm tra null để dùng luật.
@Injectable()
export class AddressLlmService {
  private readonly logger = new Logger(AddressLlmService.name);
  private readonly accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
  private readonly apiToken = (process.env.CLOUDFLARE_API_TOKEN ?? '').trim();
  private readonly model =
    (process.env.CLOUDFLARE_AI_MODEL ?? '').trim() ||
    DEFAULT_CLOUDFLARE_AI_MODEL;

  get enabled(): boolean {
    return this.accountId.length > 0 && this.apiToken.length > 0;
  }

  async parseAddress(raw: string): Promise<LlmParsedAddress | null> {
    if (!this.enabled) return null;
    const text = raw.trim();
    if (!text) return null;
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${this.model}`;
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          reject(new Error('Workers AI timeout sau 10s'));
        }, WORKERS_AI_TIMEOUT_MS);
      });
      const response = await Promise.race([
        fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: LLM_SYSTEM_PROMPT },
              { role: 'user', content: text },
            ],
            max_tokens: WORKERS_AI_MAX_TOKENS,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        }),
        timeout,
      ]);
      const bodyText = await response.text();
      if (!response.ok) {
        const detail = cloudflareErrorMessage(bodyText);
        this.logger.warn(
          `Workers AI trả ${response.status}, dùng luật${detail ? `: ${detail}` : '.'}`,
        );
        return null;
      }
      return parseLlmJson(extractText(bodyText));
    } catch (error) {
      this.logger.warn(
        `LLM chuẩn hóa địa chỉ lỗi, dùng luật: ${errorMessage(error)}`,
      );
      return null;
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}
