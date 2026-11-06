// 비상탈출 지휘 시뮬레이션
// 객실 평면도(B777급, 출구 8개) 위에서 착륙 전 점검 → 충격 대비 → 출구 판단 → 탈출 지휘를 직접 해 보고,
// 결과(탈출 시간·부상자·판단별 평가)를 받는다. 수치는 교육용으로 단순화한 모델이며 실제 인증 시험과 다르다.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // ---------- 객실 모형 (단위: 모형 좌표, 길이 L · 폭 W, y=0이 왼쪽(L) 벽) ----------
  const L = 96, W = 24;
  const AISLES = [8, 16];
  const SEAT_Y = [3, 5.4, 10, 12, 14, 18.6, 21];
  const BLOCKS = [[12, 26], [36, 54], [64, 86]];
  const ROW_GAP = 2.3;
  const EXIT_X = [6, 31, 59, 91];
  const PAX = 140;
  const UNBELTED = 6;
  const CHECK_SECS = 15;
  const BRACE_SECS = 6;
  const COCKPIT_AUTO = 90; // 아무도 판단하지 않으면 정지 90초 뒤 조종실이 탈출 지시 (실제 사고의 지연과 비슷)

  const HAZARD_INFO = {
    clear: { look: "창밖 이상 없음 · 지면이 보이고 불이나 연기가 없습니다.", label: "이상 없음" },
    fire: { look: "창밖에 불꽃과 짙은 검은 연기! 이 출구를 열면 화염과 연기가 들어옵니다.", label: "외부 화재" },
    debris: { look: "창밖에 날카로운 동체 파편과 잔해가 쌓여 있어 슬라이드를 펼칠 공간이 없습니다.", label: "외부 잔해" },
    slideIn: { look: "창밖 이상 없음 · 지면이 보이고 불이나 연기가 없습니다.", label: "슬라이드 기내 팽창" },
    jammed: { look: "창밖 이상 없음. 다만 출구 주변 벽면이 충격으로 찌그러져 보입니다.", label: "문 변형" },
  };

  const SCENARIOS = [
    {
      id: "A", name: "우측 후방 화재 · 슬라이드 이상",
      brief: "활주로 직전 방파제에 꼬리가 부딪힌 뒤 기체가 회전하며 멈춘 상황입니다. 우측 엔진 쪽에서 불이 났고, 앞쪽 슬라이드 하나는 충격으로 고장 났습니다.",
      hazards: { R3: "fire", R4: "fire", R1: "slideIn" }, fire: true,
    },
    {
      id: "B", name: "좌측 날개 화재 · 문 변형",
      brief: "경착륙으로 좌측 주날개가 손상되어 연료가 새고 불이 붙었습니다. 앞쪽 왼편 문은 동체 변형으로 열리지 않을 수 있습니다.",
      hazards: { L2: "fire", L3: "fire", L1: "jammed", R4: "slideIn" }, fire: true,
    },
    {
      id: "C", name: "활주로 이탈 · 후방 동체 손상",
      brief: "활주로를 벗어나 잔해 지대에서 멈췄습니다. 꼬리 쪽 동체가 크게 손상되었고 왼쪽 중간 부근에서 연기가 납니다.",
      hazards: { L4: "debris", R4: "debris", L3: "fire", R2: "slideIn" }, fire: true,
    },
  ];

  const BRACE_OPTS = [
    { text: "일어나서 조종실에 인터폰으로 상황을 묻는다", ok: false, why: "이동 중 충격을 받으면 승무원이 가장 먼저 다칩니다." },
    { text: "자신의 Brace 자세를 취하고 \"머리 숙여! 자세 낮춰!\"를 외친다", ok: true, why: "승무원 본인이 먼저 착석·Brace 해야 이후 탈출을 지휘할 수 있습니다." },
    { text: "기내방송으로 승객을 안심시킨다", ok: false, why: "방송할 시간이 없으며 충격 대비가 우선입니다." },
    { text: "바로 탈출할 수 있도록 출구 핸들을 잡는다", ok: false, why: "기체가 완전히 멈추기 전에 출구를 조작하면 안 됩니다." },
  ];

  // ---------- 난수 ----------
  let seed = 1;
  function rnd() { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const between = (a, b) => a + rnd() * (b - a);

  // ---------- 소리 (Web Audio 합성 + 음성 구령) ----------
  let actx = null;
  function audio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); return actx; } catch { return null; } }
  function beep(f = 660, len = 0.12, type = "sine", vol = 0.12) {
    if (!S.sound) return;
    const a = audio(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), now = a.currentTime;
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + len);
    o.connect(g).connect(a.destination); o.start(now); o.stop(now + len + 0.05);
  }
  function crash() {
    if (!S.sound) return;
    const a = audio(); if (!a) return;
    const len = 1.4, buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = "lowpass"; f.frequency.value = 900; g.gain.value = 0.5;
    src.connect(f).connect(g).connect(a.destination); src.start();
  }
  function say(text) {
    if (!S.sound || !("speechSynthesis" in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = "ko-KR"; u.rate = 1.15; u.pitch = 0.9; speechSynthesis.speak(u); } catch { /* 음성 미지원 */ }
  }

  // ---------- 상태 ----------
  const S = { sound: true, speed: 1 };
  let sc = null;        // 시나리오
  let pax = [], exits = [];
  let phase = "intro";  // intro · check · brace · impact · stopped · evac · done
  let phaseT = 0;       // 현재 단계 경과(초)
  let clock = 0;        // 기체 정지 후 경과(초)
  let smoke = 0;
  let ev = {};          // 평가용 기록
  let logs = [];
  let raf = 0, lastTs = 0, shake = 0, flash = 0;
  let lastReport = null;

  function exitById(id) { return exits.find((e) => e.id === id); }

  function setup(scn) {
    seed = (Date.now() ^ 0x5f3759df) | 0;
    sc = scn;
    exits = [];
    EXIT_X.forEach((x, i) => {
      for (const side of ["L", "R"]) {
        const id = side + (i + 1);
        exits.push({ id, x, side, hazard: sc.hazards[id] || "clear", assessed: false, assessedAt: null, state: "closed", timer: 0, queue: [], served: 0, svc: 0, failedAt: null, openedAt: null, blockedAt: null, unassessedOpen: false });
      }
    });
    // 좌석 만들기
    const seats = [];
    for (const [a, b] of BLOCKS) for (let x = a + 1; x <= b; x += ROW_GAP) for (const y of SEAT_Y) seats.push({ x, y });
    for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; }
    pax = seats.slice(0, PAX).map((s, i) => ({
      i, sx: s.x, sy: s.y, x: s.x, y: s.y, belted: i >= UNBELTED, lug: rnd() < 0.2, dropped: false,
      state: "seated", delay: 0, exit: null, path: [], speed: between(0.9, 1.35), injured: false, why: null, exposure: 0, reTimer: rnd(),
    }));
    smoke = 0; clock = 0; phaseT = 0; shake = 0; flash = 0;
    ev = { found: 0, brace: null, braceAt: null, crewHurt: false, impactInj: 0, reported: null, initiatedBy: null, initiatedAt: null, commandAt: null, dropCmds: 0, autoRedirect: 0, endAt: null };
    logs = [];
  }

  // ---------- 화면 ----------
  function show() {
    for (const s of ["home", "player", "result", "sim"]) $(s).classList.toggle("hidden", s !== "sim");
    window.scrollTo(0, 0);
  }
  function log(msg, kind = "") {
    const t = phase === "stopped" || phase === "evac" || phase === "done" ? `${clock.toFixed(0)}초` : "";
    logs.unshift({ t, msg, kind });
    const ol = $("simLog");
    ol.innerHTML = "";
    for (const l of logs.slice(0, 40)) {
      const li = document.createElement("li");
      if (l.kind) li.className = l.kind;
      li.innerHTML = l.t ? `<span class="mono">${l.t}</span> ` : "";
      li.append(document.createTextNode(l.msg));
      ol.appendChild(li);
    }
  }
  function banner(text, kind = "") {
    const b = $("simBanner");
    b.textContent = text || "";
    b.className = "sim-banner" + (kind ? " " + kind : "") + (text ? "" : " hidden");
  }
  const STEPS = [["check", "① 착륙 전 점검"], ["brace", "② 충격 대비"], ["stopped", "③ 상황 판단"], ["evac", "④ 탈출 지휘"], ["done", "⑤ 결과"]];
  function renderSteps() {
    const idx = { intro: -1, check: 0, brace: 1, impact: 1, stopped: 2, evac: 3, done: 4 }[phase];
    $("simSteps").innerHTML = STEPS.map(([, n], i) => `<span class="${i < idx ? "past" : i === idx ? "on" : ""}">${n}</span>`).join("");
  }
  function panel(title, html) {
    $("simTitle").textContent = title;
    $("simText").innerHTML = html;
  }
  function actions(list) {
    const box = $("simActions");
    box.innerHTML = "";
    for (const a of list) {
      const b = document.createElement("button");
      b.className = "btn " + (a.primary ? "primary" : a.danger ? "danger" : "ghost");
      b.textContent = a.label;
      if (a.disabled) b.disabled = true;
      if (a.id) b.id = a.id;
      b.addEventListener("click", a.on);
      box.appendChild(b);
    }
  }
  function stats() {
    const out = pax.filter((p) => p.state === "out").length;
    const inj = pax.filter((p) => p.injured).length;
    const items = [];
    if (phase === "check") items.push(["남은 시간", Math.max(0, CHECK_SECS - phaseT).toFixed(0) + "초"], ["찾은 승객", `${ev.found}/${UNBELTED}`]);
    if (phase === "brace") items.push(["판단 시간", Math.max(0, BRACE_SECS - phaseT).toFixed(1) + "초"]);
    if (["stopped", "evac", "done"].includes(phase)) {
      items.push(["정지 후", clock.toFixed(0) + "초"], ["탈출", `${out}/${PAX}`], ["부상", String(inj)]);
      if (sc.fire) items.push(["객실 연기", Math.round(smoke * 100) + "%"]);
    }
    $("simStats").innerHTML = items.map(([k, v]) => `<div><span class="muted">${k}</span><b class="mono">${v}</b></div>`).join("");
    $("simClock").textContent = ["stopped", "evac", "done"].includes(phase) ? `⏱ ${clock.toFixed(0)}초` : "";
  }

  // ---------- 단계: 소개 ----------
  function intro() {
    phase = "intro";
    setup(SCENARIOS[0]);
    renderSteps();
    banner("");
    $("simDebrief").classList.add("hidden");
    $("simMain").classList.remove("hidden");
    panel("비상탈출 지휘 시뮬레이션", `
      <p>당신은 이 비행기의 객실 책임 승무원입니다. 착륙 직전부터 모든 승객이 탈출할 때까지 직접 판단하고 지휘합니다.</p>
      <ol class="sim-howto">
        <li><b>착륙 전 점검</b> · 좌석벨트를 매지 않은 승객(주황색)을 찾아 누르세요.</li>
        <li><b>충격 대비</b> · 이상 징후가 보이면 몇 초 안에 올바른 행동을 고르세요.</li>
        <li><b>상황 판단</b> · 기체가 멈추면 출구를 눌러 창밖을 확인하고, 조종실 보고와 탈출 개시를 판단하세요.</li>
        <li><b>탈출 지휘</b> · 안전한 출구는 열고, 위험하거나 고장 난 출구는 막아 승객을 다른 곳으로 보내세요.</li>
      </ol>
      <p class="muted small">시나리오를 고르면 시작합니다. 출구 위험 요소는 직접 확인하기 전까지 보이지 않습니다.</p>`);
    $("simText").appendChild(scenarioPicker());
    actions([]);
    stats();
    draw();
  }
  function scenarioPicker() {
    const box = document.createElement("div");
    box.className = "scn-list";
    const all = [...SCENARIOS, { id: "R", name: "무작위 시나리오", brief: "세 가지 중 하나가 무작위로 정해집니다. 실전처럼 연습할 때 고르세요." }];
    for (const s of all) {
      const b = document.createElement("button");
      b.className = "scn";
      b.innerHTML = `<b>${s.id === "R" ? "🎲" : "시나리오 " + s.id}</b> <span></span><div class="muted small"></div>`;
      b.querySelector("span").textContent = s.name;
      b.querySelector("div").textContent = s.id === "R" ? s.brief : s.brief;
      b.addEventListener("click", () => start(s.id === "R" ? SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)] : s, s.id === "R"));
      box.appendChild(b);
    }
    return box;
  }

  // ---------- 단계: 착륙 전 점검 ----------
  function start(scn, hidden) {
    audio();
    setup(scn);
    ev.hiddenScenario = !!hidden;
    phase = "check"; phaseT = 0;
    renderSteps();
    panel("① 착륙 전 객실 점검", `<p>착륙 3분 전입니다. 객실을 둘러보며 <b>좌석벨트를 매지 않은 승객 ${UNBELTED}명</b>(주황색 점)을 찾아 눌러 벨트를 매게 하세요.</p>
      <p class="muted small">시나리오: ${hidden ? "무작위(비공개)" : sc.name}</p>`);
    actions([{ label: "점검 끝내기", on: () => toBrace() }]);
    banner("착륙 전 점검 · 벨트 미착용 승객을 찾아 누르세요");
    log("착륙 전 객실 점검 시작");
    loop();
  }

  // ---------- 단계: 충격 대비 ----------
  function toBrace() {
    if (phase !== "check") return;
    const left = pax.filter((p) => !p.belted).length;
    log(left ? `벨트 미착용 승객 ${left}명을 찾지 못함` : "모든 승객 좌석벨트 착용 확인", left ? "bad" : "ok");
    phase = "brace"; phaseT = 0;
    renderSteps();
    banner("고도 100ft · 창밖 지면이 비정상적으로 가깝고 엔진 소리가 갑자기 커졌습니다!", "warn");
    beep(880, 0.25, "square", 0.08); setTimeout(() => beep(880, 0.25, "square", 0.08), 350);
    panel("② 충격 대비 · 지금 무엇을 하나요?", `<p>점프시트에 앉아 있습니다. <b>${BRACE_SECS}초 안에</b> 고르세요.</p>`);
    actions(BRACE_OPTS.map((o, i) => ({ label: `${"①②③④"[i]} ${o.text}`, on: () => chooseBrace(i) })));
    $("simActions").classList.add("stack");
  }
  function chooseBrace(i) {
    if (phase !== "brace" || ev.brace !== null) return;
    ev.brace = i; ev.braceAt = phaseT;
    const o = BRACE_OPTS[i];
    if (o.ok) { log(`Brace 자세 + 충격 구령 (${phaseT.toFixed(1)}초)`, "ok"); say("머리 숙여! 자세 낮춰!"); }
    else { log("충격 대비 판단 오류 · " + o.why, "bad"); ev.crewHurt = i === 0 || i === 3; }
    impact();
  }

  // ---------- 단계: 충격 ----------
  function impact() {
    if (ev.brace === null) { log("판단 시간 초과 · Brace 구령 없음", "bad"); }
    $("simActions").classList.remove("stack");
    phase = "impact"; phaseT = 0;
    renderSteps();
    shake = 1.6; flash = 1;
    crash();
    if (navigator.vibrate) try { navigator.vibrate([150, 60, 260]); } catch { /* 진동 미지원 */ }
    banner("💥 충돌!", "bad");
    panel("충돌", "<p>기체가 활주로에 부딪히며 크게 흔들립니다…</p>");
    actions([]);
    // 충격 부상
    for (const p of pax) {
      if (!p.belted) { p.injured = true; p.why = "벨트 미착용으로 충격 시 좌석 밖으로 튕겨 나감"; ev.impactInj++; }
    }
    const braced = ev.brace !== null && BRACE_OPTS[ev.brace].ok;
    if (!braced) {
      const n = 5;
      const pool = pax.filter((p) => !p.injured);
      for (let k = 0; k < n; k++) { const p = pool[Math.floor(rnd() * pool.length)]; if (p && !p.injured) { p.injured = true; p.why = "Brace 구령을 듣지 못해 충격 자세 없이 부딪힘"; ev.impactInj++; } }
    }
    if (ev.crewHurt) log("승무원이 충격 중 이동하다 다침 · 이후 지휘가 늦어짐", "bad");
    if (ev.impactInj) log(`충격으로 승객 ${ev.impactInj}명 부상`, "bad");
  }

  // ---------- 단계: 정지 후 판단 ----------
  function toStopped() {
    phase = "stopped"; phaseT = 0; clock = 0;
    renderSteps();
    banner("기장 방송: \"좌석에서 대기하십시오. Remain seated.\"", "info");
    say("좌석에서 대기하십시오");
    log("기체 정지 · 조종실: 좌석에서 대기 지시");
    if (sc.fire) setTimeout(() => { if (phase === "stopped" || phase === "evac") log("타는 냄새가 나기 시작합니다", "warn"); }, 3000);
    panel("③ 기체 정지 · 상황 판단", `<p>조종실은 <b>좌석 대기</b>를 지시했습니다. 하지만 조종실은 객실 밖 상황을 다 볼 수 없습니다.</p>
      <p>평면도에서 <b>출구(L1~L4, R1~R4)를 눌러 창밖을 확인</b>하세요. 생명이 위험한 상황이면 조종실에 보고하고, 필요하면 직접 탈출을 개시할 수 있습니다.</p>`);
    renderStoppedActions();
  }
  function renderStoppedActions() {
    actions([
      { label: ev.reported !== null ? "조종실 보고 완료" : "📞 조종실에 보고 (화재·연기·손상)", disabled: ev.reported !== null, on: report },
      { label: "📣 탈출 개시: \"벨트 풀어! 짐 버려! 나와!\"", primary: true, on: () => startEvac("crew") },
    ]);
  }
  function report() {
    if (ev.reported !== null) return;
    ev.reported = clock;
    const seen = exits.filter((e) => e.assessed && e.hazard !== "clear" && e.hazard !== "slideIn" && e.hazard !== "jammed");
    if (seen.length) {
      log(`조종실에 보고: ${seen.map((e) => e.id + " " + HAZARD_INFO[e.hazard].label).join(", ")}`, "ok");
      setTimeout(() => {
        if (phase !== "stopped") return;
        log("조종실: \"확인. EVACUATE, EVACUATE!\"", "ok");
        say("이베큐에이트");
        startEvac("cockpit");
      }, 4000 / S.speed);
    } else {
      log("조종실에 보고했지만 구체적인 위험(위치·종류)을 확인하지 않아 조종실이 판단을 미룸", "warn");
    }
    renderStoppedActions();
  }

  // ---------- 단계: 탈출 ----------
  function startEvac(by) {
    if (phase !== "stopped") return;
    ev.initiatedBy = by; ev.initiatedAt = clock;
    phase = "evac"; phaseT = 0;
    renderSteps();
    const cmd = by === "crew";
    if (cmd) { ev.commandAt = clock; say("벨트 풀어! 짐 버려! 나와!"); log("승무원 판단으로 탈출 개시 · 구령 \"벨트 풀어! 짐 버려! 나와!\"", "ok"); }
    else if (by === "cockpit") log("조종실 지시로 탈출 개시");
    else log("정지 90초 후에야 조종실이 탈출을 지시함", "bad");
    banner("탈출 진행 중 · 출구를 눌러 개방하거나 차단하세요", "info");
    for (const p of pax) {
      if (p.state !== "seated") continue;
      p.delay = cmd ? between(0.5, 2.5) : between(3, 9);
      if (ev.crewHurt) p.delay += 3;
      p.state = "wait";
    }
    panel("④ 탈출 지휘", `<p>출구를 눌러 <b>개방</b>하거나 <b>차단·재유도</b>하세요. 열고 나서야 드러나는 고장(슬라이드 이상, 문 변형)도 있습니다.</p>
      <p class="muted small">노란 테두리 승객은 짐을 챙기고 있어 느립니다. '짐 버려!' 구령으로 줄일 수 있어요.</p>`);
    renderEvacActions();
  }
  function renderEvacActions() {
    const list = [];
    if (ev.commandAt === null) list.push({ label: "📣 구령: \"벨트 풀어! 짐 버려! 나와!\"", primary: true, on: giveCommand });
    list.push({ label: "🧳 \"짐 버려!\"", on: dropBags, id: "simDrop" });
    list.push({ label: S.speed === 1 ? "⏩ 2배속" : "▶ 1배속", on: () => { S.speed = S.speed === 1 ? 2 : 1; renderEvacActions(); } });
    actions(list);
  }
  function giveCommand() {
    if (ev.commandAt !== null) return;
    ev.commandAt = clock;
    say("벨트 풀어! 짐 버려! 나와!");
    log("구령 \"벨트 풀어! 짐 버려! 나와!\"", "ok");
    for (const p of pax) if (p.state === "wait") p.delay = Math.min(p.delay, between(0.3, 1.8));
    for (const p of pax) if (p.lug && rnd() < 0.5) p.dropped = true;
    renderEvacActions();
  }
  let dropCool = 0;
  function dropBags() {
    if (dropCool > 0) return;
    dropCool = 5;
    ev.dropCmds++;
    say("짐 버려!");
    let n = 0;
    for (const p of pax) if (p.lug && !p.dropped && p.state !== "out" && rnd() < 0.75) { p.dropped = true; n++; }
    log(`"짐 버려!" · 승객 ${n}명이 짐을 내려놓음`, n ? "ok" : "");
  }

  // ---------- 출구 조작 ----------
  let popExit = null;
  function openExitSheet(e) {
    popExit = e;
    renderExitSheet();
    $("simExit").classList.remove("hidden");
  }
  function closeExitSheet() { $("simExit").classList.add("hidden"); popExit = null; }
  function renderExitSheet() {
    const e = popExit; if (!e) return;
    $("seTitle").textContent = `${e.id} 출구 (${e.side === "L" ? "왼쪽" : "오른쪽"} ${e.id.slice(1)}번)`;
    const stateTxt = { closed: "닫힘", opening: "슬라이드 팽창 중…", open: "개방 · 사용 중", blocked: "차단 · 다른 출구로 재유도 중", failed: e.hazard === "jammed" ? "문이 열리지 않음!" : "슬라이드 기내 팽창 · 사용 불가!" }[e.state];
    $("seState").textContent = "상태: " + stateTxt;
    const look = $("seLook");
    look.textContent = e.assessed ? HAZARD_INFO[e.hazard].look : "아직 창밖을 확인하지 않았습니다.";
    look.className = "se-look" + (e.assessed && (e.hazard === "fire" || e.hazard === "debris") ? " bad" : e.assessed ? " ok" : "");
    const box = $("seActions");
    box.innerHTML = "";
    const add = (label, cls, on, disabled) => { const b = document.createElement("button"); b.className = "btn " + cls; b.textContent = label; b.disabled = !!disabled; b.addEventListener("click", on); box.appendChild(b); };
    if (!e.assessed) add("👀 창밖 확인", "primary", () => { assess(e); renderExitSheet(); });
    const canOpen = phase === "evac" && (e.state === "closed" || e.state === "blocked");
    add("개방 (슬라이드 팽창)", e.assessed && e.hazard !== "fire" && e.hazard !== "debris" ? "primary" : "ghost", () => { openExit(e); closeExitSheet(); }, !canOpen);
    add("차단 · \"이쪽 출구 사용 불가! 저쪽으로!\"", "danger", () => { blockExit(e); closeExitSheet(); }, e.state === "blocked");
    $("seNote").textContent = phase === "stopped" ? "탈출 개시 전에는 출구를 열 수 없습니다. 먼저 창밖을 확인해 두세요." : "";
  }
  function assess(e) {
    if (e.assessed) return;
    e.assessed = true; e.assessedAt = clock;
    const bad = e.hazard === "fire" || e.hazard === "debris";
    log(`${e.id} 창밖 확인: ${bad ? HAZARD_INFO[e.hazard].label : "이상 없음"}`, bad ? "warn" : "");
  }
  function openExit(e) {
    if (phase !== "evac") return;
    if (!e.assessed) e.unassessedOpen = true;
    e.openedAt = clock;
    beep(520, 0.1);
    if (e.hazard === "jammed") {
      e.state = "opening"; e.timer = 2;
      log(`${e.id} 개방 시도`);
    } else {
      e.state = "opening"; e.timer = 6;
      log(`${e.id} 개방 · 슬라이드 팽창 중${e.assessed ? "" : " (창밖 확인 없이 개방)"}`, e.assessed ? "" : "warn");
    }
  }
  function blockExit(e) {
    const prev = e.state;
    e.state = "blocked"; e.blockedAt = clock;
    say("이쪽 출구 사용 불가! 저쪽으로!");
    log(`${e.id} 차단 · 승객을 다른 출구로 재유도`, prev === "failed" || e.hazard === "fire" || e.hazard === "debris" ? "ok" : "");
    redirectFrom(e);
  }
  function redirectFrom(e) {
    for (const p of e.queue) { p.state = "move"; p.exit = null; p.path = []; }
    e.queue = [];
    for (const p of pax) if (p.exit === e) { p.exit = null; p.path = []; }
  }

  // ---------- 승객 이동 ----------
  const doorY = (e) => (e.side === "L" ? 0.8 : W - 0.8);
  const nearestAisle = (y) => (Math.abs(y - AISLES[0]) < Math.abs(y - AISLES[1]) ? AISLES[0] : AISLES[1]);
  function usable(e) { return e.state === "open" || e.state === "opening"; }
  function chooseExit(p) {
    let best = null, bestC = Infinity;
    for (const e of exits) {
      if (!usable(e)) continue;
      const ay = e.side === "L" ? AISLES[0] : AISLES[1];
      const c = Math.abs(p.x - e.x) + Math.abs(p.y - ay) * 0.5 + e.queue.length * 0.9 + (e.state === "opening" ? e.timer * 1.1 : 0) + rnd() * 2;
      if (c < bestC) { bestC = c; best = e; }
    }
    return best;
  }
  function planPath(p, e) {
    const ay = Math.abs(p.x - e.x) < 2.5 ? p.y : nearestAisle(p.y);
    const ay2 = e.side === "L" ? AISLES[0] : AISLES[1];
    p.path = [];
    if (Math.abs(p.x - e.x) >= 2.5) p.path.push({ x: p.x, y: ay }, { x: e.x + (rnd() - 0.5) * 1.2, y: ay });
    p.path.push({ x: e.x, y: ay2 }, { x: e.x, y: doorY(e) });
  }
  function stepPax(p, dt) {
    if (p.state === "out" || p.state === "seated" || p.state === "queue") return;
    if (p.state === "wait") {
      p.delay -= dt;
      if (p.delay > 0) return;
      p.state = "move";
    }
    p.reTimer -= dt;
    if (!p.exit || !usable(p.exit) || p.reTimer <= 0) {
      p.reTimer = 1.2;
      const e = chooseExit(p);
      if (e !== p.exit) { p.exit = e; if (e) planPath(p, e); }
    }
    if (!p.exit) return; // 열린 출구가 없으면 제자리에서 기다림
    let v = p.speed * (p.lug && !p.dropped ? 0.6 : 1) * (1 - smoke * 0.45) * (p.injured ? 0.7 : 1);
    let move = v * dt * 3.2;
    while (move > 0 && p.path.length) {
      const w = p.path[0], dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
      if (d <= move) { p.x = w.x; p.y = w.y; move -= d; p.path.shift(); }
      else { p.x += (dx / d) * move; p.y += (dy / d) * move; move = 0; }
    }
    if (!p.path.length) { p.state = "queue"; p.exit.queue.push(p); }
    // 연기 노출
    if (smoke > 0.45) {
      p.exposure += dt * (smoke - 0.45);
      if (p.exposure > 4 && !p.injured) { p.injured = true; p.why = "탈출이 늦어져 짙은 연기를 들이마심"; }
    }
  }
  function stepExit(e, dt) {
    if (e.state === "opening") {
      e.timer -= dt;
      if (e.timer <= 0) {
        if (e.hazard === "slideIn" || e.hazard === "jammed") {
          e.state = "failed"; e.failedAt = clock;
          banner(`${e.id}: ${e.hazard === "jammed" ? "문이 변형되어 열리지 않습니다!" : "슬라이드가 기내 쪽으로 팽창했습니다!"} 출구를 막고 승객을 돌려보내세요`, "bad");
          log(`${e.id} ${e.hazard === "jammed" ? "문 변형 · 열리지 않음" : "슬라이드 기내 팽창 · 사용 불가"}`, "bad");
          beep(300, 0.3, "triangle", 0.15);
        } else {
          e.state = "open";
          log(`${e.id} 슬라이드 팽창 완료 · 사용 가능`, e.hazard === "fire" ? "bad" : "ok");
          if (e.hazard === "fire") banner(`${e.id}: 열린 출구로 불길과 연기가 들어옵니다!`, "bad");
          if (e.hazard === "debris") banner(`${e.id}: 슬라이드가 잔해에 찢겨 기울었습니다!`, "bad");
        }
      }
    }
    if (e.state === "failed" && e.queue.length && clock - e.failedAt > 12) {
      // 아무도 막지 않으면 승객끼리 밀치며 스스로 돌아섬
      ev.autoRedirect++;
      const n = Math.min(3, e.queue.length);
      for (let k = 0; k < n; k++) { const p = e.queue[k]; if (!p.injured) { p.injured = true; p.why = "막히지 않은 고장 출구 앞에서 밀치다 다침"; } }
      log(`${e.id} 앞 승객들이 밀치며 스스로 돌아섬 · 부상 발생`, "bad");
      e.failedAt = clock; // 다시 12초 뒤 반복
      redirectFrom(e);
      e.state = "failed";
    }
    if (e.state !== "open") return;
    e.svc -= dt;
    // 줄 서 있는 위치
    e.queue.forEach((p, i) => {
      const inward = e.side === "L" ? 1 : -1;
      const k = Math.min(i, 8);
      p.x = e.x + (i > 8 ? ((i - 8) % 2 ? 1 : -1) * Math.ceil((i - 8) / 2) * 0.9 : 0);
      p.y = doorY(e) + inward * k * 0.9;
    });
    if (e.svc <= 0 && e.queue.length) {
      const p = e.queue.shift();
      p.state = "out"; e.served++;
      if (e.hazard === "fire" && !p.injured && rnd() < 0.45) { p.injured = true; p.why = `불이 난 ${e.id} 출구로 나가다 화상`; }
      if (e.hazard === "debris" && !p.injured && rnd() < 0.5) { p.injured = true; p.why = `잔해가 있는 ${e.id} 출구로 나가다 다침`; }
      let t = 1.05 / (e.hazard === "debris" ? 0.6 : 1);
      if (p.lug && !p.dropped) t += 1.5;
      e.svc = t;
    }
  }

  function update(dt) {
    phaseT += dt;
    shake = Math.max(0, shake - dt);
    flash = Math.max(0, flash - dt * 2);
    dropCool = Math.max(0, dropCool - dt);
    if (phase === "check" && phaseT >= CHECK_SECS) toBrace();
    if (phase === "brace" && phaseT >= BRACE_SECS) impact();
    if (phase === "impact") {
      // 충격으로 승객 위치가 조금 흔들림
      for (const p of pax) { p.x = p.sx + (rnd() - 0.5) * shake * 0.6; p.y = p.sy + (rnd() - 0.5) * shake * 0.6; }
      if (phaseT >= 2.2) { for (const p of pax) { p.x = p.sx; p.y = p.sy; } toStopped(); }
    }
    if (phase === "stopped" || phase === "evac") {
      const sdt = dt * S.speed;
      clock += sdt;
      if (sc.fire) {
        const openFire = exits.some((e) => e.state === "open" && e.hazard === "fire");
        smoke = Math.min(1, smoke + sdt * (0.0055 + (openFire ? 0.02 : 0)));
      }
      if (phase === "stopped" && clock >= COCKPIT_AUTO) startEvac("late");
      if (phase === "evac") {
        for (const e of exits) stepExit(e, sdt);
        for (const p of pax) stepPax(p, sdt);
        const left = pax.filter((p) => p.state !== "out").length;
        if (!left || clock > 300) finish();
      }
    }
  }

  // ---------- 그리기 ----------
  const cv = $("simCanvas");
  const ctx = cv.getContext("2d");
  let view = { vertical: false, s: 1, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
  function layout() {
    const wrap = cv.parentElement;
    const w = wrap.clientWidth;
    const vertical = w < 560;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pad = 26;
    let s, h, ox, oy;
    if (vertical) {
      // 휴대폰: 평면도가 화면 높이 안에 들어오도록 (출구 이름 자리 확보)
      const fitW = (w - 70) / W;
      const fitH = Math.max(320, window.innerHeight - 250) / (L + 25);
      s = Math.max(4.6, Math.min(fitW, fitH));
      h = s * (L + 25) + 10;
      ox = (w - W * s) / 2; oy = s * 14 + 4;
    } else {
      s = (w - pad * 2 - 40) / (L + 26); h = s * (W + 2) + pad * 2 + 30;
      ox = pad + 20 + s * 14; oy = pad + 15;
    }
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.height = h + "px";
    view = { vertical, s, dpr, w, h, ox, oy };
  }
  // 모형 좌표 → 화면 좌표 (CSS 픽셀)
  function toScreen(x, y) {
    const { vertical, s, ox, oy } = view;
    return vertical ? [ox + y * s, oy + x * s] : [ox + x * s, oy + (W - y) * s];
  }
  function modelTransform() {
    const { vertical, s, ox, oy, dpr } = view;
    const sh = shake > 0 ? (Math.random() - 0.5) * shake * 8 : 0;
    if (vertical) ctx.setTransform(0, s * dpr, s * dpr, 0, (ox + sh) * dpr, oy * dpr);
    else ctx.setTransform(s * dpr, 0, 0, -s * dpr, (ox + sh) * dpr, (oy + W * s) * dpr);
  }
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function draw() {
    const { dpr, w, h } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    modelTransform();
    // 동체
    ctx.fillStyle = "#1a2846"; ctx.strokeStyle = "#3a5080"; ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(-1, 0); ctx.lineTo(L, 0); ctx.quadraticCurveTo(L + 10, 2, L + 14, W / 2 - 1); ctx.lineTo(L + 14, W / 2 + 1); ctx.quadraticCurveTo(L + 10, W - 2, L, W);
    ctx.lineTo(-1, W); ctx.bezierCurveTo(-8, W, -12, W * 0.7, -13, W / 2); ctx.bezierCurveTo(-12, W * 0.3, -8, 0, -1, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // 조종실
    ctx.fillStyle = "#24365c"; ctx.fillRect(-9, 7, 6, W - 14);
    // 통로
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1.6;
    for (const ay of AISLES) { ctx.beginPath(); ctx.moveTo(2, ay); ctx.lineTo(L - 2, ay); ctx.stroke(); }
    for (const x of EXIT_X) { ctx.beginPath(); ctx.moveTo(x, 0.5); ctx.lineTo(x, W - 0.5); ctx.stroke(); }
    // 좌석
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    for (const [a, b] of BLOCKS) for (let x = a + 1; x <= b; x += ROW_GAP) for (const y of SEAT_Y) ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    // 연기
    if (smoke > 0.02) { ctx.fillStyle = `rgba(150,150,160,${Math.min(0.55, smoke * 0.6)})`; ctx.fillRect(-1, 0, L + 1, W); }
    // 출구
    const blink = Math.floor(performance.now() / 300) % 2;
    for (const e of exits) {
      const y0 = e.side === "L" ? -0.6 : W - 0.6;
      const col = { closed: "#7d8aa3", opening: blink ? "#ffd21f" : "#a08310", open: "#50d278", blocked: "#eb463c", failed: blink ? "#ff8a3d" : "#eb463c" }[e.state];
      ctx.fillStyle = col; ctx.fillRect(e.x - 1.6, y0, 3.2, 1.2);
      const out = e.side === "L" ? -1 : 1; const base = e.side === "L" ? 0 : W;
      if (e.state === "open") { // 슬라이드
        ctx.fillStyle = e.hazard === "debris" ? "rgba(255,138,61,0.55)" : "rgba(255,210,31,0.55)";
        ctx.beginPath(); ctx.moveTo(e.x - 1.6, base); ctx.lineTo(e.x + 1.6, base); ctx.lineTo(e.x + 2.6, base + out * 9); ctx.lineTo(e.x - 2.6, base + out * 9); ctx.closePath(); ctx.fill();
      }
      if (e.state === "failed" && e.hazard === "slideIn") {
        ctx.fillStyle = "rgba(255,138,61,0.7)"; ctx.beginPath(); ctx.ellipse(e.x, base - out * 2.6, 3, 2.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      // 확인된 외부 위험
      if ((e.assessed || e.state === "open") && (e.hazard === "fire" || e.hazard === "debris")) {
        const cy = base + out * 5;
        if (e.hazard === "fire") {
          for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? "rgba(255,90,40,0.75)" : "rgba(255,190,40,0.7)"; ctx.beginPath(); ctx.arc(e.x + Math.sin(performance.now() / 180 + k) * 2.2, cy + Math.cos(performance.now() / 230 + k * 2) * 1.6, 1.4 + (k % 3) * 0.4, 0, Math.PI * 2); ctx.fill(); }
        } else {
          ctx.fillStyle = "#8b8f99";
          for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(e.x - 3 + k * 1.5, cy - 1); ctx.lineTo(e.x - 2.2 + k * 1.5, cy + 1.6); ctx.lineTo(e.x - 3.6 + k * 1.5, cy + 1.2); ctx.closePath(); ctx.fill(); }
        }
      }
      if (e.state === "blocked") {
        ctx.strokeStyle = "#eb463c"; ctx.lineWidth = 0.6;
        const yy = e.side === "L" ? 2.2 : W - 2.2;
        ctx.beginPath(); ctx.moveTo(e.x - 1.4, yy - 1.4); ctx.lineTo(e.x + 1.4, yy + 1.4); ctx.moveTo(e.x + 1.4, yy - 1.4); ctx.lineTo(e.x - 1.4, yy + 1.4); ctx.stroke();
      }
    }
    // 승객
    for (const p of pax) {
      if (p.state === "out") continue;
      let c = "#cfe0ff";
      if (phase === "check" && !p.belted) c = blink ? "#ff9a3d" : "#ffbe7a";
      else if (p.injured) c = "#eb463c";
      else if (p.state === "move" || p.state === "queue") c = "#ffffff";
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(p.x, p.y, 0.62, 0, Math.PI * 2); ctx.fill();
      if (p.lug && !p.dropped && phase === "evac") { ctx.strokeStyle = "#ffd21f"; ctx.lineWidth = 0.28; ctx.stroke(); }
    }
    // 화면 좌표 글자 (출구 이름)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = "700 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const e of exits) {
      const [sx, sy] = toScreen(e.x, e.side === "L" ? -3.2 - (view.vertical ? 1.2 : 0) : W + 3.2 + (view.vertical ? 1.2 : 0));
      ctx.fillStyle = e.state === "closed" ? (e.assessed ? "#cfd6e4" : "#9aa6bb") : "#fff";
      const tag = e.id + (e.assessed && e.state === "closed" ? (e.hazard === "fire" || e.hazard === "debris" ? " ⚠" : " ✓") : "");
      ctx.fillText(tag, sx, sy);
    }
    const [nx, ny] = toScreen(-10, W / 2);
    ctx.fillStyle = "#9aa6bb"; ctx.font = "600 11px system-ui, sans-serif"; ctx.fillText("조종실", nx, ny);
    if (flash > 0) { ctx.fillStyle = `rgba(255,240,220,${flash * 0.6})`; ctx.fillRect(0, 0, w, h); }
  }

  // 터치
  cv.addEventListener("click", (evt) => {
    const r = cv.getBoundingClientRect();
    const mx = evt.clientX - r.left, my = evt.clientY - r.top;
    if (phase === "check") {
      let best = null, bd = 18;
      for (const p of pax) { if (p.belted) continue; const [sx, sy] = toScreen(p.x, p.y); const d = Math.hypot(sx - mx, sy - my); if (d < bd) { bd = d; best = p; } }
      if (best) {
        best.belted = true; ev.found++;
        beep(990, 0.08);
        log(`좌석벨트 착용 안내 (${ev.found}/${UNBELTED})`, "ok");
        if (ev.found >= UNBELTED) setTimeout(toBrace, 400);
      }
      return;
    }
    if (phase === "stopped" || phase === "evac") {
      let best = null, bd = 30;
      for (const e of exits) {
        const pts = [toScreen(e.x, e.side === "L" ? 0 : W), toScreen(e.x, e.side === "L" ? -4.4 : W + 4.4)];
        for (const [sx, sy] of pts) { const d = Math.hypot(sx - mx, sy - my); if (d < bd) { bd = d; best = e; } }
      }
      if (best) openExitSheet(best);
    }
  });

  // ---------- 루프 ----------
  function loop() {
    cancelAnimationFrame(raf);
    lastTs = performance.now();
    const tick = (ts) => {
      const dt = Math.min(0.1, (ts - lastTs) / 1000);
      lastTs = ts;
      // 출구 확인 창이 열려 있으면 시간을 멈춘다 (창 안 버튼은 다시 그리지 않음)
      if (!document.hidden && $("simExit").classList.contains("hidden")) update(dt);
      draw();
      stats();
      if (phase !== "done" && phase !== "intro" && !$("sim").classList.contains("hidden")) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  // ---------- 결과 ----------
  function finish() {
    phase = "done";
    ev.endAt = clock;
    renderSteps();
    banner("");
    const out = pax.filter((p) => p.state === "out").length;
    const injured = pax.filter((p) => p.injured);
    const evacTime = ev.endAt;
    const afterInit = ev.endAt - (ev.initiatedAt ?? 0);
    log(`탈출 종료 · ${out}/${PAX}명 탈출`, out === PAX ? "ok" : "bad");

    const items = [];
    const add = (ok, title, detail) => items.push({ ok, title, detail });
    add(ev.found === UNBELTED ? 1 : ev.found >= UNBELTED - 2 ? 0 : -1, `착륙 전 벨트 점검 ${ev.found}/${UNBELTED}명`,
      ev.found === UNBELTED ? "모든 승객이 벨트를 맸습니다." : `찾지 못한 ${UNBELTED - ev.found}명이 충격 때 크게 다쳤습니다. 실제 214편 사고 사망자 3명 중 2명은 벨트를 매지 않은 승객이었습니다.`);
    const braced = ev.brace !== null && BRACE_OPTS[ev.brace].ok;
    add(braced ? 1 : -1, "충격 대비(Brace) 판단", braced ? `${ev.braceAt.toFixed(1)}초 만에 Brace 자세와 충격 구령을 했습니다.` : (ev.brace === null ? "시간 안에 판단하지 못했습니다. " : BRACE_OPTS[ev.brace].why + " ") + "정답은 '자신의 Brace 자세 + 머리 숙여! 자세 낮춰!'입니다.");
    const fireExits = exits.filter((e) => e.hazard === "fire" || e.hazard === "debris");
    const reportedOk = ev.reported !== null && fireExits.some((e) => e.assessed && e.assessedAt <= ev.reported);
    add(reportedOk ? 1 : ev.reported !== null ? 0 : -1, "조종실 보고", reportedOk ? `정지 ${ev.reported.toFixed(0)}초에 위험 위치와 종류를 보고했습니다.` : ev.reported !== null ? "보고는 했지만 창밖 확인 없이 해서 구체적인 정보가 없었습니다." : "외부 화재·연기를 조종실에 알리지 않았습니다. 조종실은 객실 밖을 다 볼 수 없습니다.");
    const it = ev.initiatedAt ?? 0;
    add(ev.initiatedBy === "late" ? -1 : it <= 30 ? 1 : 0, `탈출 개시 ${it.toFixed(0)}초 (${{ crew: "승무원 판단", cockpit: "조종실 지시", late: "90초 뒤 조종실 지시" }[ev.initiatedBy]})`,
      ev.initiatedBy === "late" ? "판단이 없어 탈출이 90초 늦어졌습니다. 실제 사고에서도 탈출 개시가 약 90초 늦어졌습니다." : it <= 30 ? "빠르게 탈출을 시작했습니다." : "탈출 개시가 늦었습니다. 생명을 위협하는 상황이면 즉시 보고하고 탈출을 개시합니다.");
    add(ev.commandAt !== null && ev.commandAt - it <= 3 ? 1 : ev.commandAt !== null ? 0 : -1, "탈출 구령", ev.commandAt !== null ? `"벨트 풀어! 짐 버려! 나와!" 구령으로 승객 반응이 빨라졌습니다.` : "구령이 없어 승객들이 머뭇거렸습니다.");
    for (const e of exits) {
      let ok, d;
      const opened = e.openedAt !== null;
      if (e.hazard === "fire" || e.hazard === "debris") {
        ok = opened ? -1 : e.assessed ? 1 : 0;
        d = opened ? `${HAZARD_INFO[e.hazard].label}가 있는데 열었습니다${e.unassessedOpen ? " (창밖 확인 없이)" : ""}. 이 출구로 나간 승객이 다쳤습니다.` : e.assessed ? `창밖에서 ${HAZARD_INFO[e.hazard].label}를 확인하고 사용하지 않았습니다.` : "열지는 않았지만 창밖을 확인하지 않았습니다.";
      } else if (e.hazard === "slideIn" || e.hazard === "jammed") {
        if (!opened) { ok = 0; d = "열지 않아 고장은 드러나지 않았습니다. 정상으로 보이는 출구는 열어 확인해야 합니다."; }
        else if (e.blockedAt !== null && e.failedAt !== null && e.blockedAt - e.failedAt <= 8) { ok = 1; d = `${HAZARD_INFO[e.hazard].label}를 보고 ${Math.max(0, e.blockedAt - e.failedAt).toFixed(0)}초 만에 막고 재유도했습니다.`; }
        else { ok = -1; d = `${HAZARD_INFO[e.hazard].label} 뒤 출구를 바로 막지 않아 승객이 몰렸습니다. 즉시 차단(Block)하고 다른 출구로 재유도(Redirect)합니다.`; }
      } else {
        ok = opened ? (e.unassessedOpen ? 0 : 1) : -1;
        d = opened ? (e.unassessedOpen ? "안전한 출구였지만 창밖 확인 없이 열었습니다." : "확인 후 열어 승객 " + e.served + "명을 탈출시켰습니다.") : "안전한 출구인데 열지 않아 탈출 시간이 늘었습니다.";
      }
      add(ok, `${e.id} 출구 · ${HAZARD_INFO[e.hazard].label}`, d);
    }
    const lugLeft = pax.filter((p) => p.lug && !p.dropped).length;
    add(lugLeft <= 6 ? 1 : 0, `휴대 수하물`, lugLeft <= 6 ? "짐을 챙기는 승객을 잘 통제했습니다." : `짐을 챙긴 승객 ${lugLeft}명 때문에 출구에서 시간이 늘었습니다. "짐 버려!"를 반복해 외치세요.`);

    const score = Math.max(0, Math.round(100 * items.reduce((s, i) => s + (i.ok === 1 ? 1 : i.ok === 0 ? 0.5 : 0), 0) / items.length));
    const why = {};
    for (const p of injured) why[p.why || "기타"] = (why[p.why || "기타"] || 0) + 1;

    lastReport = { scenario: sc.name, brief: sc.brief, score, out, total: PAX, injured: injured.length, evacTime, afterInit, initiatedBy: ev.initiatedBy, items, why };

    $("simMain").classList.add("hidden");
    const d = $("simDebrief");
    d.classList.remove("hidden");
    d.innerHTML = `
      <div class="sim-score"><div class="big">${score}<small>점</small></div>
        <div><div class="muted">시나리오 ${sc.id} · ${sc.name}</div>
        <div class="kpis">
          <span><b class="mono">${evacTime.toFixed(0)}초</b><i>정지 후 전원 탈출</i></span>
          <span><b class="mono">${afterInit.toFixed(0)}초</b><i>탈출 개시 후</i></span>
          <span><b class="mono">${out}/${PAX}</b><i>탈출 인원</i></span>
          <span><b class="mono">${injured.length}명</b><i>부상</i></span>
        </div></div></div>
      <p class="muted small">${afterInit <= 90 ? "탈출 개시 후 90초 안에 모두 나왔습니다." : "탈출 개시 후 90초를 넘겼습니다."} 항공기 인증 기준은 출구 절반만으로 90초 안에 전원 탈출하는 것입니다(교육용 단순화 모델).</p>
      <h2 class="h2">판단별 평가</h2>
      <div class="eval-list">${items.map((i) => `<div class="ev ${i.ok === 1 ? "ok" : i.ok === 0 ? "mid" : "no"}"><span class="mk">${i.ok === 1 ? "O" : i.ok === 0 ? "△" : "X"}</span><div><b></b><div class="muted"></div></div></div>`).join("")}</div>
      ${injured.length ? `<h2 class="h2">부상 원인</h2><ul class="why-list">${Object.entries(why).map(([k, v]) => `<li><b>${v}명</b> <span></span></li>`).join("")}</ul>` : ""}
      <div class="sim-end-actions">
        <button class="btn primary" id="simAsk">🤖 AI 교관에게 결과 해설 듣기</button>
        <button class="btn ghost" id="simRetry">같은 시나리오 다시</button>
        <button class="btn ghost" id="simOther">다른 시나리오</button>
      </div>`;
    const evs = d.querySelectorAll(".ev");
    items.forEach((it2, k) => { evs[k].querySelector("b").textContent = it2.title; evs[k].querySelector(".muted").textContent = it2.detail; });
    const wl = d.querySelectorAll(".why-list li span");
    Object.keys(why).forEach((k, i) => { wl[i].textContent = k; });
    $("simAsk").addEventListener("click", () => {
      if (window.FR_CHAT) window.FR_CHAT.open("방금 한 비상탈출 시뮬레이션 결과를 해설해 주세요. 잘한 점, 가장 크게 고쳐야 할 점, 실제 사고(214편) 교훈과의 연결을 알려 주세요.");
    });
    const cur = sc;
    $("simRetry").addEventListener("click", () => start(cur, ev.hiddenScenario));
    $("simOther").addEventListener("click", intro);
    draw();
  }

  // 챗봇에 넘겨 줄 현재 상황 요약
  function describe() {
    if (phase === "intro") return "시뮬레이션 화면 · 시나리오 선택 중";
    if (phase !== "done") {
      return `시뮬레이션 진행 중 · 단계: ${{ check: "착륙 전 점검", brace: "충격 대비", impact: "충돌", stopped: "정지 후 상황 판단", evac: "탈출 지휘" }[phase]} · 시나리오 ${ev.hiddenScenario ? "(무작위, 학생에게 비공개 — 위험 출구를 먼저 알려 주지 말 것)" : sc.name} · 정지 후 ${clock.toFixed(0)}초 · 확인한 출구: ${exits.filter((e) => e.assessed).map((e) => `${e.id}=${HAZARD_INFO[e.hazard].label === "슬라이드 기내 팽창" || HAZARD_INFO[e.hazard].label === "문 변형" ? "이상 없음" : HAZARD_INFO[e.hazard].label}`).join(", ") || "없음"}`;
    }
    const r = lastReport;
    return `시뮬레이션 결과 · 시나리오: ${r.scenario} (${r.brief})
점수 ${r.score}점 · 정지 후 전원 탈출 ${r.evacTime.toFixed(0)}초 · 탈출 개시 후 ${r.afterInit.toFixed(0)}초 · 탈출 ${r.out}/${r.total}명 · 부상 ${r.injured}명
판단별 평가:
${r.items.map((i) => `- [${i.ok === 1 ? "O" : i.ok === 0 ? "△" : "X"}] ${i.title}: ${i.detail}`).join("\n")}
부상 원인: ${Object.entries(r.why).map(([k, v]) => `${k} ${v}명`).join(", ") || "없음"}`;
  }

  // 자동 테스트용 좌표 조회 (화면 동작에는 영향 없음)
  window.__dbg = {
    unbelted: () => { const r = cv.getBoundingClientRect(); return pax.filter((p) => !p.belted).map((p) => { const [x, y] = toScreen(p.x, p.y); return [r.left + x, r.top + y]; }); },
    exits: () => { const r = cv.getBoundingClientRect(); return exits.map((e) => { const [x, y] = toScreen(e.x, e.side === "L" ? -4 : W + 4); return { id: e.id, sx: r.left + x, sy: r.top + y }; }); },
  };

  // ---------- 연결 ----------
  window.FR_SIM = {
    open() { show(); requestAnimationFrame(() => { layout(); intro(); }); },
    describe,
    active: () => !$("sim").classList.contains("hidden"),
  };
  $("simBack").addEventListener("click", () => {
    cancelAnimationFrame(raf);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    phase = "intro";
    window.FR_APP && window.FR_APP.home();
  });
  $("simSound").addEventListener("click", () => {
    S.sound = !S.sound;
    $("simSound").textContent = S.sound ? "소리 켜짐" : "소리 꺼짐";
    $("simSound").setAttribute("aria-pressed", String(!S.sound));
    if (!S.sound && "speechSynthesis" in window) speechSynthesis.cancel();
  });
  $("seClose").addEventListener("click", closeExitSheet);
  $("simExit").addEventListener("click", (e) => { if (e.target === $("simExit")) closeExitSheet(); });
  window.addEventListener("resize", () => { if (!$("sim").classList.contains("hidden")) { layout(); draw(); } });
  document.querySelectorAll("[data-open-sim]").forEach((b) => b.addEventListener("click", () => window.FR_SIM.open()));
})();
