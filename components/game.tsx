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
/** Hard: Klickfenster pro Ball-Position. */
const HARD_DOT_CLICK_WINDOW_MS = 1000;
/** Normal: etwas groesseres Klickfenster. */
const NORMAL_DOT_CLICK_WINDOW_MS = 1500;
const DOT_MISS_HIDE_MS = 100;
const LUCKY_SPIN_COST = 75;
const LUCKY_EFFECT_DURATION_MS = 10_000;
/** Ab dann: Spielfeld blinkt bis Effekt-Ende. */
const LUCKY_PLAYFIELD_PANIC_MS = 2500;
const LUCKY_MAX_SPINS_PER_GAME = 3;
const LUCKY_SPIN_DURATION_MS = 900;

const TRAP_MIN_SCORE = 6;
/** Ab dem zweiten Klick innerhalb dieses Fensters zählt die Combo (+ Punkte). */
const COMBO_WINDOW_MS = 750;
const COMBO_BONUS_POINTS = 0.75;
/** Pro echtem Treffer: Chance 1 : GOLDEN_SPAWN_ODDS auf goldenen Bonuspunkt. */
const GOLDEN_SPAWN_ODDS = 99;
const GOLDEN_BONUS_POINTS = 500;
/** Shop: einmal pro Runde, zahlt aus Gesamtpunkten. */
const SHOP_DOT_BONUS_COST = 350;
const SHOP_DOT_BONUS_PER_CLICK = 5;

const MODE_SETTINGS = {
  easy: { label: "Easy", icon: "🟢", duration: 60 },
  normal: { label: "Normal", icon: "🟡", duration: 60 },
  hard: { label: "Hard", icon: "🔴", duration: 60 },
} as const;

type GameMode = keyof typeof MODE_SETTINGS;

const LUCKY_REWARDS = [
  { id: "score-burst", label: "+3 pro Klick (10s)", icon: "💥" },
  { id: "time-boost", label: "Zeit stoppt (10s)", icon: "⏱️" },
  { id: "bigger-dot", label: "Groesserer Punkt (10s)", icon: "🟣" },
  { id: "shield", label: "Hard-Schutz (10s)", icon: "🛡️" },
  { id: "double-click", label: "Doppelte Klickpunkte (10s)", icon: "✨" },
  { id: "mini-dots", label: "Mini Dots (Runde)", icon: "🔬" },
  { id: "inverted-move", label: "Invertiert (Runde)", icon: "🔄" },
  { id: "time-drain", label: "Zeit −5/−10 s", icon: "⏳" },
  { id: "screen-shake", label: "Chaos (Runde)", icon: "🌪️" },
] as const;

const LUCKY_WHEEL_COLORS = [
  "#fde68a",
  "#fca5a5",
  "#93c5fd",
  "#a7f3d0",
  "#ddd6fe",
  "#fecdd3",
  "#e7e5e4",
  "#fbcfe8",
  "#c4b5fd",
] as const;

type TrapBall = {
  id: string;
  x: number;
  y: number;
  hueDeg: number;
};

type ComboPopup = {
  id: string;
  streak: number;
  x: number;
  y: number;
};

type GoldenDot = {
  id: string;
  x: number;
  y: number;
};

type LuckyReward = (typeof LUCKY_REWARDS)[number];
type LuckyRewardId = LuckyReward["id"];
type TimedLuckyRewardId = Exclude<LuckyRewardId, "time-drain">;
type LuckyEffects = Record<TimedLuckyRewardId, boolean>;

const INITIAL_LUCKY_EFFECTS: LuckyEffects = {
  "score-burst": false,
  "time-boost": false,
  "bigger-dot": false,
  shield: false,
  "double-click": false,
  "mini-dots": false,
  "inverted-move": false,
  "screen-shake": false,
};

const LUCKY_REWARD_IDS = Object.keys(INITIAL_LUCKY_EFFECTS) as TimedLuckyRewardId[];

const BAD_LUCKY_MATCH_EFFECT_IDS = new Set<TimedLuckyRewardId>([
  "mini-dots",
  "inverted-move",
  "screen-shake",
]);

function getMinLuckyEffectRemainingMs(
  effects: LuckyEffects,
  expireAt: Partial<Record<TimedLuckyRewardId, number>>,
): number | null {
  const now = Date.now();
  let min: number | null = null;
  for (const id of LUCKY_REWARD_IDS) {
    if (!effects[id]) continue;
    const deadline = expireAt[id];
    if (deadline == null) continue;
    const rem = deadline - now;
    if (min === null || rem < min) min = rem;
  }
  return min;
}

function getDotSize(currentScore: number) {
  const ladder = Math.max(0, Math.floor(currentScore));
  return Math.max(
    MIN_DOT_SIZE,
    INITIAL_DOT_SIZE - ladder * DOT_SIZE_DECREASE_PER_POINT,
  );
}

function getDotPixelSizeForScore(currentScore: number, biggerDot: boolean) {
  return Math.max(
    MIN_DOT_SIZE,
    getDotSize(currentScore) + (biggerDot ? DOT_BIGGER_BOOST_PX : 0),
  );
}

function getBiggerDotForGameplay(effects: LuckyEffects): boolean {
  return effects["bigger-dot"] && !effects["mini-dots"];
}

function getGameplayDotPixelSize(currentScore: number, effects: LuckyEffects) {
  const bigger = getBiggerDotForGameplay(effects);
  const base = getDotPixelSizeForScore(currentScore, bigger);
  if (effects["mini-dots"]) {
    return Math.max(12, Math.round(base * 0.3));
  }
  return base;
}

function getGameplayDotCenterClampPadding(currentScore: number, effects: LuckyEffects) {
  return getGameplayDotPixelSize(currentScore, effects) / 2 + PLAYFIELD_EDGE_PX;
}

function computeRandomGoodDotCenter(
  scoreForSize: number,
  effects: LuckyEffects,
  pw: number,
  ph: number,
): { x: number; y: number } {
  const padding = getGameplayDotCenterClampPadding(scoreForSize, effects);
  const innerW = pw - padding * 2;
  const innerH = ph - padding * 2;

  if (innerW <= 0 || innerH <= 0) {
    return { x: pw / 2, y: ph / 2 };
  }

  let x = Math.random() * innerW + padding;
  let y = Math.random() * innerH + padding;
  if (effects["inverted-move"]) {
    x = pw - x;
    y = ph - y;
  }
  return { x, y };
}

function pickTrapBallPosition(
  playfieldW: number,
  playfieldH: number,
  trapRadius: number,
  goodX: number,
  goodY: number,
  goodRadius: number,
  existing: { x: number; y: number }[],
  edgeMargin: number,
) {
  const pad = trapRadius + edgeMargin;
  const minDistFromGood = goodRadius + trapRadius + 22;
  const spanW = playfieldW - pad * 2;
  const spanH = playfieldH - pad * 2;

  if (
    !Number.isFinite(spanW) ||
    !Number.isFinite(spanH) ||
    spanW <= 0 ||
    spanH <= 0
  ) {
    return { x: playfieldW / 2, y: playfieldH / 2 };
  }

  for (let attempt = 0; attempt < 45; attempt += 1) {
    const nx = Math.random() * spanW + pad;
    const ny = Math.random() * spanH + pad;
    if (Math.hypot(nx - goodX, ny - goodY) < minDistFromGood) {
      continue;
    }
    const farEnoughFromTraps = existing.every(
      (t) => Math.hypot(nx - t.x, ny - t.y) >= trapRadius * 2 + 14,
    );
    if (!farEnoughFromTraps) continue;
    return { x: nx, y: ny };
  }

  return { x: playfieldW / 2, y: playfieldH / 2 };
}

function pickTrapHueDeg() {
  // Echter Ball: kein hue-rotate (≈ 0°). Diesen Bereich auslassen, damit die Falle nie gleich wirkt.
  const margin = 42;
  return margin + Math.floor(Math.random() * (360 - margin * 2));
}

type CatchDotButtonProps = {
  dotPx: number;
  disabled?: boolean;
  onClick?: () => void;
  ariaLabel: string;
  /** Falle: gleiche Form, andere Farbe per hue-rotate */
  decoyHueDeg?: number;
};

function CatchDotButton({
  dotPx,
  disabled,
  onClick,
  ariaLabel,
  decoyHueDeg,
}: CatchDotButtonProps) {
  const filter =
    decoyHueDeg != null
      ? `hue-rotate(${decoyHueDeg}deg) drop-shadow(0 8px 16px rgb(91 33 182 / 0.35))`
      : "drop-shadow(0 8px 16px rgb(91 33 182 / 0.35))";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className="group relative flex appearance-none items-center justify-center overflow-visible border-0 bg-transparent p-0 outline-none transition-[transform,filter] duration-200 ease-out hover:scale-[1.06] hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100 disabled:hover:brightness-100"
      style={{
        width: dotPx,
        height: dotPx,
        filter,
      }}
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
  );
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
  const playfieldShakeWrapRef = useRef<HTMLDivElement>(null);
  const [playfieldSize, setPlayfieldSize] = useState({
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
  });

  const [x, setX] = useState(200);
  const [y, setY] = useState(200);
  const [trapBalls, setTrapBalls] = useState<TrapBall[]>([]);
  const [comboPopups, setComboPopups] = useState<ComboPopup[]>([]);
  const [goldenDot, setGoldenDot] = useState<GoldenDot | null>(null);
  const [matchShopClickBonus, setMatchShopClickBonus] = useState(0);
  const [luckySpinsUsed, setLuckySpinsUsed] = useState(0);
  const [goodDotVisible, setGoodDotVisible] = useState(true);
  const latestScoreRef = useRef(score);
  const isPlayingRef = useRef(isPlaying);
  const lastGoodClickMsRef = useRef<number | null>(null);
  const comboStreakRef = useRef(0);
  const activeLuckyEffectsRef = useRef(activeLuckyEffects);
  const roundFinalizedRef = useRef(false);
  const luckyEffectTimeoutsRef = useRef<Partial<Record<TimedLuckyRewardId, number>>>(
    {},
  );
  const luckyEffectExpireAtRef = useRef<Partial<Record<TimedLuckyRewardId, number>>>(
    {},
  );

  const [luckyVisualTick, setLuckyVisualTick] = useState(0);
  const dotSize = getGameplayDotPixelSize(score, activeLuckyEffects);
  const highestScore = highScores[0] ?? 0;
  const modeDuration = MODE_SETTINGS[mode].duration;
  const isScoreBurstActive = activeLuckyEffects["score-burst"];
  const isDoubleClickActive = activeLuckyEffects["double-click"];
  const isTimeBoostActive = activeLuckyEffects["time-boost"];
  const isShieldActive = activeLuckyEffects.shield;
  const isMiniDotsActive = activeLuckyEffects["mini-dots"];
  const isInvertedMoveActive = activeLuckyEffects["inverted-move"];
  const isScreenShakeActive = activeLuckyEffects["screen-shake"];

  const luckyFxActive =
    isScoreBurstActive ||
    isDoubleClickActive ||
    isTimeBoostActive ||
    isShieldActive ||
    activeLuckyEffects["bigger-dot"] ||
    isMiniDotsActive ||
    isInvertedMoveActive ||
    isScreenShakeActive;

  useEffect(() => {
    if (!luckyFxActive) return;
    const id = window.setInterval(() => {
      setLuckyVisualTick((n) => n + 1);
    }, 100);
    return () => clearInterval(id);
  }, [luckyFxActive]);

  activeLuckyEffectsRef.current = activeLuckyEffects;
  isPlayingRef.current = isPlaying;

  function triggerPlayfieldShake() {
    if (!activeLuckyEffectsRef.current["screen-shake"]) return;
    const el = playfieldShakeWrapRef.current;
    if (!el) return;
    el.classList.remove("catch-dot-screen-shake-run");
    void el.offsetWidth;
    el.classList.add("catch-dot-screen-shake-run");
  }

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
    setTrapBalls([]);
    setComboPopups([]);
    setGoldenDot(null);
    setGoodDotVisible(true);
    setLuckySpinsUsed(0);
    setMatchShopClickBonus(0);
    luckyEffectExpireAtRef.current = {};
    for (const id of LUCKY_REWARD_IDS) {
      const tid = luckyEffectTimeoutsRef.current[id];
      if (tid) {
        window.clearTimeout(tid);
        delete luckyEffectTimeoutsRef.current[id];
      }
    }
    lastGoodClickMsRef.current = null;
    comboStreakRef.current = 0;
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
      luckyEffectExpireAtRef.current = {};
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
      const el = arenaPlayfieldRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
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
    const padding = getGameplayDotCenterClampPadding(score, activeLuckyEffects);
    const { width: pw, height: ph } = playfieldSize;
    if (pw <= 0 || ph <= 0) return;

    setX((currentX) => {
      const nx = Math.min(Math.max(currentX, padding), pw - padding);
      return Object.is(nx, currentX) ? currentX : nx;
    });
    setY((currentY) => {
      const ny = Math.min(Math.max(currentY, padding), ph - padding);
      return Object.is(ny, currentY) ? currentY : ny;
    });
  }, [
    playfieldSize.width,
    playfieldSize.height,
    score,
    activeLuckyEffects["bigger-dot"],
    activeLuckyEffects["mini-dots"],
  ]);

  function startGame() {
    roundFinalizedRef.current = false;
    setScore(0);
    setTimeLeft(modeDuration);
    setActiveLuckyEffects(INITIAL_LUCKY_EFFECTS);
    setLastLuckyReward(null);
    setTrapBalls([]);
    setComboPopups([]);
    setGoldenDot(null);
    setGoodDotVisible(true);
    setLuckySpinsUsed(0);
    setMatchShopClickBonus(0);
    lastGoodClickMsRef.current = null;
    comboStreakRef.current = 0;
    luckyEffectExpireAtRef.current = {};
    for (const id of LUCKY_REWARD_IDS) {
      const tid = luckyEffectTimeoutsRef.current[id];
      if (tid) {
        window.clearTimeout(tid);
        delete luckyEffectTimeoutsRef.current[id];
      }
    }
    setIsPlaying(true);
    moveDot(0);
  }

  function stopGame() {
    finalizeGame();
  }

  function moveDot(scoreForSize: number) {
    const { width: pw, height: ph } = playfieldSize;
    const p = computeRandomGoodDotCenter(
      scoreForSize,
      activeLuckyEffectsRef.current,
      pw,
      ph,
    );
    setX(p.x);
    setY(p.y);
    triggerPlayfieldShake();
  }

  function handleDotClick() {
    if (!isPlaying) return;
    const clickPoints =
      matchShopClickBonus +
      (isDoubleClickActive ? 2 : 1) +
      (isScoreBurstActive ? 3 : 0);
    const nowMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const lastMs = lastGoodClickMsRef.current;
    let streak = 1;
    if (lastMs !== null && nowMs - lastMs <= COMBO_WINDOW_MS) {
      streak = comboStreakRef.current + 1;
    }
    comboStreakRef.current = streak;
    lastGoodClickMsRef.current = nowMs;

    const comboBonus = streak >= 2 ? COMBO_BONUS_POINTS : 0;
    const nextScore = score + clickPoints + comboBonus;

    if (comboBonus > 0) {
      const popupId = `combo-${nowMs}-${Math.random().toString(36).slice(2, 8)}`;
      setComboPopups((prev) => [
        ...prev,
        { id: popupId, streak, x, y },
      ]);
      window.setTimeout(() => {
        setComboPopups((prev) => prev.filter((p) => p.id !== popupId));
      }, 780);
    }

    const eff = activeLuckyEffects;
    const { width: pw, height: ph } = playfieldSize;
    const nextPos = computeRandomGoodDotCenter(nextScore, eff, pw, ph);

    setScore(nextScore);
    setX(nextPos.x);
    setY(nextPos.y);

    const goodRadiusAfter = getGameplayDotPixelSize(nextScore, eff) / 2;
    let trapPlacement: { x: number; y: number } | null = null;

    if (nextScore >= TRAP_MIN_SCORE) {
      trapPlacement = pickTrapBallPosition(
        pw,
        ph,
        goodRadiusAfter,
        nextPos.x,
        nextPos.y,
        goodRadiusAfter,
        [],
        PLAYFIELD_EDGE_PX,
      );
      setTrapBalls([
        {
          id: `trap-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          x: trapPlacement.x,
          y: trapPlacement.y,
          hueDeg: pickTrapHueDeg(),
        },
      ]);
    } else {
      setTrapBalls([]);
    }

    const spawnGolden = Math.random() < 1 / GOLDEN_SPAWN_ODDS;
    setGoldenDot((prevGolden) => {
      if (!spawnGolden) return prevGolden;
      const existing: { x: number; y: number }[] = [];
      if (trapPlacement) existing.push(trapPlacement);
      if (prevGolden) existing.push({ x: prevGolden.x, y: prevGolden.y });
      const pos = pickTrapBallPosition(
        pw,
        ph,
        goodRadiusAfter,
        nextPos.x,
        nextPos.y,
        goodRadiusAfter,
        existing,
        PLAYFIELD_EDGE_PX,
      );
      return {
        id: `gold-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        x: pos.x,
        y: pos.y,
      };
    });
    triggerPlayfieldShake();
  }

  function handleGoldenClick() {
    if (!isPlaying || !goldenDot) return;
    setScore((s) => s + GOLDEN_BONUS_POINTS);
    setGoldenDot(null);
    triggerPlayfieldShake();
  }

  function handleTrapBallClick() {
    if (!isPlaying) return;
    triggerPlayfieldShake();
    finalizeGame();
  }

  function applyLuckyReward(reward: LuckyReward) {
    if (reward.id === "time-drain") {
      setTimeLeft((t) => Math.max(0, t - (Math.random() < 0.5 ? 5 : 10)));
      return;
    }

    const rewardId = reward.id;

    setActiveLuckyEffects((currentEffects) => ({
      ...currentEffects,
      [rewardId]: true,
    }));

    if (BAD_LUCKY_MATCH_EFFECT_IDS.has(rewardId)) {
      const existingTimeout = luckyEffectTimeoutsRef.current[rewardId];
      if (existingTimeout) {
        window.clearTimeout(existingTimeout);
        delete luckyEffectTimeoutsRef.current[rewardId];
      }
      delete luckyEffectExpireAtRef.current[rewardId];
      return;
    }

    const existingTimeout = luckyEffectTimeoutsRef.current[rewardId];
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    luckyEffectExpireAtRef.current[rewardId] = Date.now() + LUCKY_EFFECT_DURATION_MS;

    luckyEffectTimeoutsRef.current[rewardId] = window.setTimeout(() => {
      setActiveLuckyEffects((currentEffects) => ({
        ...currentEffects,
        [rewardId]: false,
      }));
      delete luckyEffectTimeoutsRef.current[rewardId];
      delete luckyEffectExpireAtRef.current[rewardId];
    }, LUCKY_EFFECT_DURATION_MS);
  }

  function buyShopDotBonus() {
    if (
      !isPlaying ||
      totalPoints < SHOP_DOT_BONUS_COST ||
      matchShopClickBonus >= SHOP_DOT_BONUS_PER_CLICK
    ) {
      return;
    }
    setTotalPoints((t) => t - SHOP_DOT_BONUS_COST);
    setMatchShopClickBonus(SHOP_DOT_BONUS_PER_CLICK);
  }

  function buyLuckySpin() {
    if (
      !isPlaying ||
      totalPoints < LUCKY_SPIN_COST ||
      isSpinningWheel ||
      luckySpinsUsed >= LUCKY_MAX_SPINS_PER_GAME
    ) {
      return;
    }

    const rewardIndex = Math.floor(Math.random() * LUCKY_REWARDS.length);
    const randomReward = LUCKY_REWARDS[rewardIndex];
    const segmentAngle = 360 / LUCKY_REWARDS.length;
    const segmentCenterAngle = rewardIndex * segmentAngle + segmentAngle / 2;
    const spins = 5 + Math.floor(Math.random() * 2);
    const targetRotation = wheelRotation + spins * 360 + (360 - segmentCenterAngle);

    setTotalPoints((currentTotalPoints) => currentTotalPoints - LUCKY_SPIN_COST);
    setLuckySpinsUsed((n) => n + 1);
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
    if (!isPlaying || (mode !== "hard" && mode !== "normal")) {
      setGoodDotVisible(true);
      return;
    }

    setGoodDotVisible(true);

    const clickWindowMs =
      mode === "hard" ? HARD_DOT_CLICK_WINDOW_MS : NORMAL_DOT_CLICK_WINDOW_MS;

    let revealTimeoutId: number | undefined;
    const missTimerId = window.setTimeout(() => {
      if (!isPlayingRef.current) return;

      if (activeLuckyEffectsRef.current.shield) {
        moveDot(latestScoreRef.current);
        lastGoodClickMsRef.current = null;
        comboStreakRef.current = 0;
        setGoldenDot(null);
        return;
      }

      setGoodDotVisible(false);
      revealTimeoutId = window.setTimeout(() => {
        if (!isPlayingRef.current) return;

        const prevScore = latestScoreRef.current;
        const nextScoreAfterMiss = Math.max(0, prevScore - 1);
        setScore(nextScoreAfterMiss);
        moveDot(nextScoreAfterMiss);
        if (nextScoreAfterMiss < TRAP_MIN_SCORE) {
          setTrapBalls([]);
        }
        setGoldenDot(null);
        setGoodDotVisible(true);
        lastGoodClickMsRef.current = null;
        comboStreakRef.current = 0;
      }, DOT_MISS_HIDE_MS);
    }, clickWindowMs);

    return () => {
      window.clearTimeout(missTimerId);
      if (revealTimeoutId !== undefined) {
        window.clearTimeout(revealTimeoutId);
      }
    };
  }, [isPlaying, mode, x, y, dotSize]);

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

  void luckyVisualTick;
  const minLuckyRemainingMs = luckyFxActive
    ? getMinLuckyEffectRemainingMs(activeLuckyEffects, luckyEffectExpireAtRef.current)
    : null;
  const luckyPlayfieldPanic =
    luckyFxActive &&
    minLuckyRemainingMs !== null &&
    minLuckyRemainingMs > 0 &&
    minLuckyRemainingMs <= LUCKY_PLAYFIELD_PANIC_MS;

  const arenaInnerClass = luckyPlayfieldPanic
    ? "catch-dot-lucky-panic-field relative mx-auto overflow-hidden rounded-xl border-2 border-amber-400 bg-amber-50/90 shadow-inner"
    : luckyFxActive
      ? "relative mx-auto overflow-hidden rounded-xl border-2 border-amber-400/85 bg-gradient-to-br from-amber-50/95 via-orange-50/92 to-fuchsia-100/90 shadow-inner transition-[background-color,border-color,box-shadow] duration-300"
      : "relative mx-auto overflow-hidden rounded-xl border border-violet-300 bg-white/90 shadow-inner transition-[background-color,border-color] duration-300";

  const luckyRemainSec =
    minLuckyRemainingMs != null ? Math.max(0, minLuckyRemainingMs / 1000) : null;

  return (
    <section className="relative mx-auto max-w-5xl rounded-3xl bg-white p-6 pb-12 shadow-2xl">
      {goldenDot && isPlaying && (
        <div className="mb-2 flex justify-center" role="status" aria-live="polite">
          <p className="text-center text-5xl font-black uppercase leading-none tracking-tight text-red-600 drop-shadow-[0_2px_0_rgb(254_202_202)] sm:text-6xl md:text-7xl">
            Glückspilz
          </p>
        </div>
      )}
      {luckyFxActive && isPlaying && (
        <div
          className={`mb-4 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-4 py-3 sm:flex-row sm:gap-4 ${
            luckyPlayfieldPanic
              ? "border-amber-500 bg-gradient-to-r from-amber-200/90 via-rose-200/80 to-violet-200/90 shadow-[0_0_20px_rgb(251_191_36/0.45)]"
              : "border-amber-300/90 bg-gradient-to-r from-amber-50 via-orange-50 to-fuchsia-50 shadow-sm"
          }`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-xs font-bold uppercase tracking-wide text-amber-900/90">
            Spezial-Effekt
          </span>
          <span
            className={`text-3xl font-black tabular-nums tracking-tight text-amber-950 ${
              luckyPlayfieldPanic ? "animate-pulse" : ""
            }`}
          >
            {luckyRemainSec != null && luckyRemainSec > 0
              ? `${luckyRemainSec.toLocaleString("de-DE", {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                })} s`
              : "…"}
          </span>
          <span className="max-w-xs text-center text-[11px] font-medium text-amber-950/80 sm:text-left">
            {luckyRemainSec != null && luckyRemainSec > 0
              ? "Zeit bis der frueheste Effekt endet."
              : "Effekt laeuft …"}
          </span>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Catch the Dot</h1>
          <p className="mt-2 text-zinc-600">
            {mode === "hard"
              ? "Hard: Der Punkt bleibt 1 s sichtbar. Nicht rechtzeitig geklickt: −1 Punkt, dann erscheint er woanders. Goldpunkt (1:99): +500."
              : mode === "normal"
                ? "Normal: 1,5 s pro Ball, sonst −1. Ab 2. Treffer in 0,75 s: +0,75 Combo-Punkte. Goldpunkt (1:99): +500."
                : "Klicke den Punkt so oft wie möglich, bevor die Zeit abläuft. Ab dem 2. Treffer innerhalb von 0,75 s gibt es +0,75 Combo-Punkte. Selten: goldener Punkt (1:99 pro Treffer) bringt +500."}
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
            className={arenaInnerClass}
            style={{
              width: arenaWidth,
              maxWidth: "100%",
              aspectRatio: `${ARENA_WIDTH} / ${ARENA_HEIGHT}`,
            }}
          >
          <div
            ref={playfieldShakeWrapRef}
            className="catch-dot-shake-root relative h-full w-full"
          >
          <div
            className={
              luckyPlayfieldPanic
                ? "pointer-events-none absolute inset-0 z-0 catch-dot-lucky-panic-overlay"
                : luckyFxActive
                  ? "pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-amber-200/50 via-orange-100/35 to-fuchsia-200/40"
                  : "pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-violet-100/40 via-transparent to-indigo-100/50"
            }
            aria-hidden
          />
          <div
            className={
              luckyPlayfieldPanic
                ? "pointer-events-none absolute inset-0 z-0 catch-dot-lucky-panic-radial"
                : luckyFxActive
                  ? "pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgb(251_191_36/0.12)_100%)]"
                  : "pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgb(139_92_246/0.06)_100%)]"
            }
            aria-hidden
          />

          {comboPopups.map((pop) => (
            <div
              key={pop.id}
              className="catch-dot-combo-popup pointer-events-none absolute z-[25] flex flex-col items-center text-center"
              style={{
                left: pop.x,
                top: pop.y,
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="text-xl font-black leading-none tracking-tight text-fuchsia-600 drop-shadow-[0_1px_2px_rgb(255_255_255/0.9)]">
                {pop.streak}× Combo!
              </span>
              <span className="mt-1 text-sm font-bold text-violet-800">
                +{COMBO_BONUS_POINTS.toLocaleString("de-DE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          ))}

          {trapBalls.map((trap) => (
            <div
              key={trap.id}
              className="absolute z-[15]"
              style={{
                left: trap.x,
                top: trap.y,
                width: dotSize,
                height: dotSize,
                transform: "translate(-50%, -50%)",
              }}
            >
              <CatchDotButton
                dotPx={dotSize}
                decoyHueDeg={trap.hueDeg}
                disabled={!isPlaying}
                onClick={handleTrapBallClick}
                ariaLabel="Falle – nicht klicken"
              />
            </div>
          ))}

          {goldenDot && (
            <div
              key={goldenDot.id}
              className="absolute z-[17] animate-pulse"
              style={{
                left: goldenDot.x,
                top: goldenDot.y,
                width: dotSize,
                height: dotSize,
                transform: "translate(-50%, -50%)",
              }}
            >
              <button
                type="button"
                disabled={!isPlaying}
                onClick={handleGoldenClick}
                aria-label={`Goldpunkt: plus ${GOLDEN_BONUS_POINTS} Punkte`}
                className="relative flex h-full w-full appearance-none items-center justify-center overflow-hidden rounded-full border-2 border-amber-200 p-0 outline-none transition-[transform,filter] duration-200 ease-out hover:scale-[1.08] hover:brightness-110 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
                style={{
                  width: dotSize,
                  height: dotSize,
                  filter:
                    "drop-shadow(0 0 16px rgb(250 204 21 / 0.95)) drop-shadow(0 6px 14px rgb(180 83 9 / 0.4))",
                  background:
                    "radial-gradient(circle at 28% 22%, rgb(255 251 235) 0%, rgb(253 224 71) 24%, rgb(234 179 8) 50%, rgb(180 83 9) 78%, rgb(120 53 15) 100%)",
                  boxShadow:
                    "inset 0 -10px 18px rgb(146 64 14 / 0.45), inset 0 6px 12px rgb(255 255 255 / 0.55)",
                }}
              >
                <span
                  className="pointer-events-none absolute inset-[12%] rounded-full bg-gradient-to-br from-white/70 via-amber-100/30 to-transparent"
                  aria-hidden
                />
                <span
                  className="pointer-events-none absolute bottom-[14%] right-[16%] h-[22%] w-[28%] rounded-full bg-amber-950/25 blur-sm"
                  aria-hidden
                />
              </button>
            </div>
          )}

          <div
            className={`absolute z-20 transition-opacity duration-150 ease-out ${
              mode === "easy" || !isPlaying || goodDotVisible
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            }`}
            style={{
              left: x,
              top: y,
              width: dotSize,
              height: dotSize,
              transform: "translate(-50%, -50%)",
            }}
          >
            <CatchDotButton
              dotPx={dotSize}
              disabled={
                !isPlaying ||
                ((mode === "hard" || mode === "normal") && !goodDotVisible)
              }
              onClick={handleDotClick}
              ariaLabel="Punkt fangen"
            />
          </div>
          </div>
          </div>
        </div>

        <aside className="w-full rounded-2xl border-2 border-zinc-200 bg-zinc-50 p-4 lg:w-72">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Highscore
          </h2>
          <div className="mt-2 rounded-xl bg-white px-3 py-4 text-center">
            <div className="text-3xl font-black text-zinc-900">
              {highestScore.toLocaleString("de-DE", {
                maximumFractionDigits: 2,
                minimumFractionDigits: Number.isInteger(highestScore) ? 0 : 1,
              })}
            </div>
          </div>

          <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-amber-800">
                Gluecksrad
              </span>
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[10px] font-semibold text-amber-900/90">
                  {luckySpinsUsed}/{LUCKY_MAX_SPINS_PER_GAME} pro Runde
                </span>
                <button
                  type="button"
                  onClick={buyLuckySpin}
                  disabled={
                    !isPlaying ||
                    totalPoints < LUCKY_SPIN_COST ||
                    isSpinningWheel ||
                    luckySpinsUsed >= LUCKY_MAX_SPINS_PER_GAME
                  }
                  className="rounded-md bg-amber-400 px-2 py-1 text-xs font-bold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSpinningWheel ? "Dreht..." : `Spin (${LUCKY_SPIN_COST})`}
                </button>
              </div>
            </div>

            <div className="mt-3 flex justify-center">
              <div className="relative h-44 w-44">
                <div className="absolute left-1/2 top-[-10px] z-10 h-0 w-0 -translate-x-1/2 border-l-[10px] border-r-[10px] border-t-0 border-b-[14px] border-l-transparent border-r-transparent border-b-zinc-900" />
                <div
                  className="relative h-44 w-44 overflow-hidden rounded-full border-4 border-amber-400 shadow-inner transition-transform duration-1000 ease-out"
                  style={{
                    transform: `rotate(${wheelRotation}deg)`,
                    background: luckyWheelConicBackground,
                  }}
                >
                  {LUCKY_REWARDS.map((reward, i) => {
                    const angle = i * luckyWheelSegmentAngle + luckyWheelSegmentAngle / 2;
                    const labelRadius = "3.15rem";
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
            <p className="mt-1 text-[11px] text-zinc-600">
              Max. {LUCKY_MAX_SPINS_PER_GAME} Spins pro Runde. Guenstige Rad-Effekte: je{" "}
              {LUCKY_EFFECT_DURATION_MS / 1000} s. Unguenstige (Mini, Invertiert, Chaos) bis zum Ende der
              Runde.
            </p>
            <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">
              Achtung: Es gibt auch unguenstige Felder (Zeitverlust sofort; Mini, invertierte Platzierung,
              Chaos-Wackeln bis Rundenende).
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-6 flex flex-col items-center gap-5">
        <div className="flex w-full flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-lg text-zinc-700">
            {isPlaying
              ? "Los geht's!"
              : score > 0
                ? `Fertig. Du hast ${score.toLocaleString("de-DE", {
                    maximumFractionDigits: 2,
                  })} Punkte gemacht.`
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
            {luckyFxActive || matchShopClickBonus > 0
              ? ` ${[
                  isDoubleClickActive ? "x2 Klick" : null,
                  isScoreBurstActive ? "+3/Klick" : null,
                  isTimeBoostActive ? "Zeitstopp" : null,
                  isShieldActive ? "Schutz" : null,
                  activeLuckyEffects["bigger-dot"] ? "Groesserer Punkt" : null,
                  isMiniDotsActive ? "Mini-Punkte" : null,
                  isInvertedMoveActive ? "Invertiert" : null,
                  isScreenShakeActive ? "Chaos-Wackeln" : null,
                  matchShopClickBonus > 0 ? "+5/Treffer (Shop)" : null,
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

        <div className="flex w-full max-w-md flex-col items-center rounded-2xl border-2 border-emerald-300/90 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 px-5 py-4 text-center shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_6px_20px_rgba(16,185,129,0.15)]">
          <span className="text-xs font-bold uppercase tracking-wide text-emerald-800">
            Shop
          </span>
          <p className="mt-1.5 text-sm font-medium text-emerald-950/90">
            +{SHOP_DOT_BONUS_PER_CLICK} Punkte pro Treffer auf den echten Punkt — nur diese Runde.
          </p>
          <p className="mt-1 text-xs text-emerald-900/75">
            Preis: {SHOP_DOT_BONUS_COST} Gesamtpunkte (einmal pro Runde kaufbar).
          </p>
          <button
            type="button"
            onClick={buyShopDotBonus}
            disabled={
              !isPlaying ||
              totalPoints < SHOP_DOT_BONUS_COST ||
              matchShopClickBonus >= SHOP_DOT_BONUS_PER_CLICK
            }
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {matchShopClickBonus >= SHOP_DOT_BONUS_PER_CLICK
              ? "Bereits gekauft"
              : `Kaufen (${SHOP_DOT_BONUS_COST})`}
          </button>
        </div>
      </div>
      <p className="pointer-events-none absolute bottom-3 right-4 text-[10px] text-zinc-400">
        by Clavicular
      </p>
    </section>
  );
}
