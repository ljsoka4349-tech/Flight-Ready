(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const CASES = window.FR_CASES;

  // ---------- 저장 (브라우저마다 따로, 실패해도 동작) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("fr:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("fr:" + k, JSON.stringify(v)); } catch { /* 저장 불가 환경 */ } },
  };
  const settings = Object.assign({ vibrate: true }, store.get("settings", {}));

  // ---------- 상태 ----------
  let cur = null;          // 현재 사례
  let answers = {};        // quizId -> 고른 보기 index
  let fired = new Set();   // 이번 재생에서 이미 띄운 퀴즈
  let reviewQuiz = null;   // 오답 복습 중인 퀴즈
  let maxWatched = 0;      // 첫 수강 시 앞으로 건너뛰기 방지
  let impactDone = false;
  let rafId = 0;
  let activeQuiz = null;

  const video = $("video");
  const portraitMq = window.matchMedia("(orientation: portrait)");

  // ---------- 화면 전환 ----------
  function show(id) {
    for (const s of ["home", "player", "result"]) $(s).classList.toggle("hidden", s !== id);
    window.scrollTo(0, 0);
  }

  // ---------- 홈 ----------
  function renderHome() {
    const list = $("caseList");
    list.innerHTML = "";
    for (const c of CASES) {
      const done = store.get("done:" + c.id, false);
      const b = document.createElement("button");
      b.className = "case";
      b.innerHTML = `
        <img src="${c.poster}" alt="">
        <div class="body">
          <div class="no">객실 사고사례 ${c.no}</div>
          <div class="t">${c.title}</div>
          <div class="muted">${c.subtitle}</div>
          <div class="meta">
            <span class="pill">영상 ${Math.round(c.duration)}초</span>
            <span class="pill">퀴즈 ${c.quizzes.length}문항</span>
            ${done ? '<span class="pill grn">이수 완료</span>' : ""}
          </div>
        </div>`;
      b.addEventListener("click", () => openCase(c));
      list.appendChild(b);
    }
    show("home");
  }

  // ---------- 화면 방향에 맞는 영상 ----------
  function orientation() { return portraitMq.matches ? "portrait" : "landscape"; }
  function applyOrientation(keepTime) {
    const o = orientation();
    document.body.classList.toggle("portrait", o === "portrait");
    document.body.classList.toggle("landscape", o === "landscape");
    $("orientLabel").textContent = o === "portrait" ? "세로 9:16" : "가로 16:9";
    if (!cur) return;
    video.poster = (cur.posters && cur.posters[o]) || cur.poster;
    const src = cur.videos[o];
    if (video.getAttribute("src") === src) return;
    const t = keepTime ? video.currentTime : 0;
    const wasPlaying = keepTime && !video.paused;
    video.setAttribute("src", src);
    video.load();
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = t;
      if (wasPlaying) video.play().catch(() => {});
    }, { once: true });
  }
  portraitMq.addEventListener("change", () => applyOrientation(true));

  // ---------- 플레이어 ----------
  function openCase(c, opts = {}) {
    cur = c;
    reviewQuiz = opts.review || null;
    if (!reviewQuiz) { answers = {}; maxWatched = 0; }
    fired = new Set();
    impactDone = !!reviewQuiz;
    $("playerTitle").textContent = `사고사례 ${c.no} · ${c.title}`;
    video.removeAttribute("src");
    applyOrientation(false);
    renderMarks();
    show("player");
    const start = reviewQuiz ? reviewQuiz.reviewFrom : 0;
    video.addEventListener("loadedmetadata", () => { video.currentTime = start; updateTime(); }, { once: true });
    $("bigPlay").classList.remove("hidden");
    $("playBtn").textContent = "재생";
    updateQuizCount();
  }

  function renderMarks() {
    const m = $("marks");
    m.innerHTML = "";
    for (const q of cur.quizzes) {
      const d = document.createElement("i");
      d.className = "mark";
      if (q.id in answers) d.classList.add(answers[q.id] === q.answer ? "ok" : "no");
      d.style.left = (q.pauseAt / cur.duration) * 100 + "%";
      d.title = q.topic;
      m.appendChild(d);
    }
    $("player").querySelector(".progress").classList.toggle("seekable", canSeek());
  }

  function canSeek() { return !!cur && store.get("done:" + cur.id, false) && !reviewQuiz; }

  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
  function updateTime() {
    const d = video.duration || cur.duration;
    $("time").textContent = `${fmt(video.currentTime)} / ${fmt(d)}`;
    $("bar").style.width = (video.currentTime / d) * 100 + "%";
  }
  function updateQuizCount() {
    const n = cur.quizzes.filter((q) => q.id in answers).length;
    $("quizCount").textContent = reviewQuiz ? "오답 복습" : `퀴즈 ${n}/${cur.quizzes.length}`;
  }

  function play() {
    if (activeQuiz) return;
    video.play().catch(() => {});
  }
  function togglePlay() { video.paused ? play() : video.pause(); }

  function tick() {
    rafId = 0;
    if (!cur || video.paused) return;
    const t = video.currentTime;
    if (!reviewQuiz) maxWatched = Math.max(maxWatched, t);
    // 충돌 진동
    if (!impactDone && t >= cur.impactAt) {
      impactDone = true;
      if (settings.vibrate && navigator.vibrate) navigator.vibrate([120, 60, 220]);
    }
    // 퀴즈 정지 지점
    const targets = reviewQuiz ? [reviewQuiz] : cur.quizzes;
    for (const q of targets) {
      if (!fired.has(q.id) && t >= q.pauseAt) {
        fired.add(q.id);
        video.pause();
        video.currentTime = q.pauseAt;
        openQuiz(q);
        return;
      }
    }
    updateTime();
    rafId = requestAnimationFrame(tick);
  }

  video.addEventListener("play", () => {
    $("bigPlay").classList.add("hidden");
    $("playBtn").textContent = "일시정지";
    if (!rafId) rafId = requestAnimationFrame(tick);
  });
  video.addEventListener("pause", () => { $("playBtn").textContent = "재생"; updateTime(); });
  video.addEventListener("timeupdate", updateTime);
  video.addEventListener("ended", () => showResult());
  // 첫 수강: 앞으로 건너뛰기 막기 (키보드·제스처 탐색 포함)
  video.addEventListener("seeking", () => {
    if (!cur) return;
    if (!canSeek() && !reviewQuiz && video.currentTime > maxWatched + 1) {
      video.currentTime = maxWatched;
      return;
    }
    // 건너뛴 퀴즈는 다시 띄우지 않고, 되감은 구간의 퀴즈는 다시 풀 수 있게
    const t = video.currentTime;
    for (const q of cur.quizzes) {
      if (q.pauseAt < t - 0.05) fired.add(q.id);
      else if (q.pauseAt > t + 0.05) fired.delete(q.id);
    }
  });

  $("bigPlay").addEventListener("click", play);
  $("playBtn").addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);
  $("backBtn").addEventListener("click", () => { video.pause(); renderHome(); });
  $("player").querySelector(".progress").addEventListener("click", (e) => {
    if (!canSeek()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * (video.duration || cur.duration);
    video.currentTime = t;
    updateTime();
  });

  // ---------- 퀴즈 ----------
  const NUMS = ["①", "②", "③", "④"];
  function openQuiz(q) {
    activeQuiz = q;
    const idx = cur.quizzes.indexOf(q) + 1;
    $("qNo").textContent = `퀴즈 ${idx}`;
    $("qTopic").textContent = q.topic;
    $("qTitle").textContent = q.question;
    const box = $("qOptions");
    box.innerHTML = "";
    q.options.forEach((text, i) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.innerHTML = `<span class="n">${NUMS[i]}</span><span></span>`;
      b.lastChild.textContent = text;
      b.addEventListener("click", () => answer(q, i));
      box.appendChild(b);
    });
    $("qFeedback").classList.add("hidden");
    $("qNext").classList.add("hidden");
    $("quiz").classList.remove("hidden");
    box.firstChild.focus({ preventScroll: true });
  }

  function answer(q, i) {
    answers[q.id] = i;
    const ok = i === q.answer;
    [...$("qOptions").children].forEach((b, k) => {
      b.disabled = true;
      if (k === q.answer) b.classList.add("correct");
      if (k === i && !ok) b.classList.add("picked-wrong");
    });
    const fb = $("qFeedback");
    fb.innerHTML = "";
    const v = document.createElement("div");
    v.className = "verdict " + (ok ? "ok" : "no");
    v.textContent = ok ? "정답입니다" : `오답입니다 · 정답 ${NUMS[q.answer]}`;
    const ex = document.createElement("div");
    ex.textContent = q.explanation;
    fb.append(v, ex);
    if (!ok && q.wrong[i]) {
      const w = document.createElement("div");
      w.className = "why";
      w.textContent = `${NUMS[i]} ${q.wrong[i]}`;
      fb.append(w);
    }
    fb.classList.remove("hidden");
    const next = $("qNext");
    next.textContent = reviewQuiz ? "학습 정리로" : "이어보기";
    next.classList.remove("hidden");
    next.focus({ preventScroll: true });
    renderMarks();
    updateQuizCount();
  }

  $("qNext").addEventListener("click", () => {
    $("quiz").classList.add("hidden");
    activeQuiz = null;
    if (reviewQuiz) { reviewQuiz = null; showResult(); return; }
    play();
  });

  // ---------- 학습 정리 ----------
  let cardIdx = 0;
  function showResult() {
    video.pause();
    const qs = cur.quizzes;
    const correct = qs.filter((q) => answers[q.id] === q.answer).length;
    $("scoreLine").textContent = `${qs.length}문항 중 ${correct}문항 정답`;
    const allOk = correct === qs.length;
    if (allOk) store.set("done:" + cur.id, true);
    $("badge").textContent = `사고사례 ${cur.no} 이수`;
    $("badge").classList.toggle("hidden", !allOk);

    const ox = $("oxList");
    ox.innerHTML = "";
    qs.forEach((q, i) => {
      const done = q.id in answers;
      const ok = answers[q.id] === q.answer;
      const row = document.createElement("div");
      row.className = "ox";
      row.innerHTML = `<span class="mk ${ok ? "ok" : "no"}">${ok ? "O" : "X"}</span>
        <span><b>퀴즈 ${i + 1}</b> · ${q.topic}${done ? "" : " <span class='muted'>(미응답)</span>"}</span>`;
      if (!ok) {
        const b = document.createElement("button");
        b.className = "btn ghost";
        b.textContent = "장면부터 다시";
        b.addEventListener("click", () => openCase(cur, { review: q }));
        row.appendChild(b);
      } else {
        row.appendChild(document.createElement("span"));
      }
      ox.appendChild(row);
    });

    cardIdx = 0;
    renderCard();
    $("cmdText").textContent = cur.commands.text;
    $("cmdEn").textContent = cur.commands.en;
    show("result");
  }

  function renderCard() {
    const L = cur.lessons;
    const c = L[cardIdx];
    $("card").innerHTML = `<div class="num">교훈 ${cardIdx + 1} / ${L.length}</div><div class="ko"></div><div class="en"></div>`;
    $("card").querySelector(".ko").textContent = c.ko;
    $("card").querySelector(".en").textContent = c.en;
    $("cardDots").innerHTML = L.map((_, i) => `<i class="${i === cardIdx ? "on" : ""}"></i>`).join("");
  }
  $("cardPrev").addEventListener("click", () => { cardIdx = (cardIdx + cur.lessons.length - 1) % cur.lessons.length; renderCard(); });
  $("cardNext").addEventListener("click", () => { cardIdx = (cardIdx + 1) % cur.lessons.length; renderCard(); });

  $("cmdSpeak").addEventListener("click", () => {
    if (!("speechSynthesis" in window)) { alert("이 브라우저는 음성 읽기를 지원하지 않습니다."); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(cur.commands.text);
    u.lang = "ko-KR"; u.rate = 1.05; u.pitch = 0.9;
    speechSynthesis.speak(u);
  });
  $("replayBtn").addEventListener("click", () => openCase(cur));
  $("homeBtn").addEventListener("click", renderHome);

  // ---------- 설정 ----------
  $("settingsBtn").addEventListener("click", () => {
    $("optVibrate").checked = settings.vibrate;
    $("settings").classList.remove("hidden");
  });
  $("optVibrate").addEventListener("change", (e) => { settings.vibrate = e.target.checked; store.set("settings", settings); });
  $("settingsClose").addEventListener("click", () => $("settings").classList.add("hidden"));

  // 키보드: 스페이스 재생/정지
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !$("player").classList.contains("hidden") && !activeQuiz && e.target === document.body) {
      e.preventDefault(); togglePlay();
    }
  });

  applyOrientation(false);
  renderHome();
})();
