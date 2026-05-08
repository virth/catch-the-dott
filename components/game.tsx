"use client";

import { useEffect, useState } from "react";
import { ScoreBoard } from "@/components/score-board";

const GAME_TIME = 20;
const ARENA_WIDTH = 760;
const ARENA_HEIGHT = 420;
const DOT_SIZE = 64;

export function Game() {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [isPlaying, setIsPlaying] = useState(false);

  const [x, setX] = useState(200);
  const [y, setY] = useState(200);

  function startGame() {
    setScore(0);
    setTimeLeft(GAME_TIME);
    setIsPlaying(true);
    moveDot();
  }

  function moveDot() {
    const padding = DOT_SIZE;

    const newX = Math.random() * (ARENA_WIDTH - padding * 2) + padding;
    const newY = Math.random() * (ARENA_HEIGHT - padding * 2) + padding;

    // 🐞 Bug-Aufgabe:
    // Der Punkt bewegt sich aktuell nur nach oben und unten.
    // Findest du heraus, warum?
    setX(300);
    setY(newY);
  }

  function handleDotClick() {
    if (!isPlaying) return;

    // TODO 1:
    // Erhöhe den Score um 1.
    // Tipp:
    // setScore(...)

    moveDot();
  }

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setTimeLeft((currentTime) => {
        if (currentTime <= 1) {
          setIsPlaying(false);
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
    function handleKeyDown(event: KeyboardEvent) {
      // TODO 2:
      // Starte das Spiel mit der Leertaste.
      // 1. Prüfe ob die Leertaste gedrückt wurde
      // 2. Wenn ja, starte das Spiel mit startGame()
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <section className="mx-auto max-w-5xl rounded-3xl bg-white p-6 shadow-2xl">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tight">Catch the Dot</h1>
          <p className="mt-2 text-zinc-600">
            Klicke den Punkt so oft wie möglich, bevor die Zeit abläuft.
          </p>
        </div>

        <ScoreBoard score={score} timeLeft={timeLeft} />
      </div>

      <div
        className="relative overflow-hidden rounded-3xl border-2 border-zinc-200 bg-gradient-to-br from-zinc-200 to-white"
        style={{ width: ARENA_WIDTH, height: ARENA_HEIGHT }}
      >
        <button
          type="button"
          disabled={!isPlaying}
          onClick={handleDotClick}
          className="absolute grid place-items-center rounded-full bg-zinc-950 text-3xl text-white shadow-xl transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-30"
          style={{
            width: DOT_SIZE,
            height: DOT_SIZE,
            left: x,
            top: y,
            transform: "translate(-50%, -50%)",
          }}
        >
          🎯
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-lg text-zinc-700">
          {isPlaying
            ? "Los geht's!"
            : score > 0
              ? `Fertig. Du hast ${score} Punkte gemacht.`
              : "Klicke auf Start, um loszulegen."}
        </p>

        <button
          type="button"
          onClick={startGame}
          className="rounded-full bg-zinc-950 px-6 py-4 font-bold text-white transition hover:scale-105 hover:bg-zinc-800"
        >
          {isPlaying ? "Neustart" : "Start"}
        </button>
      </div>
    </section>
  );
}