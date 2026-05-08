type ScoreBoardProps = {
    score: number;
    timeLeft: number;
  };
  
  export function ScoreBoard({ score, timeLeft }: ScoreBoardProps) {
    return (
      <div className="flex gap-3">
        <div className="rounded-2xl bg-zinc-100 px-5 py-3 text-center">
          <div className="text-sm text-zinc-500">Punkte</div>
          <div className="text-3xl font-black">{score}</div>
        </div>
  
        <div className="rounded-2xl bg-zinc-100 px-5 py-3 text-center">
          <div className="text-sm text-zinc-500">Zeit</div>
          <div className="text-3xl font-black">{timeLeft}</div>
        </div>
      </div>
    );
  }