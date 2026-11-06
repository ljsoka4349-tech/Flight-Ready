"""아시아나항공 214편 사고 - 객실승무원 훈련용 재구성 애니메이션 (1080x1920, 30fps)
vs-last-one-shorts 스킬의 세로 레이아웃·상단 자막 스타일·VS 비교 구조를 따르되,
실제 사망 사고이므로 반전/코믹 요소 없이 교육용으로 구성.
사실 근거: NTSB AAR-14/01 및 NTSB 이사회 발표 자료.
사용법: python3 render.py out.mp4
"""
import math, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1080, 1920, 30
OUT = sys.argv[1] if len(sys.argv) > 1 else "oz214_training.mp4"
FB = "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc"
FBo = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
FR = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
_fc = {}
def F(path, size):
    k = (path, size)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(path, size, index=1)
    return _fc[k]

YEL = (255, 210, 31); WHT = (255, 255, 255); RED = (235, 70, 60)
GRN = (80, 210, 120); GRY = (150, 160, 175); ORG = (255, 140, 40)
BG_TOP = (10, 18, 34); BG_BOT = (22, 34, 58)

def ease(t): t = max(0, min(1, t)); return t * t * (3 - 2 * t)
def lerp(a, b, t): return a + (b - a) * t
def clamp01(t): return max(0.0, min(1.0, t))

def gradient():
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(lerp(a, b, t)) for a, b in zip(BG_TOP, BG_BOT)))
    return im
BASE = gradient()

# ---------- 텍스트 ----------
def text(img, xy, s, font, fill=WHT, alpha=1.0, anchor="mm", stroke=0, align="center", spacing=14):
    if alpha <= 0: return
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.multiline_text(xy, s, font=font, fill=fill + (255,), anchor=anchor, align=align,
                     stroke_width=stroke, stroke_fill=(0, 0, 0, 255), spacing=spacing)
    if alpha < 1:
        a = layer.getchannel("A").point(lambda v: int(v * alpha)); layer.putalpha(a)
    img.alpha_composite(layer)

def caption(img, parts, alpha=1.0, y=230):
    """스킬 규격: 상단 12% 위치, 굵은 글씨, 검은 외곽선, 핵심 단어만 노란색"""
    f = F(FB, 66)
    total = sum(f.getlength(s) for s, _ in parts)
    x = (W - total) / 2
    for s, c in parts:
        text(img, (x, y), s, f, c, alpha, anchor="lm", stroke=8)
        x += f.getlength(s)

def bottom(img, s, alpha=1.0, color=WHT):
    text(img, (W / 2, 1560), s, F(FBo, 46), color, alpha, stroke=4, spacing=18)

def note(img, s, alpha=1.0, color=GRY):
    text(img, (W / 2, 1710), s, F(FBo, 31), color, alpha)

def footer(img):
    text(img, (W / 2, 1855), "교육용 재구성 애니메이션 · 실제 사고 영상 아님 · 출처 NTSB AAR-14/01",
         F(FR, 26), GRY, 0.9)

# ---------- 비행기 (측면) ----------
PL = 340  # 기체 길이(px)
def plane_side(color=(235, 238, 245), outline=None, alpha=255):
    im = Image.new("RGBA", (PL + 40, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = color + (alpha,)
    ox, oy = 20, 80
    # 동체
    d.rounded_rectangle([ox, oy - 20, ox + PL - 30, oy + 20], 20, fill=c)
    d.pieslice([ox + PL - 70, oy - 20, ox + PL, oy + 20], -90, 90, fill=c)  # 기수
    # 꼬리 날개
    d.polygon([(ox + 5, oy - 18), (ox + 40, oy - 18), (ox + 10, oy - 75), (ox - 5, oy - 75)], fill=c)
    d.polygon([(ox, oy - 4), (ox + 55, oy - 4), (ox + 20, oy + 6)], fill=c)
    # 주날개·엔진
    d.polygon([(ox + 140, oy + 6), (ox + 210, oy + 6), (ox + 150, oy + 30)], fill=c)
    d.rounded_rectangle([ox + 170, oy + 18, ox + 225, oy + 38], 9, fill=c)
    # 창문 띠
    d.line([(ox + 60, oy - 6), (ox + PL - 70, oy - 6)], fill=(60, 80, 110, alpha), width=4)
    d.polygon([(ox + PL - 45, oy - 12), (ox + PL - 22, oy - 12), (ox + PL - 30, oy - 3), (ox + PL - 45, oy - 3)],
              fill=(60, 80, 110, alpha))
    if outline:
        a = im.getchannel("A")
        edge = a.filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 40 else 0)
        o = Image.new("RGBA", im.size, outline + (255,)); o.putalpha(edge)
        im = Image.new("RGBA", im.size, (0, 0, 0, 0)); im.alpha_composite(o)
    return im

PLANE = plane_side()
GHOST = plane_side(outline=GRN)
TAILCUT = 95  # 꼬리 분리 지점(이미지 x)
PLANE_BODY = PLANE.copy(); ImageDraw.Draw(PLANE_BODY).rectangle([0, 0, TAILCUT, 160], fill=(0, 0, 0, 0))
PLANE_TAIL = PLANE.crop((0, 0, TAILCUT, 160))

def paste_rot(img, sprite, cx, cy, deg):
    r = sprite.rotate(deg, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(r, (int(cx - r.width / 2), int(cy - r.height / 2)))

# ---------- 측면 무대 ----------
GROUND_Y = 1180; WALL_X = 600; TD_X = 840
def side_stage(img):
    d = ImageDraw.Draw(img)
    d.rectangle([0, GROUND_Y + 12, WALL_X, 1360], fill=(25, 60, 95))       # 바다
    for i in range(6):
        y = GROUND_Y + 40 + i * 25
        d.line([(0, y), (WALL_X, y)], fill=(40, 85, 125), width=2)
    d.rectangle([WALL_X - 18, GROUND_Y - 6, WALL_X + 4, 1360], fill=(110, 110, 105))  # 방파제
    d.rectangle([WALL_X + 4, GROUND_Y, W, 1360], fill=(55, 58, 62))           # 지면
    d.rectangle([WALL_X + 4, GROUND_Y, W, GROUND_Y + 14], fill=(85, 88, 92))   # 활주로
    for x in range(WALL_X + 60, W, 90):
        d.rectangle([x, GROUND_Y + 5, x + 40, GROUND_Y + 9], fill=(230, 230, 230))
    text(img, (WALL_X - 8, 1395), "방파제", F(FBo, 30), GRY)
    text(img, (900, 1395), "활주로 28L", F(FBo, 30), GRY)

GP_ANGLE = math.radians(13)  # 실제 3°를 보기 쉽게 과장
def gp_y(x): return GROUND_Y - 30 - (TD_X - x) * math.tan(GP_ANGLE)

def speed_box(img, x, label, val, color):
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(lay).rounded_rectangle([x, 420, x + 440, 560], 22, fill=(0, 0, 0, 150), outline=color + (255,), width=4)
    img.alpha_composite(lay)
    text(img, (x + 220, 455), label, F(FBo, 32), color)
    text(img, (x + 220, 515), f"{val:.0f} kt", F(FB, 54), WHT)

# ================= 장면 =================
def s_title(img, t, T):
    a = ease(t / 0.8)
    text(img, (W / 2, 560), "ASIANA 214", F(FB, 110), YEL, a, stroke=6)
    text(img, (W / 2, 800), "아시아나항공 214편\n착륙 사고", F(FB, 84), WHT, a, stroke=5, spacing=20)
    text(img, (W / 2, 1010), "2013. 7. 6 · 샌프란시스코 국제공항", F(FBo, 40), GRY, ease((t - 0.6) / 0.8))
    d = ImageDraw.Draw(img); aa = ease((t - 1.2) / 0.8)
    if aa > 0:
        d.rounded_rectangle([250, 1110, 830, 1190], 40, fill=YEL + (int(255 * aa),))
        text(img, (W / 2, 1150), "객실승무원 안전훈련 사례", F(FB, 38), (20, 20, 20), aa)
    text(img, (W / 2, 1450), "희생자 세 분의 명복을 빕니다", F(FR, 36), WHT, ease((t - 2.2) / 1.0) * 0.85)

def s_overview(img, t, T):
    caption(img, [("사고 ", WHT), ("개요", YEL)], ease(t / 0.5))
    rows = [("기종", "보잉 777-200ER"), ("구간", "인천 → 샌프란시스코"), ("접근", "활주로 28L 시계접근"),
            ("탑승", "307명 (승객 291 · 승무원 16)"), ("사망", "3명 (승객)"), ("중상", "49명")]
    for i, (k, v) in enumerate(rows):
        a = ease((t - 0.4 - i * 0.45) / 0.5)
        if a <= 0: continue
        y = 470 + i * 150; dx = (1 - a) * 60
        lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(lay).rounded_rectangle([110 + dx, y, 970 + dx, y + 120], 24, fill=(255, 255, 255, int(28 * a)))
        img.alpha_composite(lay)
        text(img, (170 + dx, y + 60), k, F(FB, 42), YEL if k != "사망" else RED, a, anchor="lm")
        text(img, (330 + dx, y + 60), v, F(FBo, 42), WHT, a, anchor="lm")

def approach_pos(p):
    """214편 위치: 강하각 아래로 처지며 방파제로"""
    x = lerp(60, WALL_X - 20, p)
    y = gp_y(x) + 110 * ease(p) ** 1.6
    pitch = lerp(2, 12, ease(p))
    return x, y, pitch

def s_vs(img, t, T):
    side_stage(img)
    caption(img, [("정상 접근 ", GRN), ("VS ", WHT), ("214편", YEL)], ease(t / 0.5))
    d = ImageDraw.Draw(img)
    # 강하각 기준선
    x0 = 0
    for x in range(x0, TD_X, 28):
        d.line([(x, gp_y(x)), (x + 14, gp_y(x + 14))], fill=GRN + (200,), width=4)
    text(img, (250, gp_y(250) - 80), "정상 강하 경로\n(실제 3°, 과장 표시)", F(FBo, 28), GRN, 0.95)
    p = clamp01((t - 1.5) / (T - 2.0))
    # 정상 비행기(유령)
    gx = lerp(60, TD_X - 40, p)
    paste_rot(img, GHOST, gx, gp_y(gx) - 20, 2)
    x, y, pitch = approach_pos(p)
    paste_rot(img, PLANE, x, y - 20, pitch)
    speed_box(img, 60, "정상 접근 목표속도", 137, GRN)
    spd = lerp(137, 103, ease(clamp01((p - 0.15) / 0.8)))
    speed_box(img, 580, "214편 속도", spd, RED if spd < 125 else YEL)
    if p < 0.45:
        bottom(img, "조종사가 추력을 아이들로 줄이자\n자동추력장치가 HOLD 모드로 전환", ease((t - 1.5) / 0.5))
        note(img, "HOLD 모드에서는 속도를 자동으로 유지하지 않음", ease((t - 2.0) / 0.5), GRY)
    else:
        bottom(img, "속도 감시가 늦어져 목표보다 34kt 느려짐\n복행(재상승) 결정도 늦음", ease((p - 0.45) / 0.08), YEL)

def s_impact(img, t, T):
    side_stage(img)
    caption(img, [("충돌 ", RED), ("오전 11시 28분", WHT)])
    hit = 0.9
    if t < hit:
        p = 1.0 + t / hit * 0.06
        x, y, pitch = approach_pos(min(p, 1.0))
        x += (t / hit) * 30; y += (t / hit) * 10
        paste_rot(img, PLANE, x, y - 20, pitch)
    else:
        u = t - hit
        # 꼬리: 방파제 근처에 떨어짐
        tx = WALL_X + 10 + 40 * ease(u / 1.2); ty = GROUND_Y - 30 + 25 * ease(u / 1.2)
        paste_rot(img, PLANE_TAIL, tx, ty, 12 + 50 * ease(u / 1.5))
        # 동체: 들렸다가 활주로 위를 미끄러지며 회전 후 정지
        s = ease(u / 4.5)
        bx = lerp(WALL_X + 160, 900, s)
        lift = 120 * math.sin(math.pi * clamp01(u / 1.8)) * (1 - s)
        ang = 12 + 25 * math.sin(math.pi * clamp01(u / 1.8)) - 18 * ease(clamp01((u - 1.8) / 2.0))
        paste_rot(img, PLANE_BODY, bx, GROUND_Y - 34 - lift, ang)
        if u < 0.35:  # 섬광
            fl = Image.new("RGBA", (W, H), (255, 255, 255, int(170 * (1 - u / 0.35))))
            img.alpha_composite(fl)
        if u > 0.2:
            for i in range(14):  # 파편
                k = (u - 0.2) * 1.0
                px = WALL_X + 20 + i * 23 * k; py = GROUND_Y - 40 - (60 - i * 4) * math.sin(min(k, 1.2) * 2) + 90 * k * k
                if py < GROUND_Y + 5:
                    ImageDraw.Draw(img).ellipse([px, py, px + 8, py + 8], fill=GRY + (220,))
    bottom(img, "착륙장치와 꼬리가 방파제에 충돌·분리\n기체는 활주로 위를 미끄러지며 회전 후 정지",
           ease((t - 1.6) / 0.6))

# ---------- 객실 평면도 ----------
FX0, FX1, FY0, FY1 = 110, 990, 760, 960
DOORS = {1: 890, 2: 720, 3: 470, 4: 215}
def cabin(img, tail_off=0.0, tail_alpha=1.0, burn=0.0):
    d = ImageDraw.Draw(img)
    # 날개
    d.polygon([(560, FY0), (420, 470), (360, 470), (470, FY0)], fill=(70, 82, 105, 255))
    d.polygon([(560, FY1), (420, 1250), (360, 1250), (470, FY1)], fill=(70, 82, 105, 255))
    eng = (430, 1140, 520, 1180)
    d.rounded_rectangle(eng, 16, fill=(95, 105, 125, 255))
    d.rounded_rectangle((430, 540, 520, 580), 16, fill=(95, 105, 125, 255))
    # 동체(꼬리 제외)
    d.rounded_rectangle([250, FY0, FX1 - 60, FY1], 30, fill=(200, 206, 216, 255))
    d.pieslice([FX1 - 160, FY0, FX1, FY1], -90, 90, fill=(200, 206, 216, 255))
    # 좌석
    for x in range(290, 860, 26):
        for y in (790, 815, 845, 870, 905, 930):
            d.rectangle([x, y, x + 14, y + 12], fill=(120, 130, 150, 255))
    # 꼬리 부분
    if tail_alpha > 0:
        ox = -tail_off
        c = (200, 206, 216, int(255 * tail_alpha))
        d.rounded_rectangle([FX0 + ox, FY0 + 20, 262 + ox, FY1 - 20], 26, fill=c)
        d.polygon([(FX0 + 20 + ox, FY0 + 25), (60 + ox, 700), (30 + ox, 700), (FX0 - 5 + ox, FY0 + 30)], fill=c)
        d.polygon([(FX0 + 20 + ox, FY1 - 25), (60 + ox, 1020), (30 + ox, 1020), (FX0 - 5 + ox, FY1 - 30)], fill=c)
    # 문 표시
    for n, x in DOORS.items():
        if n == 4 and tail_alpha < 1: continue
        for side, y in (("L", FY0), ("R", FY1)):
            d.rectangle([x - 18, y - 6, x + 18, y + 6], fill=(40, 50, 70, 255))
            text(img, (x, y - 34 if side == "L" else y + 36), f"{n}{side}", F(FBo, 26), GRY)
    text(img, (FX1 + 30, 860), "기수", F(FBo, 26), GRY, anchor="lm") if FX1 + 60 < W else None
    if burn > 0:  # 오른쪽 엔진 화재
        import random
        rnd = random.Random(int(burn * 1000))
        for i in range(18):
            r = rnd.uniform(14, 40) * min(1, burn * 1.5)
            cx = rnd.uniform(420, 540); cy = rnd.uniform(1110, 1200) - burn * 60 * rnd.random()
            col = ORG if i % 3 else RED
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (int(200 * min(1, burn * 2)),))

def person(d, x, y, col, r=13):
    d.ellipse([x - r, y - r, x + r, y + r], fill=col + (255,), outline=(0, 0, 0, 255), width=3)

def s_cabin(img, t, T):
    caption(img, [("객실", YEL), ("에서 일어난 일", WHT)])
    d = ImageDraw.Draw(img)
    beatA, beatB = 4.6, 9.6
    off = 160 * ease(clamp01((t - 0.6) / 1.2))
    cabin(img, tail_off=off, tail_alpha=1 - 0.6 * ease(clamp01((t - 0.6) / 1.2)))
    d = ImageDraw.Draw(img)
    if t < beatA:
        if t > 0.6:
            d.line([(258, FY0 - 20), (258, FY1 + 20)], fill=RED + (255,), width=6)
            text(img, (258, 690), "분리", F(FB, 34), RED)
        k = ease(clamp01((t - 0.8) / 1.4))
        for i, (sx, sy) in enumerate([(200, 800), (200, 920), (230, 800), (230, 920)]):
            ex, ey = 60 + i * 40, 1140 + (i % 2) * 50
            person(d, lerp(sx, ex, k), lerp(sy, ey, k), YEL)
        if t > 2.4:
            text(img, (150, 1270), "4명 모두 생존", F(FB, 34), GRN, ease((t - 2.4) / 0.4), anchor="lm")
        bottom(img, "후방 점프싯 승무원 4명이 벨트를 맨 채\n꼬리 쪽과 함께 기체 밖으로 튕겨 나감\n→ 중상을 입었지만 모두 생존",
               ease((t - 0.8) / 0.5))
    elif t < beatB:
        u = t - beatA
        g = ease(clamp01(u / 1.2))
        for x in (DOORS[1], DOORS[2]):
            rw, rh = 30 + 70 * g, 20 + 110 * g
            d.ellipse([x - rw, FY1 - rh * 1.6, x + rw, FY1 + 4], fill=ORG + (230,), outline=(0, 0, 0, 255), width=3)
            person(d, x + 10, FY1 - 30, YEL)
        text(img, (805, 1060), "1R·2R 슬라이드가\n기내 쪽으로 팽창", F(FB, 32), ORG, ease(u / 0.6))
        bottom(img, "승무원 2명이 슬라이드에 깔림\n동료가 도끼·칼로 슬라이드를 터뜨려 구출", ease((u - 0.8) / 0.5))
    else:
        u = t - beatB
        k = ease(clamp01(u / 1.4))
        for i, (sx, sy) in enumerate([(300, 820), (320, 900)]):
            person(d, lerp(sx, 80 + i * 70, k), lerp(sy, 1330 + i * 30, k), RED)
        text(img, (80, 1390), "좌석벨트 미착용", F(FB, 30), RED, ease((u - 1.0) / 0.4), anchor="lm")
        bottom(img, "좌석벨트를 매지 않은 승객 2명이\n기체 밖으로 튕겨 나가 사망", ease((u - 0.3) / 0.5))
        note(img, "NTSB: 벨트를 맨 탑승자는 생존·탈출 가능성이 훨씬 높았다", ease((u - 1.6) / 0.5), YEL)

def s_evac(img, t, T):
    caption(img, [("정지 후 ", WHT), ("약 90초", YEL)])
    cnt = 90 * ease(clamp01((t - 0.5) / 5.5))
    cabin(img, tail_off=160, tail_alpha=0.0, burn=clamp01((t - 4.0) / 3.0))
    d = ImageDraw.Draw(img)
    # 타임라인
    y = 1360; x0, x1 = 120, 960
    d.rounded_rectangle([x0, y - 8, x1, y + 8], 8, fill=(70, 80, 100, 255))
    xc = lerp(x0, x1, cnt / 90)
    d.rounded_rectangle([x0, y - 8, xc, y + 8], 8, fill=YEL + (255,))
    d.ellipse([xc - 16, y - 16, xc + 16, y + 16], fill=WHT + (255,))
    text(img, (x0, y + 50), "정지", F(FBo, 28), GRY)
    text(img, (x1, y + 50), "90초", F(FBo, 28), GRY)
    text(img, (W / 2, 1270), f"{cnt:02.0f}초", F(FB, 70), WHT, 1, stroke=4)
    if t < 4.5:
        bottom(img, "기장은 관제와 교신하며\n처음에는 '탈출 대기'를 지시", ease((t - 0.5) / 0.5))
    else:
        bottom(img, "오른쪽 엔진 화재가 동체로 번지는 것을\n객실에서 확인한 뒤 비상탈출 시작", ease((t - 4.5) / 0.5), YEL)

LESSONS = [
    ("1", "벨트가 생명을 지킨다", "점프싯 하네스는 끝까지 완전히 체결\n착륙 전 승객 좌석벨트 착용 철저 확인"),
    ("2", "위험 징후는 즉시 보고", "화재·연기·기체 파손을 발견하면\n바로 조종실에 알리고, 생명이 위험하면\n회사 절차에 따라 탈출을 판단"),
    ("3", "문 열기 전 바깥 확인", "화재·연기·장애물이 있는 출구는 막고\n안전한 출구로 승객을 유도\n짐은 두고 탈출하도록 강하게 지시"),
    ("4", "슬라이드 오작동 대비", "슬라이드가 기내에서 부풀 수 있음\n크래시 액스·칼 위치를 미리 숙지하고\n동료 구조 절차를 훈련"),
]
def s_lessons(img, t, T):
    caption(img, [("객실승무원 ", WHT), ("교훈", YEL)])
    per = T / len(LESSONS)
    i = min(int(t / per), len(LESSONS) - 1); u = t - i * per
    a = ease(u / 0.4) * (1 - ease((u - per + 0.35) / 0.35))
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    dy = (1 - ease(u / 0.4)) * 40
    d.rounded_rectangle([90, 520 + dy, 990, 1380 + dy], 40, fill=(255, 255, 255, int(20 * a)),
                        outline=YEL + (int(255 * a),), width=4)
    d.ellipse([W / 2 - 75, 590 + dy, W / 2 + 75, 740 + dy], fill=YEL + (int(255 * a),))
    img.alpha_composite(lay); d = ImageDraw.Draw(img)
    n, title, body = LESSONS[i]
    text(img, (W / 2, 662 + dy), n, F(FB, 90), (20, 20, 20), a)
    text(img, (W / 2, 860 + dy), title, F(FB, 62), WHT, a, stroke=3)
    text(img, (W / 2, 1100 + dy), body, F(FBo, 42), (225, 230, 240), a, spacing=24)
    for k in range(len(LESSONS)):  # 진행 점
        c = YEL if k == i else (90, 100, 120)
        d.ellipse([W / 2 - 75 + k * 45, 1460, W / 2 - 55 + k * 45, 1480], fill=c + (255,))

def s_end(img, t, T):
    a = ease(t / 0.8)
    text(img, (W / 2, 720), "아시아나항공 214편", F(FB, 64), WHT, a)
    text(img, (W / 2, 830), "벨트 · 보고 · 출구 확인 · 슬라이드 대응", F(FBo, 42), YEL, a)
    text(img, (W / 2, 1120), "출처\nNTSB 항공사고 보고서 AAR-14/01\n(2014. 6. 24 채택)", F(FR, 36), GRY, ease((t - 0.6) / 0.8), spacing=16)
    text(img, (W / 2, 1360), "이 영상은 공개 조사 결과를 바탕으로 만든\n교육용 재구성 애니메이션이며 실제 영상이 아닙니다",
         F(FR, 32), GRY, ease((t - 1.0) / 0.8), spacing=14)

# (장면 함수, 길이초, 앞 페이드, 뒤 페이드)
SCENES = [
    (s_title, 5.0, True, True),
    (s_overview, 6.5, True, True),
    (s_vs, 14.0, True, False),
    (s_impact, 8.0, False, True),
    (s_cabin, 14.5, True, True),
    (s_evac, 10.0, True, True),
    (s_lessons, 20.0, True, True),
    (s_end, 5.0, True, True),
]

def main():
    total = sum(s[1] for s in SCENES)
    ff = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                           "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
                          stdin=subprocess.PIPE)
    for fn, T, fin, fout in SCENES:
        n = int(T * FPS)
        for i in range(n):
            t = i / FPS
            img = BASE.convert("RGBA")
            fn(img, t, T)
            footer(img)
            k = 1.0
            if fin: k = min(k, clamp01(t / 0.35))
            if fout: k = min(k, clamp01((T - t) / 0.35))
            if k < 1:
                img = Image.blend(Image.new("RGBA", (W, H), (0, 0, 0, 255)), img, k)
            ff.stdin.write(img.convert("RGB").tobytes())
    ff.stdin.close(); ff.wait()
    print(f"완료: {OUT} ({total:.1f}초)")

if __name__ == "__main__":
    main()
