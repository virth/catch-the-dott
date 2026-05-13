"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ScoreBoard } from "@/components/score-board";

const ARENA_WIDTH = 700;
const ARENA_HEIGHT = 420;
const MIN_ARENA_WIDTH = 260;
const MOBILE_ARENA_MARGIN = 48;
const INITIAL_DOT_SIZE = 64;
const MIN_DOT_SIZE = 24;
const DOT_BIGGER_BOOST_PX = 18;
/** Extra Abstand Rand: Aura, Ring, Hover-Scale, Schatten (fix, kein Formelzauber). */
const PLAYFIELD_EDGE_PX = 20;
const DOT_SIZE_DECREASE_PER_POINT = 2;
const HIGH_SCORES_LIMIT = 5;
const HIGH_SCORES_STORAGE_KEY = "catch-the-dot-high-scores";
const TOTAL_POINTS_STORAGE_KEY = "catch-the-dot-total-points";
const HARD_MISS_TIMEOUT_MS = 750;
const LUCKY_SPIN_COST = 75;
const LUCKY_EFFECT_DURATION_MS = 5000;
const LUCKY_SPIN_DURATION_MS = 900;

const MODE_SETTINGS = {
  easy: { label: "Easy", icon: "🟢", duration: 50 },
  normal: { label: "Normal", icon: "🟡", duration: 40 },
  hard: { label: "Hard", icon: "🔴", duration: 30 },
} as const;

type GameMode = keyof typeof MODE_SETTINGS;

const LUCKY_REWARDS = [
  { id: "score-burst", label: "+3 pro Klick (5s)", icon: "💥" },
  { id: "time-boost", label: "Zeit stoppt (5s)", icon: "⏱️" },
  { id: "bigger-dot", label: "Groesserer Punkt (5s)", icon: "🟣" },
  { id: "shield", label: "Hard-Schutz (5s)", icon: "🛡️" },
  { id: "double-click", label: "Doppelte Klickpunkte (5s)", icon: "✨" },
] as const;

const LUCKY_WHEEL_COLORS = [
  "#fde68a",
  "#fca5a5",
  "#93c5fd",
  "#a7f3d0",
  "#ddd6fe",
] as const;

type LuckyReward = (typeof LUCKY_REWARDS)[number];
type LuckyRewardId = LuckyReward["id"];
type LuckyEffects = Record<LuckyRewardId, boolean>;

const INITIAL_LUCKY_EFFECTS: LuckyEffects = {
  "score-burst": false,
  "time-boost": false,
  "bigger-dot": false,
  shield: false,
  "double-click": false,
};

function getDotSize(currentScore: number) {
  return Math.max(
    MIN_DOT_SIZE,
    INITIAL_DOT_SIZE - currentScore * DOT_SIZE_DECREASE_PER_POINT,
  );
}

function getDotPixelSizeForScore(currentScore: number, biggerDot: boolean) {
  return Math.max(
    MIN_DOT_SIZE,
    getDotSize(currentScore) + (biggerDot ? DOT_BIGGER_BOOST_PX : 0),
  );
}

function getDotCenterClampPadding(currentScore: number, biggerDot: boolean) {
  return getDotPixelSizeForScore(currentScore, biggerDot) / 2 + PLAYFIELD_EDGE_PX;
}

export function Game() {
  const [mode, setMode] = useState<GameMode>("normal");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(MODE_SETTINGS.normal.duration);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highScores, setHighScores] = useState<number[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [activeLuckyEffects, setActiveLuckyEffects] =
    useState<LuckyEffects>(INITIAL_LUCKY_EFFECTS);
  const [lastLuckyReward, setLastLuckyReward] = useState<string | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [isSpinningWheel, setIsSpinningWheel] = useState(false);
  const [arenaWidth, setArenaWidth] = useState(ARENA_WIDTH);
  const arenaPlayfieldRef = useRef<HTMLDivElement>(null);
  const [playfieldSize, setPlayfieldSize] = useState({
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
  });

  const [x, setX] = useState(200);
  const [y, setY] = useState(200);
  const latestScoreRef = useRef(score);
  const activeLuckyEffectsRef = useRef(activeLuckyEffects);
  const roundFinalizedRef = useRef(false);
  const luckyEffectTimeoutsRef = useRef<Partial<Record<LuckyRewardId, number>>>(
    {},
  );

  const dotSizeBoost = activeLuckyEffects["bigger-dot"] ? DOT_BIGGER_BOOST_PX : 0;
  const dotSize = Math.max(MIN_DOT_SIZE, getDotSize(score) + dotSizeBoost);
  const highestScore = highScores[0] ?? 0;
  const modeDuration = MODE_SETTINGS[mode].duration;
  const isScoreBurstActive = activeLuckyEffects["score-burst"];
  const isDoubleClickActive = activeLuckyEffects["double-click"];
  const isTimeBoostActive = activeLuckyEffects["time-boost"];
  const isShieldActive = activeLuckyEffects.shield;

  activeLuckyEffectsRef.current = activeLuckyEffects;

  const luckyWheelSegmentAngle = 360 / LUCKY_REWARDS.length;
  const luckyWheelConicBackground = `conic-gradient(${LUCKY_REWARDS.map((_, i) => {
    const start = i * luckyWheelSegmentAngle;
    const end = (i + 1) * luckyWheelSegmentAngle;
    return `${LUCKY_WHEEL_COLORS[i]} ${start}deg ${end}deg`;
  }).join(", ")})`;

  function saveScoreToHighscores(finalScore: number) {
    setHighScores((currentHighScores) =>
      [...currentHighScores, finalScore]
        .sort((a, b) => b - a)
        .slice(0, HIGH_SCORES_LIMIT),
    );
  }

  function finalizeGame() {
    if (!isPlaying) return;
    if (roundFinalizedRef.current) return;
    roundFinalizedRef.current = true;
    const finalScore = latestScoreRef.current;
    setIsPlaying(false);
    saveScoreToHighscores(finalScore);
    setTotalPoints((currentTotalPoints) => currentTotalPoints + finalScore);
    setActiveLuckyEffects(INITIAL_LUCKY_EFFECTS);
  }

  useEffect(() => {
    latestScoreRef.current = score;
  }, [score]);

  useEffect(() => {
    return () => {
      const timeouts = luckyEffectTimeoutsRef.current;
      for (const timeoutId of Object.values(timeouts)) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      }
    };
  }, []);

  useEffect(() => {
    const storedScores = window.localStorage.getItem(HIGH_SCORES_STORAGE_KEY);
    if (!storedScores) return;

    const parsedScores = JSON.parse(storedScores) as number[];
    const normalizedScores = parsedScores
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)
      .slice(0, HIGH_SCORES_LIMIT);
    setHighScores(normalizedScores);
  }, []);

  useEffect(() => {
    const storedTotalPoints = window.localStorage.getItem(TOTAL_POINTS_STORAGE_KEY);
    if (!storedTotalPoints) return;

    const parsedTotalPoints = Number.parseInt(storedTotalPoints, 10);
    if (!Number.isFinite(parsedTotalPoints) || parsedTotalPoints < 0) return;

    setTotalPoints(parsedTotalPoints);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      HIGH_SCORES_STORAGE_KEY,
      JSON.stringify(highScores),
    );
  }, [highScores]);

  useEffect(() => {
    window.localStorage.setItem(TOTAL_POINTS_STORAGE_KEY, String(totalPoints));
  }, [totalPoints]);

  useEffect(() => {
    function syncArenaSize() {
      const availableWidth = window.innerWidth - MOBILE_ARENA_MARGIN;
      const nextWidth = Math.min(
        ARENA_WIDTH,
        Math.max(MIN_ARENA_WIDTH, Math.floor(availableWidth)),
      );
      setArenaWidth(nextWidth);
    }

    syncArenaSize();
    window.addEventListener("resize", syncArenaSize);

    return () => {
      window.removeEventListener("resize", syncArenaSize);
    };
  }, []);

  useLayoutEffect(() => {
    const node = arenaPlayfieldRef.current;
    if (!node) return;

    function measure() {
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w <= 0 || h <= 0) return;
      setPlayfieldSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [arenaWidth]);

  useEffect(() => {
    const padding = getDotCenterClampPadding(score, activeLuckyEffects["bigger-dot"]);
    const { width: pw, height: ph } = playfieldSize;
    setX((currentX) => Math.min(Math.max(currentX, padding), pw - padding));
    setY((currentY) => Math.min(Math.max(currentY, padding), ph - padding));
  }, [playfieldSize.width, playfieldSize.height, score, activeLuckyEffects["bigger-dot"]]);

  function startGame() {
    roundFinalizedRef.current = false;
    setScore(0);
    setTimeLeft(modeDuration);
    setActiveLuckyEffects(INITIAL_LUCKY_EFFECTS);
    setLastLuckyReward(null);
    setIsPlaying(true);
    moveDot(0, false);
  }

  function stopGame() {
    finalizeGame();
  }

  function moveDot(scoreForSize: number, biggerDot: boolean) {
    const padding = getDotCenterClampPadding(scoreForSize, biggerDot);
    const { width: pw, height: ph } = playfieldSize;
    const innerW = pw - padding * 2;
    const innerH = ph - padding * 2;

    if (innerW <= 0 || innerH <= 0) {
      setX(pw / 2);
      setY(ph / 2);
      return;
    }

    // 🐞 Bug-Aufgabe:
    // Der Punkt bewegt sich aktuell nur nach oben und unten.
    // Findest du heraus, warum?

    setX(Math.random() * innerW + padding);
    setY(Math.random() * innerH + padding);
  }

  function handleDotClick() {
    if (!isPlaying) return;
    const clickPoints = (isDoubleClickActive ? 2 : 1) + (isScoreBurstActive ? 3 : 0);
    const nextScore = score + clickPoints;
    setScore(nextScore);

    // TODO 1:
    // Erhöhe den Score um 1.
    // Tipp:
    // setScore(...)

    moveDot(nextScore, activeLuckyEffects["bigger-dot"]);
  }

  function applyLuckyReward(reward: LuckyReward) {
    const rewardId = reward.id;

    setActiveLuckyEffects((currentEffects) => ({
      ...currentEffects,
      [rewardId]: true,
    }));

    const existingTimeout = luckyEffectTimeoutsRef.current[rewardId];
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    luckyEffectTimeoutsRef.current[rewardId] = window.setTimeout(() => {
      setActiveLuckyEffects((currentEffects) => ({
        ...currentEffects,
        [rewardId]: false,
      }));
      delete luckyEffectTimeoutsRef.current[rewardId];
    }, LUCKY_EFFECT_DURATION_MS);
  }

  function buyLuckySpin() {
    if (!isPlaying || totalPoints < LUCKY_SPIN_COST || isSpinningWheel) return;

    const rewardIndex = Math.floor(Math.random() * LUCKY_REWARDS.length);
    const randomReward = LUCKY_REWARDS[rewardIndex];
    const segmentAngle = 360 / LUCKY_REWARDS.length;
    const segmentCenterAngle = rewardIndex * segmentAngle + segmentAngle / 2;
    const spins = 5 + Math.floor(Math.random() * 2);
    const targetRotation = wheelRotation + spins * 360 + (360 - segmentCenterAngle);

    setTotalPoints((currentTotalPoints) => currentTotalPoints - LUCKY_SPIN_COST);
    setIsSpinningWheel(true);
    setWheelRotation(targetRotation);
    applyLuckyReward(randomReward);
    setLastLuckyReward(`${randomReward.icon} ${randomReward.label}`);

    window.setTimeout(() => {
      setIsSpinningWheel(false);
    }, LUCKY_SPIN_DURATION_MS);
  }

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setTimeLeft((currentTime) => {
        if (activeLuckyEffectsRef.current["time-boost"]) {
          return currentTime;
        }

        if (currentTime <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return currentTime - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || timeLeft !== 0) return;
    finalizeGame();
  }, [isPlaying, timeLeft]);

  useEffect(() => {
    if (!isPlaying || mode !== "hard") return;

    const missTimer = window.setTimeout(() => {
      if (activeLuckyEffectsRef.current.shield) {
        moveDot(
          latestScoreRef.current,
          activeLuckyEffectsRef.current["bigger-dot"],
        );
        return;
      }

      setScore((currentScore) => {
        const nextScore = Math.max(0, currentScore - 1);
        moveDot(nextScore, activeLuckyEffectsRef.current["bigger-dot"]);
        return nextScore;
      });
    }, HARD_MISS_TIMEOUT_MS);

    return () => {
      window.clearTimeout(missTimer);
    };
  }, [isPlaying, mode, x, y, dotSizeBoost]);

useEffect(() => {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.code !== "Space" || isPlaying) return;

    event.preventDefault();
    startGame();
  }

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [isPlaying]);
  

   

  return (
    <section className="mx-auto max-w-5xl rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Catch the Dot</h1>
          <p className="mt-2 text-zinc-600 text-red">
            Klicke den Punkt so oft wie möglich, bevor die Zeit abläuft.
          </p>
        </div>

        <ScoreBoard score={score} timeLeft={timeLeft} />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="w-full rounded-2xl border-2 border-violet-200/70 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-indigo-50 p-3 shadow-[0_0_0_1px_rgba(139,92,246,0.08),0_8px_24px_rgba(139,92,246,0.18)] lg:min-w-0 lg:flex-1">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-violet-700">
              Spielfeld
            </span>
            <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-zinc-700">
              {isPlaying ? "Live" : "Bereit"}
            </span>
          </div>

          <div
            ref={arenaPlayfieldRef}
            className="relative mx-auto overflow-hidden rounded-xl border border-violet-300 bg-white/90 shadow-inner"
            style={{
              width: arenaWidth,
              maxWidth: "100%",
              aspectRatio: `${ARENA_WIDTH} / ${ARENA_HEIGHT}`,
            }}
          >
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-violet-100/40 via-transparent to-indigo-100/50"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgb(139_92_246/0.06)_100%)]"
            aria-hidden
          />

          <div
            className="absolute z-20"
            style={{
              left: x,
              top: y,
              width: dotSize,
              height: dotSize,
              transform: "translate(-50%, -50%)",
            }}
          >
            <button
              type="button"
              disabled={!isPlaying}
              onClick={handleDotClick}
              className="group relative flex appearance-none items-center justify-center overflow-visible border-0 bg-transparent p-0 outline-none transition-[transform,filter] duration-200 ease-out hover:scale-[1.06] hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100 disabled:hover:brightness-100"
              style={{
                width: dotSize,
                height: dotSize,
                filter: "drop-shadow(0 8px 16px rgb(91 33 182 / 0.35))",
              }}
              aria-label="Punkt fangen"
            >
              <span
                className="catch-dot-aura pointer-events-none absolute -inset-[12%] rounded-full bg-violet-400/30"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{
                  width: "calc(100% + 10px)",
                  height: "calc(100% + 10px)",
                }}
                aria-hidden
              >
                <span
                  className="catch-dot-energy-ring block h-full w-full rounded-full opacity-90"
                  style={{
                    background:
                      "conic-gradient(from 200deg, transparent 0deg 40deg, rgb(139 92 246 / 0.95) 95deg, transparent 140deg 210deg, rgb(217 70 239 / 0.92) 275deg, transparent 320deg 360deg)",
                  }}
                />
              </span>
              <span
                className="relative z-[1] flex aspect-square w-[88%] max-h-[88%] max-w-[88%] items-center justify-center overflow-hidden rounded-full border border-violet-300/60 shadow-[inset_0_-12px_20px_rgb(76_29_149/0.45),inset_0_8px_14px_rgb(255_255_255/0.45),0_0_0_1px_rgb(255_255_255/0.25)]"
                style={{
                  background:
                    "radial-gradient(circle at 30% 26%, rgb(237 233 254) 0%, rgb(196 181 253) 18%, rgb(139 92 246) 42%, rgb(109 40 217) 72%, rgb(76 29 149) 100%)",
                }}
              >
                <span
                  className="pointer-events-none absolute left-[10%] top-[8%] h-[42%] w-[58%] rounded-full bg-white/55 blur-md"
                  aria-hidden
                />
                <span
                  className="pointer-events-none absolute right-[12%] bottom-[14%] h-[22%] w-[28%] rounded-full bg-violet-950/35 blur-md"
                  aria-hidden
                />
                <span
                  className="relative rounded-full bg-white/35 shadow-[inset_0_2px_8px_rgb(255_255_255/0.8)]"
                  style={{
                    width: "38%",
                    height: "38%",
                    boxShadow: "0 0 0 1px rgb(255 255 255 / 0.3)",
                  }}
                  aria-hidden
                />
              </span>
            </button>
          </div>
          </div>
        </div>

        <aside className="w-full rounded-2xl border-2 border-zinc-200 bg-zinc-50 p-4 lg:w-72">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Highscore
          </h2>
          <div className="mt-2 rounded-xl bg-white px-3 py-4 text-center">
            <div className="text-3xl font-black text-zinc-900">{highestScore}</div>
          </div>

          <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Gluecksrad
              </span>
              <button
                type="button"
                onClick={buyLuckySpin}
                disabled={!isPlaying || totalPoints < LUCKY_SPIN_COST || isSpinningWheel}
                className="rounded-md bg-amber-400 px-2 py-1 text-xs font-bold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSpinningWheel ? "Dreht..." : `Spin (${LUCKY_SPIN_COST})`}
              </button>
            </div>

            <div className="mt-3 flex justify-center">
              <div className="relative h-36 w-36">
                <div className="absolute left-1/2 top-[-10px] z-10 h-0 w-0 -translate-x-1/2 border-l-[10px] border-r-[10px] border-t-0 border-b-[14px] border-l-transparent border-r-transparent border-b-zinc-900" />
                <div
                  className="relative h-36 w-36 overflow-hidden rounded-full border-4 border-amber-400 shadow-inner transition-transform duration-1000 ease-out"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                    background: luckyWheelConicBackground,
                  }}
                >
                  {LUCKY_REWARDS.map((reward, i) => {
                    const angle = i * luckyWheelSegmentAngle + luckyWheelSegmentAngle / 2;
                    const labelRadius = "2.85rem";
                    return (
                      <div
                        key={reward.id}
                        className="pointer-events-none absolute left-1/2 top-1/2 z-[1]"
                        style={{
                          transform: `translate(-50%, -50%) rotate(${angle}deg) translate(0, -${labelRadius})`,
                        }}
                      >
                        <span
                          className="block max-w-[3.75rem] select-none text-center text-[6px] font-bold leading-[1.1] text-zinc-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.75)]"
                          style={{
                            transform: `rotate(${-angle - wheelRotation}deg)`,
                          }}
                        >
                          <span className="block text-[10px] leading-none">{reward.icon}</span>
                          <span className="mt-0.5 block">{reward.label}</span>
                        </span>
                      </div>
                    );
                  })}
                  <div
                    className="pointer-events-none absolute inset-0 z-[2] grid place-items-center"
                    style={{ transform: `rotate(${-wheelRotation}deg)` }}
                  >
                    <div className="flex h-[26%] w-[26%] items-center justify-center rounded-full border-2 border-amber-300/80 bg-white/90 text-sm font-black text-amber-900 shadow-md">
                      🎁
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-2 text-xs font-medium text-zinc-700">
              {lastLuckyReward
                ? `Letzter Spin: ${lastLuckyReward}`
                : "Spin verfuegbar waehrend einer laufenden Runde."}
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-lg text-zinc-700">
            {isPlaying
              ? "Los geht's!"
              : score > 0
                ? `Fertig. Du hast ${score} Punkte gemacht.`
                : "Klicke auf Start, um loszulegen."}
          </p>
          <div className="mt-2 flex flex-wrap items-stretch gap-2">
            <div className="inline-flex min-w-[140px] flex-col rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-center">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Gesamtpunkte
              </span>
              <span className="text-lg font-black text-zinc-900">{totalPoints}</span>
            </div>

          </div>
          <p className="mt-2 text-[11px] text-zinc-600">
            Aktiv:
            {isDoubleClickActive || isScoreBurstActive || isTimeBoostActive || isShieldActive || activeLuckyEffects["bigger-dot"]
              ? ` ${[
                  isDoubleClickActive ? "x2 Klick" : null,
                  isScoreBurstActive ? "+3/Klick" : null,
                  isTimeBoostActive ? "Zeitstopp" : null,
                  isShieldActive ? "Schutz" : null,
                  activeLuckyEffects["bigger-dot"] ? "Groesserer Punkt" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}`
              : " Keine"}
          </p>
        </div>

        <div className="w-full rounded-2xl border-2 border-violet-200/70 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-indigo-50 p-3 shadow-[0_0_0_1px_rgba(139,92,246,0.08),0_8px_24px_rgba(139,92,246,0.18)] md:w-auto">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-violet-700">
              Control Deck
            </span>
            <span className="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-zinc-700">
              Mode: {MODE_SETTINGS[mode].label}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <div className="inline-flex overflow-hidden rounded-xl border border-violet-300 bg-white/90 p-1 shadow-sm">
              {(Object.keys(MODE_SETTINGS) as GameMode[]).map((gameMode) => (
                <button
                  key={gameMode}
                  type="button"
                  onClick={() => setMode(gameMode)}
                  disabled={isPlaying}
                  className={`flex min-w-[105px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${
                    mode === gameMode
                      ? "bg-violet-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.45)]"
                      : "text-zinc-700 hover:bg-violet-100"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span>{MODE_SETTINGS[gameMode].icon}</span>
                  <span>{MODE_SETTINGS[gameMode].label}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={startGame}
                className="flex h-11 min-w-[170px] items-center justify-center gap-2 rounded-xl bg-zinc-950 px-6 font-bold text-white shadow-[0_0_14px_rgba(24,24,27,0.35)] transition hover:scale-[1.01] hover:bg-zinc-800"
              >
                <span>▶️</span>
                <span>{isPlaying ? "Neustart" : "Start"}</span>
              </button>
              <button
                type="button"
                onClick={stopGame}
                disabled={!isPlaying}
                className="flex h-11 min-w-[140px] items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-6 font-bold text-zinc-800 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>⏹️</span>
                <span>Stop</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
