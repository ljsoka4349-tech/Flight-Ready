// 서버 함수 공용 도우미 (파일 이름이 _로 시작하면 Vercel이 경로로 노출하지 않음)
import Anthropic from "@anthropic-ai/sdk";

// 키 우선순위: 학생/교사가 브라우저 설정에 넣은 개인 키(x-anthropic-key) → Vercel 환경변수 ANTHROPIC_API_KEY
export function resolveKey(req) {
  const userKey = String(req.headers["x-anthropic-key"] || "").trim();
  if (userKey) return { key: userKey, source: "user" };
  const serverKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (serverKey) return { key: serverKey, source: "server" };
  return { key: "", source: "none" };
}

// 서버 키를 쓸 때만 수업 접근 코드(CHAT_ACCESS_CODE)를 확인한다. 설정하지 않으면 확인하지 않음.
export function checkAccess(req, source) {
  const code = (process.env.CHAT_ACCESS_CODE || "").trim();
  if (source !== "server" || !code) return true;
  return String(req.headers["x-access-code"] || "").trim() === code;
}

export function makeClient(key) {
  return new Anthropic({ apiKey: key, maxRetries: 2 });
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// SDK 오류를 학생이 이해할 수 있는 문장으로
export function explainError(err) {
  if (err instanceof Anthropic.AuthenticationError) return { status: 401, message: "API 키가 올바르지 않습니다. 설정에서 키를 다시 확인해 주세요." };
  if (err instanceof Anthropic.PermissionDeniedError) return { status: 403, message: "이 API 키로는 선택한 모델을 쓸 수 없습니다. 다른 모델을 골라 보세요." };
  if (err instanceof Anthropic.NotFoundError) return { status: 404, message: "선택한 모델을 찾을 수 없습니다. '최신 모델 불러오기'로 목록을 새로 받아 주세요." };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, message: "요청이 많아 잠시 막혔습니다. 30초쯤 뒤에 다시 질문해 주세요." };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, message: "요청 형식 오류: " + (err.message || "").slice(0, 300) };
  if (err instanceof Anthropic.InternalServerError) return { status: 502, message: "Claude 서버가 잠시 불안정합니다. 다시 시도해 주세요." };
  if (err instanceof Anthropic.APIConnectionError) return { status: 502, message: "Claude 서버에 연결하지 못했습니다." };
  if (err instanceof Anthropic.APIError) return { status: err.status || 500, message: (err.message || "API 오류").slice(0, 300) };
  return { status: 500, message: "서버 오류가 났습니다." };
}
