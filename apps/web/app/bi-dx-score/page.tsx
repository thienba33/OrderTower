// SPDX-License-Identifier: Apache-2.0
import { redirect } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { canAccessScreen } from "@/lib/roles";
import { AccessDenied } from "@/components/layout/AccessDenied";
import BiDxScoreClient from "./bi-dx-score-client";
import type {
  ApiAnomaly,
  ApiDxScore,
  ApiDxScoreSnapshot,
  ApiFeedback,
  ApiForecastRow,
  ApiRecommendation,
  BiSectionError,
} from "./bi-dx-score-types";
import type {
  ApiArchiveSummary,
  ApiColdAnalytics,
} from "../cold-data/cold-data-types";
import type { ApiChannel } from "../orders/orders-types";

// Lấy danh sách từ API, trả về mảng đã kiểm tra dạng.
async function fetchList<T>(path: string): Promise<T[]> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as T[];
}

// Lấy 1 đối tượng từ API, trả null khi API trả null (ví dụ snapshot
// chưa có). Sai dạng khác thì ném lỗi.
async function fetchObject<T>(path: string): Promise<T | null> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new ApiError(response.status, `API trả về ${response.status}.`);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  if (data === null) {
    return null;
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError(response.status, "API trả về dữ liệu không đúng dạng.");
  }
  return data as T;
}

// Lấy mảng nằm trong 1 đối tượng trả về của API, ví dụ
// {referenceDate, rows} của /bi/forecast hay {referenceDate,
// anomalies} của /bi/anomalies. Sai dạng thì ném lỗi như fetchList.
async function fetchWrappedList<T>(path: string, key: string): Promise<T[]> {
  const data = await fetchObject<Record<string, unknown>>(path);
  if (data === null || !Array.isArray(data[key])) {
    throw new ApiError(502, "API trả về dữ liệu không đúng dạng.");
  }
  return data[key] as T[];
}

function toSectionError(error: unknown): BiSectionError {
  return error instanceof ApiError && error.status === 401
    ? "unauthorized"
    : "load-failed";
}

export default async function BiDxScorePage() {
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  if (!canAccessScreen("/bi-dx-score", session.roles)) {
    return <AccessDenied roles={session.roles} screenLabel="BI và DX-Score" />;
  }

  // Dự báo + tên kênh: lỗi thì chỉ hỏng khối dự báo, các khối khác vẫn
  // hiện như thường.
  let forecastRows: ApiForecastRow[] = [];
  let channelNameById: Record<string, string> = {};
  let forecastError: BiSectionError | null = null;
  try {
    const [forecast, channels] = await Promise.all([
      fetchWrappedList<ApiForecastRow>("/bi/forecast", "rows"),
      fetchList<ApiChannel>("/channels"),
    ]);
    forecastRows = forecast;
    channelNameById = Object.fromEntries(
      channels.map((channel) => [channel.id, channel.name]),
    );
  } catch (error) {
    forecastError = toSectionError(error);
  }

  // Bất thường + đề xuất + phản hồi: gọi GET anomalies trước vì nó có
  // tác dụng phụ tạo đề xuất cho bất thường mới; gọi recommendations
  // trước khi đó thì đề xuất mới chưa có. Lỗi thì chỉ hỏng khối này.
  let anomalies: ApiAnomaly[] = [];
  let recommendations: ApiRecommendation[] = [];
  let feedback: ApiFeedback[] = [];
  let biError: BiSectionError | null = null;
  try {
    anomalies = await fetchWrappedList<ApiAnomaly>("/bi/anomalies", "anomalies");
    const [recs, fb] = await Promise.all([
      fetchList<ApiRecommendation>("/bi/recommendations"),
      fetchList<ApiFeedback>("/bi/feedback"),
    ]);
    recommendations = recs;
    feedback = fb;
  } catch (error) {
    biError = toSectionError(error);
  }

  // DX-Score: điểm hiện tại + snapshot gần nhất đã lưu. Lỗi thì chỉ hỏng
  // khối DX.
  let dxScore: ApiDxScore | null = null;
  let latestSnapshot: ApiDxScoreSnapshot | null = null;
  let dxError: BiSectionError | null = null;
  try {
    const [score, latest] = await Promise.all([
      fetchObject<ApiDxScore>("/bi/dx-score"),
      fetchObject<ApiDxScoreSnapshot>("/bi/dx-score/latest"),
    ]);
    if (score === null) {
      throw new ApiError(502, "API trả về dữ liệu không đúng dạng.");
    }
    dxScore = score;
    latestSnapshot = latest;
  } catch (error) {
    dxError = toSectionError(error);
  }

  // Cold data: nguồn lịch sử từ Parquet. Lỗi thì chỉ ẩn khối này, không
  // làm hỏng BI/DX-Score hiện có.
  let archiveSummary: ApiArchiveSummary | null = null;
  let coldAnalytics: ApiColdAnalytics | null = null;
  let coldError: BiSectionError | null = null;
  try {
    const [summary, analytics] = await Promise.all([
      fetchObject<ApiArchiveSummary>("/archive/summary"),
      fetchObject<ApiColdAnalytics>("/archive/orders/analytics?limit=10"),
    ]);
    if (summary === null || analytics === null) {
      throw new ApiError(502, "API trả về dữ liệu không đúng dạng.");
    }
    archiveSummary = summary;
    coldAnalytics = analytics;
  } catch (error) {
    coldError = toSectionError(error);
  }

  return (
    <BiDxScoreClient
      forecastRows={forecastRows}
      channelNameById={channelNameById}
      anomalies={anomalies}
      recommendations={recommendations}
      feedback={feedback}
      dxScore={dxScore}
      latestSnapshot={latestSnapshot}
      forecastError={forecastError}
      biError={biError}
      dxError={dxError}
      archiveSummary={archiveSummary}
      coldAnalytics={coldAnalytics}
      coldError={coldError}
      roles={session.roles}
    />
  );
}
