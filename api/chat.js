// AI 교관 챗봇: 학생 질문을 Claude에 보내고 답변을 줄 단위 JSON(NDJSON)으로 흘려보낸다.
import { resolveKey, checkAccess, makeClient, sendJson, explainError } from "./_lib.js";

const DEFAULT_MODEL = "claude-opus-5-5";
// 서버측 거절 대체(fallbacks: "default")를 받는 모델
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
const EFFORTS = new Set(["low", "medium", "high"]);
const MAX_TURNS = 24;
const MAX_CHARS = 6000;

const BASE_PROMPT = `당신은 'Flight Ready' 훈련 앱의 AI 객실안전 교관입니다. 질문하는 사람은 객실승무원 교육생과 항공서비스 전공 학생입니다.

답변 원칙
- 한국어로, 학생 눈높이에서 정확하고 간결하게 답합니다. 핵심을 먼저 말하고 필요하면 이유와 절차를 짧게 덧붙입니다.
- 객실 안전·비상절차·서비스·항공 지식 질문에 답합니다. 앱의 사고사례(아시아나항공 214편, 2013, NTSB AAR-14/01)와 시뮬레이션 결과를 근거로 설명하면 좋습니다.
- 퀴즈 정답을 바로 알려 달라는 요청에는 먼저 생각할 단서를 주고, 학생이 다시 물으면 정답과 해설을 알려 줍니다.
- 탈출 구령, 승무원의 탈출 개시 권한, 장비 조작 세부 절차는 항공사·기종마다 다르므로 "소속 기관 매뉴얼을 따른다"는 점을 필요할 때 짚어 줍니다.
- 모르는 수치나 사실은 지어내지 말고 확실하지 않다고 말합니다.
- 실제 사고의 희생자를 존중하는 어조를 지킵니다.
- 짧은 마크다운(굵게, 목록)만 씁니다. 표나 긴 제목은 쓰지 않습니다.`;

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 400000) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
  });
}

function cleanMessages(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const m of list.slice(-MAX_TURNS)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const text = String(m.content || "").slice(0, MAX_CHARS).trim();
    if (!text) continue;
    // 같은 역할이 연달아 오면 합친다 (API는 user/assistant 교대를 요구)
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += "\n\n" + text;
    else out.push({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  while (out.length && out[out.length - 1].role !== "user") out.pop();
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "POST만 지원합니다." });
  const { key, source } = resolveKey(req);
  if (!key) return sendJson(res, 401, { error: "API 키가 없습니다. 챗봇 설정에서 키를 입력하거나, 교사가 Vercel 환경변수 ANTHROPIC_API_KEY를 설정해 주세요." });
  if (!checkAccess(req, source)) return sendJson(res, 403, { error: "수업 접근 코드가 맞지 않습니다. 챗봇 설정에서 코드를 입력해 주세요." });

  const body = await readBody(req);
  const model = /^[a-z0-9][a-z0-9.\-]{2,80}$/i.test(body.model || "") ? body.model : (process.env.CHAT_DEFAULT_MODEL || DEFAULT_MODEL);
  const messages = cleanMessages(body.messages);
  if (!messages.length) return sendJson(res, 400, { error: "질문이 비어 있습니다." });

  // 현재 학습 상황(화면·사례 자료·시뮬레이션 결과)은 마지막 질문 앞에 붙여 보낸다
  const situation = String(body.context || "").slice(0, 8000).trim();
  if (situation) {
    const last = messages[messages.length - 1];
    last.content = `<학습상황>\n${situation}\n</학습상황>\n\n${last.content}`;
  }
  const knowledge = String(body.knowledge || "").slice(0, 20000).trim();

  const system = [{ type: "text", text: BASE_PROMPT }];
  if (knowledge) system.push({ type: "text", text: "앱에 들어 있는 학습 자료\n" + knowledge });
  system[system.length - 1].cache_control = { type: "ephemeral" };

  const maxOut = Number(body.maxOutput) > 0 ? Number(body.maxOutput) : 64000;
  const params = { model, max_tokens: Math.min(64000, maxOut), system, messages };
  // effort는 지원하는 모델에만 보낸다 (Haiku 4.5 등 이전 모델은 오류)
  const effortOk = body.effortSupported === true || (body.effortSupported == null && /^claude-(opus|sonnet|haiku|fable)-5/.test(model));
  if (effortOk && EFFORTS.has(body.effort)) params.output_config = { effort: body.effort };

  const client = makeClient(key);
  let stream;
  try {
    stream = FALLBACK_MODELS.has(model)
      ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : client.messages.stream(params);
  } catch (err) {
    const e = explainError(err);
    return sendJson(res, e.status, { error: e.message });
  }

  let started = false;
  const write = (obj) => {
    if (!started) {
      started = true;
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Accel-Buffering", "no");
    }
    res.write(JSON.stringify(obj) + "\n");
  };
  // 학생이 '멈춤'을 누르거나 창을 닫아 연결이 끊기면 Claude 요청도 멈춘다
  let aborted = false;
  res.on("close", () => { if (!res.writableEnded) { aborted = true; stream.abort(); } });

  try {
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") write({ t: ev.delta.text });
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      write({ notice: "이 질문에는 답변할 수 없다는 판단이 나왔습니다. 질문을 객실안전 학습 내용으로 바꿔 다시 물어봐 주세요." });
    } else if (final.stop_reason === "max_tokens") {
      write({ notice: "답변이 길어 중간에 끊겼습니다. '이어서 설명해줘'라고 물어보세요." });
    }
    write({ done: true, model: final.model, usage: { in: final.usage?.input_tokens, out: final.usage?.output_tokens } });
    res.end();
  } catch (err) {
    if (aborted) return;
    const e = explainError(err);
    if (!started) return sendJson(res, e.status, { error: e.message });
    write({ error: e.message });
    res.end();
  }
}
