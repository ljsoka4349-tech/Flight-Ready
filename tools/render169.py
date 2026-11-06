"""아시아나항공 214편 훈련 영상 - 16:9 (1920x1080) 버전
render.py의 장면을 그대로 쓰고, 화면 구성만 가로형으로 바꾼다.
  왼쪽: 애니메이션(세로판 무대 영역을 잘라 축소)
  오른쪽: 상단 자막(노란 핵심어) + 설명 자막 + 보충 문구
제목·마무리 장면은 가운데 배치.
사용법: python3 render169.py out_16x9.mp4
"""
import subprocess, sys
from PIL import Image, ImageDraw
import render as r

W, H, FPS = 1920, 1080, r.FPS
OUT = sys.argv[1] if len(sys.argv) > 1 else "oz214_training_16x9.mp4"
CROP = (0, 400, 1080, 1490)          # 세로판에서 애니메이션이 있는 영역
STAGE_H = 900
SC = STAGE_H / (CROP[3] - CROP[1])
STAGE_W = int((CROP[2] - CROP[0]) * SC)
STAGE_X, STAGE_Y = 70, 95
PX0 = STAGE_X + STAGE_W + 60         # 오른쪽 패널 시작
PX1 = W - 80
PCX = (PX0 + PX1) / 2
CENTERED = {r.s_title, r.s_end}

def gradient():
    im = Image.new("RGB", (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(r.lerp(a, b, t)) for a, b in zip(r.BG_TOP, r.BG_BOT)))
    return im
BASE = gradient()

REC = []
def rec_caption(img, parts, alpha=1.0, y=None): REC.append(("cap", parts, alpha))
def rec_bottom(img, s, alpha=1.0, color=r.WHT): REC.append(("bot", s, alpha, color))
def rec_note(img, s, alpha=1.0, color=r.GRY): REC.append(("note", s, alpha, color))
r.caption, r.bottom, r.note = rec_caption, rec_bottom, rec_note

def wrap(s, font, maxw):
    out = []
    for para in s.split("\n"):
        line = ""
        for w in para.split(" "):
            cand = (line + " " + w).strip()
            if font.getlength(cand) <= maxw or not line:
                line = cand
            else:
                out.append(line); line = w
        out.append(line)
    return "\n".join(out)

def draw_panel(img):
    maxw = PX1 - PX0
    for item in REC:
        if item[0] == "cap":
            _, parts, a = item
            f = r.F(r.FB, 64)
            total = sum(f.getlength(s) for s, _ in parts)
            x = PCX - total / 2
            for s, c in parts:
                r.text(img, (x, 300), s, f, c, a, anchor="lm", stroke=8)
                x += f.getlength(s)
            d = ImageDraw.Draw(img)
            d.rectangle([PCX - 60, 370, PCX + 60, 376], fill=r.YEL + (int(255 * a),))
        elif item[0] == "bot":
            _, s, a, c = item
            f = r.F(r.FBo, 42)
            r.text(img, (PCX, 560), wrap(s, f, maxw), f, c, a, stroke=4, spacing=22)
        else:
            _, s, a, c = item
            f = r.F(r.FBo, 32)
            r.text(img, (PCX, 790), wrap(s, f, maxw), f, c, a, spacing=14)

def footer(img):
    r.text(img, (W / 2, 1045), "교육용 재구성 애니메이션 · 실제 사고 영상 아님 · 출처 NTSB AAR-14/01",
           r.F(r.FR, 24), r.GRY, 0.9)

def frame(fn, t, T):
    REC.clear()
    tall = Image.new("RGBA", (r.W, r.H), (0, 0, 0, 0))
    fn(tall, t, T)
    stage = tall.crop(CROP).resize((STAGE_W, STAGE_H), Image.LANCZOS)
    img = BASE.convert("RGBA")
    if fn in CENTERED:
        img.alpha_composite(stage, (int((W - STAGE_W) / 2), STAGE_Y))
    else:
        img.alpha_composite(stage, (STAGE_X, STAGE_Y))
        draw_panel(img)
    footer(img)
    return img

def main():
    ff = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
                           "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT],
                          stdin=subprocess.PIPE)
    for fn, T, fin, fout in r.SCENES:
        for i in range(int(T * FPS)):
            t = i / FPS
            img = frame(fn, t, T)
            k = 1.0
            if fin: k = min(k, r.clamp01(t / 0.35))
            if fout: k = min(k, r.clamp01((T - t) / 0.35))
            if k < 1:
                img = Image.blend(Image.new("RGBA", (W, H), (0, 0, 0, 255)), img, k)
            ff.stdin.write(img.convert("RGB").tobytes())
    ff.stdin.close(); ff.wait()
    print(f"완료: {OUT} ({sum(s[1] for s in r.SCENES):.1f}초)")

if __name__ == "__main__":
    main()
