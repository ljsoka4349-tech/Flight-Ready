"""사고사례 #01 영상용 음향 합성 (외부 음원·저작권 음악 없이 numpy로 직접 생성)

장면 타이밍은 render.py SCENES와 같다 (세로·가로 영상이 같은 타임라인).
  0.0– 5.0  제목      : 낮고 차분한 패드
  5.0–11.5  개요      : 패드 + 잔잔한 펄스
 11.5–25.5  접근 비교 : 엔진 소음 상승, 긴장 패드, 후반 경고음
 25.5–33.5  충돌      : 26.4초 충격음, 금속 마찰·파편, 이명
 33.5–48.0  객실      : 무거운 패드, 34.1 분리 충격, 38.1 슬라이드 팽창음
 48.0–58.0  90초      : 초침 소리, 52초부터 화재 소리
 58.0–78.0  교훈      : 안정된 패드, 카드마다 차임
 78.0–83.0  마무리    : 페이드아웃
비명·사람 목소리는 넣지 않는다 (교육생 심리 부담 고려).

사용법: python3 soundtrack.py out.wav
"""
import sys, wave
import numpy as np

SR = 44100
DUR = 83.0
N = int(SR * DUR)
rng = np.random.default_rng(214)
t_all = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)

def idx(t): return int(round(t * SR))

def add(sig, start, gain=1.0, pan=0.0):
    """pan: -1 왼쪽 ~ +1 오른쪽"""
    i = idx(start); j = min(N, i + len(sig))
    if j <= i: return
    s = sig[: j - i] * gain
    lg = np.cos((pan + 1) * np.pi / 4); rg = np.sin((pan + 1) * np.pi / 4)
    L[i:j] += s * lg * 1.414; R[i:j] += s * rg * 1.414

def env(n, a, r, sustain=True):
    """a, r: 초. 선형 어택, 끝부분 r초 릴리즈"""
    e = np.ones(n)
    na = max(1, int(a * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr) if nr <= n else 1
    return e

def noise_band(dur, lo, hi, tilt=0.0):
    n = int(dur * SR)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    mask = ((f >= lo) & (f <= hi)).astype(float)
    # 경계 부드럽게
    mask = np.convolve(mask, np.hanning(64) / np.hanning(64).sum(), mode="same")
    if tilt:
        mask *= np.where(f > 1, (np.maximum(f, 1.0) / 100.0) ** tilt, 0)
    out = np.fft.irfft(spec * mask, n)
    return out / (np.abs(out).max() + 1e-9)

def tone(dur, freqs, amps=None, detune=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    amps = amps or [1.0] * len(freqs)
    s = np.zeros(n)
    for f, a in zip(freqs, amps):
        s += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
        if detune:
            s += a * 0.6 * np.sin(2 * np.pi * f * (1 + detune) * t)
    return s / (np.abs(s).max() + 1e-9)

def pad(dur, freqs, a=1.5, r=1.5, lfo=0.15):
    n = int(dur * SR); t = np.arange(n) / SR
    s = tone(dur, freqs, detune=0.004)
    s *= 1 + 0.25 * np.sin(2 * np.pi * lfo * t)
    return s * env(n, a, r)

def hz(note):  # MIDI → Hz
    return 440.0 * 2 ** ((note - 69) / 12)

# ---------- 0–11.5 제목·개요: D 단조 계열의 낮은 패드 ----------
add(pad(12.0, [hz(38), hz(45), hz(50), hz(53)], a=2.5, r=1.2), 0.0, 0.16)
add(noise_band(12.0, 80, 400) * env(int(12 * SR), 3, 1.5), 0.0, 0.03)
for k in range(6):  # 개요 카드가 하나씩 나올 때 낮은 펄스
    n = int(0.6 * SR); tt = np.arange(n) / SR
    add(np.sin(2 * np.pi * 55 * tt) * np.exp(-tt * 7), 5.4 + k * 0.45, 0.22)

# ---------- 11.5–25.5 접근: 엔진 소음 + 상승하는 긴장 ----------
seg = 14.0; n = int(seg * SR); tt = np.arange(n) / SR
eng = noise_band(seg, 60, 900, tilt=-0.6)
whine_f = 1800 + 400 * (tt / seg)  # 엔진 고음이 서서히 올라감
whine = np.sin(2 * np.pi * np.cumsum(whine_f) / SR) * 0.15
engine = (eng * 0.8 + whine) * env(n, 1.5, 0.3) * (0.6 + 0.6 * tt / seg)
add(engine, 11.5, 0.22, pan=-0.2)
# 긴장 패드: 반음씩 위로 미끄러짐
gl = np.linspace(0, 1, n)
p_f = [hz(50) * 2 ** (gl / 12), hz(53) * 2 ** (gl / 12), hz(56) * 2 ** (gl * 2 / 12)]
tens = sum(np.sin(2 * np.pi * np.cumsum(f) / SR) for f in p_f) / 3
add(tens * env(n, 3, 0.3) * (0.4 + 0.8 * tt / seg), 11.5, 0.12)
# 심장박동 같은 저음 (17초부터 점점 빨라짐)
tb = 17.0
while tb < 25.3:
    m = int(0.25 * SR); q = np.arange(m) / SR
    beat = np.sin(2 * np.pi * 48 * q) * np.exp(-q * 18)
    add(beat, tb, 0.35); add(beat * 0.6, tb + 0.18, 0.35)
    tb += max(0.55, 1.0 - (tb - 17) * 0.06)
# 경고음 (21.5초~): 두 음 반복 — 실제 항공기 경고음을 흉내내지 않은 일반 경고 톤
tw = 21.5
while tw < 25.2:
    for f, off in ((880, 0), (660, 0.18)):
        m = int(0.15 * SR); q = np.arange(m) / SR
        add((np.sin(2 * np.pi * f * q) + 0.25 * np.sin(2 * np.pi * 2 * f * q)) * env(m, 0.01, 0.05), tw + off, 0.09, pan=0.3)
    tw += 0.5

# ---------- 25.5–33.5 충돌 ----------
HIT = 26.4
add(engine[-int(0.9 * SR):] * np.linspace(1, 1.2, int(0.9 * SR)), 25.5, 0.22, pan=-0.2)  # 엔진 이어짐
# 충격음: 저음 스윕 + 노이즈 폭발
m = int(3.5 * SR); q = np.arange(m) / SR
sweep = np.sin(2 * np.pi * np.cumsum(90 * np.exp(-q * 1.2) + 28) / SR) * np.exp(-q * 1.3)
burst = noise_band(3.5, 30, 3000, tilt=-0.8) * np.exp(-q * 2.2)
add(sweep * 0.9 + burst * 0.8, HIT, 0.85)
# 금속 마찰 (기체가 미끄러지는 동안)
m = int(4.2 * SR); q = np.arange(m) / SR
scrape = noise_band(4.2, 1200, 6000) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 7 * q)))
add(scrape * env(m, 0.3, 1.5) * np.exp(-q * 0.4), HIT + 0.4, 0.16, pan=0.3)
grind = noise_band(4.2, 100, 600)
add(grind * env(m, 0.2, 1.8), HIT + 0.3, 0.22)
# 파편
for k in range(16):
    m = int(0.12 * SR); q = np.arange(m) / SR
    tick = noise_band(0.12, 2000, 9000) * np.exp(-q * 45)
    add(tick, HIT + 0.3 + rng.uniform(0, 2.2), rng.uniform(0.05, 0.14), pan=rng.uniform(-0.8, 0.8))
# 이명 + 정적
m = int(5.0 * SR)
add(tone(5.0, [4200]) * env(m, 0.4, 2.5), HIT + 1.5, 0.025)
add(pad(5.5, [hz(38), hz(45)], a=2.0, r=1.0), 28.0, 0.12)

# ---------- 33.5–48 객실 ----------
add(pad(14.5, [hz(36), hz(43), hz(48), hz(51)], a=1.5, r=1.2, lfo=0.1), 33.5, 0.15)
add(noise_band(14.5, 100, 500) * env(int(14.5 * SR), 2, 2), 33.5, 0.035)  # 실내 잔향
m = int(1.2 * SR); q = np.arange(m) / SR   # 34.1 꼬리 분리: 둔탁한 충격
add(np.sin(2 * np.pi * 60 * q) * np.exp(-q * 6) + noise_band(1.2, 50, 800) * np.exp(-q * 9) * 0.6, 34.1, 0.4)
# 38.1 슬라이드 팽창: 공기 쉬익 + 부풀어 오르는 음
m = int(1.6 * SR); q = np.arange(m) / SR
hiss = noise_band(1.6, 1500, 9000) * env(m, 0.05, 0.9)
infl = np.sin(2 * np.pi * np.cumsum(120 + 260 * q) / SR) * env(m, 0.1, 0.6) * 0.5
add(hiss * 0.7 + infl, 38.1, 0.26, pan=0.4)
# 41.1 슬라이드 터뜨림
m = int(0.8 * SR); q = np.arange(m) / SR
add(noise_band(0.8, 300, 5000) * np.exp(-q * 6), 41.2, 0.25, pan=0.4)
# 43.1 마지막 비트: 낮고 무거운 음
add(pad(4.5, [hz(31), hz(38)], a=0.8, r=2.0), 43.2, 0.16)

# ---------- 48–58 정지 후 90초 ----------
add(pad(10.0, [hz(38), hz(41), hz(45)], a=1.0, r=0.8, lfo=0.3), 48.0, 0.12)
tk = 48.5; k = 0
while tk < 57.8:  # 초침 (카운터가 빨라지는 것에 맞춰 간격 축소)
    m = int(0.05 * SR); q = np.arange(m) / SR
    add(noise_band(0.05, 2500, 8000) * np.exp(-q * 90), tk, 0.12 if k % 2 == 0 else 0.08, pan=0.15)
    tk += 0.42 if tk < 52 else 0.32; k += 1
# 52초부터 화재 (오른쪽)
m = int(6.0 * SR); q = np.arange(m) / SR
roar = noise_band(6.0, 80, 1500, tilt=-0.4) * env(m, 2.0, 0.5)
add(roar, 52.0, 0.18, pan=0.5)
for k in range(70):
    mm = int(0.03 * SR); qq = np.arange(mm) / SR
    add(noise_band(0.03, 1500, 7000) * np.exp(-qq * 120), 52.3 + rng.uniform(0, 5.5), rng.uniform(0.04, 0.12), pan=rng.uniform(0.2, 0.9))

# ---------- 58–78 교훈 ----------
add(pad(20.0, [hz(50), hz(57), hz(62), hz(65)], a=2.0, r=1.5, lfo=0.08), 58.0, 0.11)
add(pad(20.0, [hz(38)], a=3.0, r=1.5), 58.0, 0.08)
for k in range(4):
    for f, off in ((hz(74), 0), (hz(81), 0.09)):
        m = int(1.8 * SR); q = np.arange(m) / SR
        bell = (np.sin(2 * np.pi * f * q) + 0.3 * np.sin(2 * np.pi * f * 2.76 * q)) * np.exp(-q * 2.5)
        add(bell, 58.4 + k * 5.0 + off, 0.07, pan=-0.2 + 0.4 * (off > 0))

# ---------- 78–83 마무리 ----------
add(pad(5.0, [hz(50), hz(57), hz(62)], a=0.8, r=3.5, lfo=0.05), 78.0, 0.12)

# ---------- 마스터: 장면 경계 페이드, 리미터 ----------
mix = np.stack([L, R], axis=1)
fade = np.ones(N)
for a, b in ((0, 0.4),):
    fade[idx(a):idx(b)] = np.linspace(0, 1, idx(b) - idx(a))
fade[idx(81.8):] = np.linspace(1, 0, N - idx(81.8))
mix *= fade[:, None]
peak = np.abs(mix).max()
mix = np.tanh(mix / peak * 1.4) / np.tanh(1.4) * 0.89  # 부드러운 리미팅, 피크 약 -1 dBFS
pcm = (mix * 32767).astype(np.int16)

out = sys.argv[1] if len(sys.argv) > 1 else "soundtrack.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("완료:", out, f"{DUR}초")
