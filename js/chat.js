// AI 교관 챗봇 (화면 오른쪽 아래). 질문은 /api/chat(Vercel 서버 함수)을 거쳐 Claude로 간다.
// API 키: ① Vercel 환경변수 ANTHROPIC_API_KEY(교사가 한 번 설정, 학생은 키 불필요) 또는 ② 이 브라우저에 직접 입력한 개인 키.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fr:chat:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fr:chat:" + k, JSON.stringify(v)); } catch { /* 저장 불가 */ } },
    del(k) { try { localStorage.removeItem("fr:chat:" + k); } catch { /* 저장 불가 */ } },
  };

  // 목록을 불러오기 전 기본 선택지 (최신 세대)
  const FALLBACK_MODELS = [
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", family: "opus", latest: true, effort: true },
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", family: "sonnet", latest: true, effort: true },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", family: "haiku", latest: true, effort: true },
    { id: "claude-fable-5-1", name: "Claude Fable 5.1", family: "fable", latest: true, effort: true },
  ];
  const FAMILY_NOTE = { opus: "균형 · 기본 추천", sonnet: "빠르고 저렴", haiku: "가장 빠르고 저렴", fable: "최고 성능 · 비쌈" };

  const cfg = Object.assign({ model: "claude-opus-5-5", effort: "low", latestOnly: true, key: "", code: "" }, store.get("cfg", {}));
  let models = store.get("models", null) || FALLBACK_MODELS;
  let modelsFetchedAt = store.get("modelsAt", null);
  let history = store.get("history", []);
  let server = null;   // /api/config 결과
  let busy = null;     // 진행 중 요청 AbortController

  // ---------- 화면 만들기 ----------
  const root = document.createElement("div");
  root.innerHTML = `
    <button id="chatFab" class="chat-fab" aria-label="AI 교관에게 질문하기" aria-expanded="false"><span>🤖</span> AI 교관</button>
    <section id="chatPanel" class="chat-panel hidden" role="dialog" aria-label="AI 교관 챗봇">
      <header class="chat-head">
        <div><b>AI 교관</b> <span id="chatStatus" class="pill"></span></div>
        <div class="chat-head-actions">
          <button id="chatSetBtn" class="icon-btn" aria-expanded="false">설정</button>
          <button id="chatClear" class="icon-btn" title="대화 지우기">새 대화</button>
          <button id="chatClose" class="icon-btn" aria-label="닫기">✕</button>
        </div>
      </header>
      <div id="chatSettings" class="chat-settings hidden">
        <label class="lbl" for="chatModel">모델</label>
        <div class="row2">
          <select id="chatModel"></select>
          <button id="chatLoadModels" class="btn ghost sm">↻ 최신 모델 불러오기</button>
        </div>
        <label class="row small"><input type="checkbox" id="chatLatestOnly"> 계열별 최신 모델만 보기</label>
        <div id="chatModelInfo" class="muted small"></div>
        <label class="lbl" for="chatEffort">답변 깊이</label>
        <select id="chatEffort">
          <option value="low">빠르게 (low) · 짧은 질문 추천</option>
          <option value="medium">보통 (medium)</option>
          <option value="high">깊게 (high) · 느리고 비용 더 듦</option>
        </select>
        <hr>
        <div id="chatKeyInfo" class="muted small"></div>
        <label class="lbl" for="chatKey">개인 Anthropic API 키 (선택)</label>
        <div class="row2">
          <input id="chatKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-...">
          <button id="chatKeySave" class="btn ghost sm">저장</button>
        </div>
        <p class="muted small">입력한 키는 이 브라우저(localStorage)에만 저장되고, 질문할 때 이 사이트의 서버 함수로만 전달됩니다. 공용 PC에서는 쓰고 나서 지워 주세요.</p>
        <div id="chatCodeRow" class="hidden">
          <label class="lbl" for="chatCode">수업 접근 코드</label>
          <div class="row2"><input id="chatCode" type="text" autocomplete="off" placeholder="교사에게 받은 코드"><button id="chatCodeSave" class="btn ghost sm">저장</button></div>
        </div>
      </div>
      <div id="chatLog" class="chat-log" aria-live="polite"></div>
      <div id="chatChips" class="chat-chips"></div>
      <form id="chatForm" class="chat-form">
        <textarea id="chatInput" rows="1" placeholder="궁금한 점을 물어보세요 (Enter 전송, Shift+Enter 줄바꿈)" maxlength="2000"></textarea>
        <button id="chatSend" class="btn primary" type="submit">전송</button>
      </form>
    </section>`;
  document.body.appendChild(root);

  const CHIPS = [
    "Brace 자세는 왜 승무원이 먼저 해야 하나요?",
    "'90초 룰'이 뭔가요?",
    "출구 판단할 때 창밖에서 무엇을 확인하나요?",
    "214편 사고에서 슬라이드는 왜 기내로 펼쳐졌나요?",
  ];

  // ---------- 상황 정보 ----------
  function knowledge() {
    const C = window.FR_CASES || [];
    return C.map((c) => [
      `[사고사례 ${c.no}] ${c.title} · ${c.subtitle}`,
      ...c.quizzes.map((q, i) => `퀴즈${i + 1}(${q.topic}): ${q.question}\n 보기: ${q.options.map((o, k) => `${k + 1}) ${o}`).join(" / ")}\n 정답: ${q.answer + 1}번 · 해설: ${q.explanation}`),
      "핵심 교훈: " + c.lessons.map((l) => l.ko).join(" / "),
      "비상탈출 구령: " + c.commands.text,
    ].join("\n")).join("\n\n") + `

[비상탈출 시뮬레이션] 학생이 객실 책임 승무원이 되어 ① 착륙 전 좌석벨트 점검 ② 충격 대비(Brace) 판단 ③ 정지 후 출구 창밖 확인·조종실 보고·탈출 개시 ④ 출구 개방/차단·재유도, 구령, 휴대 수하물 통제를 한다. 위험 출구(화재·잔해)는 막고, 열어 보니 고장(슬라이드 기내 팽창·문 변형)인 출구는 즉시 차단하고 재유도해야 한다. 승객 수 140명, 출구 8개, 단순화한 교육용 모델이다.`;
  }
  function situation() {
    const parts = [];
    const vis = (id) => { const el = $(id); return el && !el.classList.contains("hidden"); };
    if (window.FR_SIM && window.FR_SIM.active()) parts.push(window.FR_SIM.describe());
    else if (vis("player")) parts.push("사고사례 영상 시청 중: " + ($("playerTitle").textContent || ""));
    else if (vis("result")) parts.push("사고사례 학습 정리 화면: " + ($("scoreLine").textContent || ""));
    else parts.push("홈 화면");
    if (!$("quiz").classList.contains("hidden")) parts.push("지금 퀴즈를 푸는 중: " + $("qTitle").textContent + " (정답을 바로 말하지 말고 단서부터)");
    else if (window.FR_SIM && !window.FR_SIM.active() && lastSimReport) parts.push("최근 시뮬레이션 결과\n" + lastSimReport);
    return parts.join("\n");
  }
  let lastSimReport = null;

  // ---------- 모델 목록 ----------
  function visibleModels() {
    let list = cfg.latestOnly ? models.filter((m) => m.latest) : models;
    if (!list.some((m) => m.id === cfg.model)) {
      const cur = models.find((m) => m.id === cfg.model);
      if (cur) list = [cur, ...list];
    }
    return list;
  }
  function renderModels() {
    const sel = $("chatModel");
    sel.innerHTML = "";
    for (const m of visibleModels()) {
      const o = document.createElement("option");
      o.value = m.id;
      o.textContent = `${m.name}${m.latest ? " · 최신" : ""}${FAMILY_NOTE[m.family] && m.latest ? " — " + FAMILY_NOTE[m.family] : ""}`;
      sel.appendChild(o);
    }
    if (!models.some((m) => m.id === cfg.model)) cfg.model = (models.find((m) => m.family === "opus" && m.latest) || models[0]).id;
    sel.value = cfg.model;
    $("chatLatestOnly").checked = cfg.latestOnly;
    $("chatEffort").value = cfg.effort;
    const m = models.find((x) => x.id === cfg.model);
    $("chatModelInfo").textContent = (modelsFetchedAt ? `목록: ${new Date(modelsFetchedAt).toLocaleString("ko-KR")} 불러옴 · ${models.length}개` : "기본 목록 · '최신 모델 불러오기'로 이 키에서 쓸 수 있는 모델을 받아 오세요") + (m && m.effort === false ? " · 이 모델은 답변 깊이 설정을 지원하지 않습니다" : "");
    $("chatEffort").disabled = !!(m && m.effort === false);
    renderStatus();
  }
  async function loadModels(silent) {
    const btn = $("chatLoadModels");
    btn.disabled = true; btn.textContent = "불러오는 중…";
    try {
      const r = await fetch("/api/models", { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `오류 ${r.status}`);
      models = j.models.filter((m) => m.id.startsWith("claude-"));
      if (!models.length) throw new Error("쓸 수 있는 모델이 없습니다.");
      modelsFetchedAt = j.fetchedAt;
      store.set("models", models); store.set("modelsAt", modelsFetchedAt);
      // 지금 고른 모델이 목록에 없거나, 사용자가 아직 직접 고른 적이 없으면 최신 Opus(없으면 가장 최신)로
      if (!models.some((m) => m.id === cfg.model) || !cfg.picked) {
        const pref = (server && server.defaultModel && models.find((m) => m.id === server.defaultModel)) || models.find((m) => m.family === "opus" && m.latest) || models[0];
        cfg.model = pref.id;
      }
      saveCfg();
      renderModels();
      if (!silent) note(`최신 모델 목록을 불러왔습니다 (${models.length}개). 지금 모델: ${nameOf(cfg.model)}`);
    } catch (e) {
      if (!silent) note("모델 목록을 불러오지 못했습니다: " + e.message, "err");
    } finally {
      btn.disabled = false; btn.textContent = "↻ 최신 모델 불러오기";
    }
  }
  const nameOf = (id) => (models.find((m) => m.id === id) || { name: id }).name;

  function authHeaders() {
    const h = {};
    if (cfg.key) h["x-anthropic-key"] = cfg.key;
    if (cfg.code) h["x-access-code"] = cfg.code;
    return h;
  }
  function saveCfg() { store.set("cfg", cfg); }

  async function loadServer() {
    try {
      const r = await fetch("/api/config");
      server = r.ok ? await r.json() : null;
    } catch { server = null; }
    renderStatus();
    if (server && server.serverKey && server.accessCodeRequired && !cfg.key) $("chatCodeRow").classList.remove("hidden");
    // 키가 있으면 자동으로 최신 목록을 한 번 받아 둔다 (하루 1회)
    const stale = !modelsFetchedAt || Date.now() - new Date(modelsFetchedAt).getTime() > 86400000;
    if ((cfg.key || (server && server.serverKey)) && stale) loadModels(true);
  }
  function renderStatus() {
    const st = $("chatStatus"), info = $("chatKeyInfo");
    if (cfg.key) { st.textContent = "개인 키"; st.className = "pill grn"; info.textContent = "개인 API 키로 연결합니다. 지우면 서버 키(설정된 경우)를 씁니다."; }
    else if (server && server.serverKey) { st.textContent = "연결됨"; st.className = "pill grn"; info.textContent = "교사가 서버에 API 키를 설정해 두었습니다. 학생은 키 없이 바로 질문하면 됩니다."; }
    else if (server) { st.textContent = "키 필요"; st.className = "pill red"; info.textContent = "서버에 API 키가 없습니다. 아래에 개인 키를 넣거나, 교사가 Vercel 환경변수 ANTHROPIC_API_KEY를 설정해 주세요."; }
    else { st.textContent = "서버 없음"; st.className = "pill red"; info.textContent = "챗봇 서버 함수(/api)에 연결하지 못했습니다. Vercel에 배포했거나 'vercel dev'로 실행했는지 확인하세요."; }
    st.textContent += " · " + nameOf(cfg.model).replace(/^Claude /, "");
    $("chatKey").value = cfg.key ? "••••••••" + cfg.key.slice(-4) : "";
    $("chatCode").value = cfg.code || "";
  }

  // ---------- 대화 표시 ----------
  function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  // 간단한 마크다운: 굵게, 기울임, 코드, 목록, 제목, 줄바꿈 (HTML은 먼저 이스케이프)
  function md(src) {
    const lines = esc(src).split("\n");
    let html = "", list = null;
    const inline = (t) => t.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
    const close = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const l = raw.trimEnd();
      let m;
      if ((m = /^\s*[-*•]\s+(.*)/.exec(l))) { if (list !== "ul") { close(); html += "<ul>"; list = "ul"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(l))) { if (list !== "ol") { close(); html += "<ol>"; list = "ol"; } html += `<li>${inline(m[1])}</li>`; }
      else if ((m = /^#{1,4}\s+(.*)/.exec(l))) { close(); html += `<p><b>${inline(m[1])}</b></p>`; }
      else if (!l.trim()) { close(); }
      else { close(); html += `<p>${inline(l)}</p>`; }
    }
    close();
    return html;
  }
  function bubble(role, text, extra) {
    const d = document.createElement("div");
    d.className = "msg " + role + (extra ? " " + extra : "");
    if (role === "assistant") d.innerHTML = md(text || "");
    else d.textContent = text;
    $("chatLog").appendChild(d);
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
    return d;
  }
  function note(text, kind) { bubble("note", text, kind); }
  function renderHistory() {
    $("chatLog").innerHTML = "";
    if (!history.length) {
      bubble("assistant", "안녕하세요, AI 객실안전 교관입니다. 사고사례 영상, 퀴즈, 시뮬레이션에서 궁금한 점을 물어보세요.\n\n지금 보고 있는 화면 정보도 함께 참고해서 답합니다.");
    }
    for (const m of history) bubble(m.role, m.content, m.meta || "");
    renderChips();
  }
  function renderChips() {
    const box = $("chatChips");
    box.innerHTML = "";
    const chips = [...CHIPS];
    if ((window.FR_SIM && window.FR_SIM.active()) || lastSimReport) chips.unshift("방금 시뮬레이션 결과를 해설해 주세요");
    if (!$("quiz").classList.contains("hidden")) chips.unshift("이 퀴즈, 정답 말고 힌트만 주세요");
    for (const c of chips.slice(0, 4)) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.textContent = c;
      b.addEventListener("click", () => ask(c));
      box.appendChild(b);
    }
    box.classList.toggle("hidden", history.length > 2);
  }

  // ---------- 질문 보내기 ----------
  async function ask(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    $("chatInput").value = ""; autosize();
    history.push({ role: "user", content: text });
    bubble("user", text);
    $("chatChips").classList.add("hidden");
    const out = bubble("assistant", "", "typing");
    out.innerHTML = '<span class="dots3"><i></i><i></i><i></i></span>';
    const ctrl = new AbortController();
    busy = ctrl;
    setSending(true);
    let answer = "", served = null, failed = null, notice = null;
    const model = models.find((m) => m.id === cfg.model);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          model: cfg.model,
          effort: cfg.effort,
          effortSupported: model ? model.effort : null,
          maxOutput: model && model.maxOutput ? model.maxOutput : null,
          messages: history.filter((m) => !m.meta).slice(-20).map(({ role, content }) => ({ role, content })),
          context: situation(),
          knowledge: knowledge(),
        }),
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `서버 오류 ${r.status}`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", lastPaint = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let j; try { j = JSON.parse(line); } catch { continue; }
          if (j.t) answer += j.t;
          if (j.notice) notice = j.notice;
          if (j.error) failed = j.error;
          if (j.done) served = j.model;
        }
        const now = performance.now();
        if (answer && now - lastPaint > 60) { out.classList.remove("typing"); out.innerHTML = md(answer); $("chatLog").scrollTop = $("chatLog").scrollHeight; lastPaint = now; }
      }
      if (failed && !answer) throw new Error(failed);
    } catch (e) {
      if (e.name === "AbortError") failed = failed || "답변을 멈췄습니다.";
      else failed = e.message || "알 수 없는 오류";
    } finally {
      busy = null;
      setSending(false);
    }
    out.classList.remove("typing");
    if (answer) {
      out.innerHTML = md(answer);
      history.push({ role: "assistant", content: answer });
      if (served && served !== cfg.model) note(`이번 답변은 ${nameOf(served)} 모델이 대신 작성했습니다.`);
    } else {
      out.remove();
      history.pop(); // 답이 없으면 질문도 기록에서 빼서 다시 보낼 수 있게
      $("chatInput").value = text; autosize();
    }
    if (failed) note(failed, "err");
    if (notice) note(notice);
    history = history.slice(-40);
    store.set("history", history);
    $("chatLog").scrollTop = $("chatLog").scrollHeight;
  }
  function setSending(on) {
    const b = $("chatSend");
    b.textContent = on ? "멈춤" : "전송";
    b.classList.toggle("primary", !on);
    b.classList.toggle("danger", on);
  }

  // ---------- 이벤트 ----------
  function openPanel(prefill) {
    $("chatPanel").classList.remove("hidden");
    $("chatFab").setAttribute("aria-expanded", "true");
    document.body.classList.add("chat-open");
    if (window.FR_SIM && window.FR_SIM.active() && window.FR_SIM.describe().startsWith("시뮬레이션 결과")) lastSimReport = window.FR_SIM.describe();
    renderHistory();
    if (prefill) ask(prefill);
    else setTimeout(() => $("chatInput").focus({ preventScroll: true }), 50);
  }
  function closePanel() {
    $("chatPanel").classList.add("hidden");
    $("chatFab").setAttribute("aria-expanded", "false");
    document.body.classList.remove("chat-open");
  }
  $("chatFab").addEventListener("click", () => ($("chatPanel").classList.contains("hidden") ? openPanel() : closePanel()));
  $("chatClose").addEventListener("click", closePanel);
  $("chatClear").addEventListener("click", () => { if (busy) busy.abort(); history = []; store.set("history", history); renderHistory(); });
  $("chatSetBtn").addEventListener("click", () => {
    const s = $("chatSettings"), open = s.classList.toggle("hidden");
    $("chatSetBtn").setAttribute("aria-expanded", String(!open));
  });
  $("chatModel").addEventListener("change", (e) => { cfg.model = e.target.value; cfg.picked = true; saveCfg(); renderModels(); });
  $("chatEffort").addEventListener("change", (e) => { cfg.effort = e.target.value; saveCfg(); });
  $("chatLatestOnly").addEventListener("change", (e) => { cfg.latestOnly = e.target.checked; saveCfg(); renderModels(); });
  $("chatLoadModels").addEventListener("click", () => loadModels(false));
  $("chatKeySave").addEventListener("click", () => {
    const v = $("chatKey").value.trim();
    if (v.startsWith("••••")) return;
    cfg.key = v; saveCfg(); renderStatus();
    if (v) { $("chatCodeRow").classList.add("hidden"); note("개인 API 키를 저장했습니다. 최신 모델 목록을 불러옵니다."); loadModels(false); }
    else { note("개인 API 키를 지웠습니다."); if (server && server.serverKey && server.accessCodeRequired) $("chatCodeRow").classList.remove("hidden"); }
  });
  $("chatKey").addEventListener("focus", (e) => { if (e.target.value.startsWith("••••")) e.target.value = ""; });
  $("chatKey").addEventListener("blur", (e) => { if (!e.target.value) renderStatus(); });
  $("chatCodeSave").addEventListener("click", () => { cfg.code = $("chatCode").value.trim(); saveCfg(); note("접근 코드를 저장했습니다."); });
  $("chatForm").addEventListener("submit", (e) => { e.preventDefault(); if (busy) { busy.abort(); return; } ask($("chatInput").value); });
  const input = $("chatInput");
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(140, input.scrollHeight) + "px"; }
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("chatForm").requestSubmit(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("chatPanel").classList.contains("hidden")) closePanel(); });

  window.FR_CHAT = { open: openPanel };
  renderModels();
  loadServer();
})();
