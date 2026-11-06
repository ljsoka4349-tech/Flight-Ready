// 최신 모델 자동 불러오기: Models API로 이 키에서 쓸 수 있는 Claude 모델 목록을 받아 최신순으로 돌려준다.
import { resolveKey, checkAccess, makeClient, sendJson, explainError } from "./_lib.js";

function family(id) {
  const m = /^claude-([a-z]+)/.exec(id);
  return m ? m[1] : "other";
}

export default async function handler(req, res) {
  const { key, source } = resolveKey(req);
  if (!key) return sendJson(res, 401, { error: "API 키가 없습니다. 설정에서 키를 입력하거나 Vercel 환경변수 ANTHROPIC_API_KEY를 설정해 주세요." });
  if (!checkAccess(req, source)) return sendJson(res, 403, { error: "수업 접근 코드가 맞지 않습니다." });

  try {
    const client = makeClient(key);
    const models = [];
    for await (const m of client.models.list({ limit: 100 })) {
      const caps = m.capabilities || {};
      models.push({
        id: m.id,
        name: m.display_name || m.id,
        created: m.created_at,
        family: family(m.id),
        effort: caps.effort ? !!caps.effort.supported : null,
        maxOutput: m.max_tokens || null,
      });
    }
    models.sort((a, b) => String(b.created).localeCompare(String(a.created)));
    // 계열(opus/sonnet/haiku/fable …)마다 가장 최근 모델에 latest 표시
    const seen = new Set();
    for (const m of models) {
      m.latest = !seen.has(m.family);
      seen.add(m.family);
    }
    sendJson(res, 200, { models, source, fetchedAt: new Date().toISOString() });
  } catch (err) {
    const e = explainError(err);
    sendJson(res, e.status, { error: e.message });
  }
}
