// 챗봇 연결 상태: 서버에 키가 설정됐는지, 접근 코드가 필요한지 (키 값은 절대 내보내지 않음)
import { sendJson } from "./_lib.js";

export default function handler(req, res) {
  sendJson(res, 200, {
    serverKey: !!(process.env.ANTHROPIC_API_KEY || "").trim(),
    accessCodeRequired: !!(process.env.CHAT_ACCESS_CODE || "").trim(),
    defaultModel: (process.env.CHAT_DEFAULT_MODEL || "").trim() || null,
  });
}
