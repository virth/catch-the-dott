"use client";

import { useEffect, useRef, useState } from "react";
import { ScoreBoard } from "@/components/score-board";

const ARENA_WIDTH = 700;
const ARENA_HEIGHT = 420;
const MIN_ARENA_WIDTH = 260;
const MOBILE_ARENA_MARGIN = 48;
const INITIAL_DOT_SIZE = 64;
const MIN_DOT_SIZE = 24;
const DOT_SIZE_DECREASE_PER_POINT = 2;
const HIGH_SCORES_LIMIT = 5;
const HIGH_SCORES_STORAGE_KEY = "catch-the-dot-high-scores";
const HARD_MISS_TIMEOUT_MS = 750;
let newX = 0;
let newY = 0;

const MODE_SETTINGS = {
  easy: { label: "Easy", icon: "🟢", duration: 50 },
  normal: { label: "Normal", icon: "🟡", duration: 40 },
  hard: { label: "Hard", icon: "🔴", duration: 30 },
} as const;

type GameMode = keyof typeof MODE_SETTINGS;

function getDotSize(currentScore: number) {
  return Math.max(
    MIN_DOT_SIZE,
    INITIAL_DOT_SIZE - currentScore * DOT_SIZE_DECREASE_PER_POINT,
  );
}

export function Game() {
  const [mode, setMode] = useState<GameMode>("normal");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(MODE_SETTINGS.normal.duration);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highScores, setHighScores] = useState<number[]>([]);
  const [arenaWidth, setArenaWidth] = useState(ARENA_WIDTH);

  const [x, setX] = useState(200);
  const [y, setY] = useState(200);
  const latestScoreRef = useRef(score);

  const arenaHeight = Math.round((arenaWidth * ARENA_HEIGHT) / ARENA_WIDTH);
  const dotSize = getDotSize(score);
  const emojiSize = dotSize * 0.5;
  const highestScore = highScores[0] ?? 0;
  const modeDuration = MODE_SETTINGS[mode].duration;

  function saveScoreToHighscores(finalScore: number) {
    setHighScores((currentHighScores) =>
      [...currentHighScores, finalScore]
        .sort((a, b) => b - a)
        .slice(0, HIGH_SCORES_LIMIT),
    );
  }

  useEffect(() => {
    latestScoreRef.current = score;
  }, [score]);

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
    window.localStorage.setItem(
      HIGH_SCORES_STORAGE_KEY,
      JSON.stringify(highScores),
    );
  }, [highScores]);

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

  useEffect(() => {
    const padding = dotSize / 2;
    setX((currentX) => Math.min(Math.max(currentX, padding), arenaWidth - padding));
    setY((currentY) =>
      Math.min(Math.max(currentY, padding), arenaHeight - padding),
    );
  }, [arenaWidth, arenaHeight, dotSize]);

  function startGame() {
    setScore(0);
    setTimeLeft(modeDuration);
    setIsPlaying(true);
    moveDot(0);
  }

  function stopGame() {
    if (!isPlaying) return;
    setIsPlaying(false);
    saveScoreToHighscores(latestScoreRef.current);
  }

  function moveDot(currentScore = score) {
    const padding = getDotSize(currentScore) / 2;

    newX = Math.random() * (arenaWidth - padding * 2) + padding;
    newY = Math.random() * (arenaHeight - padding * 2) + padding;

    // 🐞 Bug-Aufgabe:
    // Der Punkt bewegt sich aktuell nur nach oben und unten.
    // Findest du heraus, warum?
    
    
    // setzt die x-koordinate (breite) des punktes
    setX(newX);

    // setzt die y-koordinate (höhe) des punktes
    setY(newY);
  }

  function handleDotClick() {
    if (!isPlaying) return;
    const nextScore = score + 1;
    setScore(nextScore);

    // TODO 1:
    // Erhöhe den Score um 1.
    // Tipp:
    // setScore(...)

    moveDot(nextScore);
  }

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setTimeLeft((currentTime) => {
        if (currentTime <= 1) {
          setIsPlaying(false);
          saveScoreToHighscores(latestScoreRef.current);
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
    if (!isPlaying || mode !== "hard") return;

    const missTimer = window.setTimeout(() => {
      setScore((currentScore) => {
        const nextScore = Math.max(0, currentScore - 1);
        moveDot(nextScore);
        return nextScore;
      });
    }, HARD_MISS_TIMEOUT_MS);

    return () => {
      window.clearTimeout(missTimer);
    };
  }, [isPlaying, mode, x, y]);

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
        <div
          className="relative w-full overflow-hidden rounded-3xl border-2 border-zinc-200 bg-gradient-to-br from-zinc-200 to-white"
          style={{ width: arenaWidth, height: arenaHeight, maxWidth: "100%" }}
        >
          <button
            type="button"
            disabled={!isPlaying}
            onClick={handleDotClick}
            className="absolute grid place-items-center rounded-full bg-red-500 text-white shadow-xl transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-30"
            style={{
              width: dotSize,
              height: dotSize,
              left: x,
              top: y,
              transform: "translate(-50%, -50%)",
              fontSize: emojiSize,
              lineHeight: 1,
            }}
          >
            🎯
          </button>
        </div>

        <aside className="w-full rounded-2xl border-2 border-zinc-200 bg-zinc-50 p-4 lg:w-44">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Highscore
          </h2>
          <div className="mt-2 rounded-xl bg-white px-3 py-4 text-center">
            <div className="text-3xl font-black text-zinc-900">{highestScore}</div>
          </div>
        </aside>
      </div>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <p className="text-lg text-zinc-700">
          {isPlaying
            ? "Los geht's!"
            : score > 0
              ? `Fertig. Du hast ${score} Punkte gemacht.`
              : "Klicke auf Start, um loszulegen."}
        </p>

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
