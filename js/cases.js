// 사고사례 콘텐츠 데이터
// 문항·해설은 '객실 사고사례 훈련 앱 화면 기획서 #01'을 따른다.
// 정지 시점(pauseAt)과 복습 시작 지점(reviewFrom)은 영상(tools/render.py) 장면 타이밍 기준(초).
window.FR_CASES = [
  {
    id: "case01",
    no: "#01",
    title: "착륙 충돌 후 비상탈출",
    titleEn: "Cabin Accident Case #01",
    subtitle: "2013. 7. 6 · B777-200ER · 샌프란시스코 28L",
    duration: 83,
    videos: {
      portrait: "media/oz214_9x16.mp4",
      landscape: "media/oz214_16x9.mp4",
    },
    poster: "media/oz214_poster.jpg",
    posters: {
      portrait: "media/oz214_poster_9x16.jpg",
      landscape: "media/oz214_poster.jpg",
    },
    impactAt: 26.4, // 충돌 순간 (진동 효과)
    quizzes: [
      {
        id: "q1",
        pauseAt: 25.3,
        reviewFrom: 11.5,
        topic: "이상 징후 감지",
        question:
          "착륙 직전, 창밖 지면이 비정상적으로 가깝고 엔진 소리가 갑자기 커졌습니다. 점프시트에 앉은 승무원이 즉시 해야 할 행동은?",
        options: [
          "일어나서 조종실에 인터폰으로 상황을 묻는다",
          '자신의 Brace 자세를 취하고, 충격이 임박하면 승객에게 "머리 숙여! 자세 낮춰!"를 외친다',
          "승객이 놀라지 않도록 기내방송으로 안심시킨다",
          "착륙 후 바로 탈출할 수 있도록 출구 핸들을 잡는다",
        ],
        answer: 1,
        explanation:
          "착륙 직전에는 자리를 뜨면 안 됩니다. 승무원 본인이 다치면 이후 탈출을 지휘할 사람이 없으므로, 먼저 하네스를 조이고 Brace 자세를 취한 뒤 충격 구령으로 승객을 보호합니다.",
        wrong: {
          0: "이동 중 충격을 받으면 승무원이 가장 먼저 다칩니다.",
          2: "방송할 시간이 없으며 충격 대비가 우선입니다.",
          3: "기체가 완전히 멈추기 전에 출구를 조작하면 안 됩니다.",
        },
      },
      {
        id: "q3",
        pauseAt: 42.9,
        reviewFrom: 33.5,
        topic: "사용 불가 출구",
        question:
          "탈출 중 담당 출구의 슬라이드가 기내 쪽으로 펼쳐져 출구를 쓸 수 없게 되었습니다. 승무원의 올바른 조치는?",
        options: [
          "슬라이드를 치울 때까지 승객을 그 자리에 대기시킨다",
          '출구 앞을 몸으로 막고 "이쪽 출구 사용 불가! 저쪽으로!"를 외치며 승객을 다른 출구로 유도한다',
          "승객에게 슬라이드 위로 넘어가도록 안내한다",
          "다른 승무원이 올 때까지 출구 위치를 떠나지 않고 기다린다",
        ],
        answer: 1,
        explanation:
          "사용할 수 없는 출구는 즉시 차단(Block)하고, 큰 구령과 팔 동작으로 가장 가까운 사용 가능 출구로 재유도(Redirect)합니다. 출구 하나에 매달리는 1초가 전체 탈출 시간을 늘립니다.",
        wrong: {
          0: "대기는 탈출 지연과 혼잡을 키웁니다.",
          2: "팽창한 슬라이드를 넘다가 승객이 끼이거나 넘어질 수 있습니다.",
          3: "승객 흐름을 먼저 돌려야 합니다.",
        },
      },
      {
        id: "q2",
        pauseAt: 57.4,
        reviewFrom: 48.0,
        topic: "탈출 개시 판단",
        question:
          "기체가 멈췄고 조종실은 아직 '좌석에서 대기'를 지시한 상태입니다. 그런데 담당 출구 창밖에 연기와 불꽃이 보입니다. 가장 적절한 행동은?",
        options: [
          "조종실 지시가 우선이므로 다음 지시가 있을 때까지 기다린다",
          "즉시 그 출구를 열고 승객을 탈출시킨다",
          "즉시 조종실에 화재를 보고하고, 생명이 위험한 상황이면 화재 반대편의 안전한 출구로 탈출을 개시한다",
          "소화기를 들고 밖으로 나가 불을 끈다",
        ],
        answer: 2,
        explanation:
          "조종실은 외부 상황을 다 볼 수 없습니다. 객실에서 화재·연기·심한 기체 손상을 확인하면 즉시 보고해야 하며, 생명을 위협하는 상황에서는 객실승무원 판단으로 탈출을 개시할 수 있습니다. 이때 화재가 있는 쪽 출구는 사용하지 않습니다.",
        wrong: {
          0: "실제 사고에서도 탈출 개시가 약 90초 늦어졌습니다.",
          1: "화재 쪽 출구를 열면 연기와 불이 기내로 들어옵니다.",
          3: "외부 화재 진압은 승무원의 역할이 아닙니다.",
        },
      },
    ],
    lessons: [
      {
        ko: "좌석벨트 점검은 형식이 아니다 — 사망자 3명 중 2명은 벨트를 매지 않은 승객이었다",
        en: "Seatbelt checks are not a formality — 2 of the 3 fatalities were unbelted passengers.",
      },
      {
        ko: "승무원 본인의 착석과 Brace 자세가 먼저다",
        en: "Your own seated, braced position comes first.",
      },
      {
        ko: "외부 상황(화재·연기)은 즉시 조종실에 보고한다",
        en: "Report fire or smoke outside to the flight deck immediately.",
      },
      {
        ko: "출구 상황을 판단하고, 막힌 출구는 막고 다른 곳으로 유도한다",
        en: "Assess each exit; block an unusable one and redirect passengers.",
      },
    ],
    commands: {
      text: "벨트 풀어! 짐 버려! 나와!",
      en: "Release seatbelt! Leave everything! Come this way!",
    },
  },
];
