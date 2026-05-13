import { useEffect, useState } from "react";

const BRAILLE_FRAMES = [
  "⠋", "⠙", "⠹", "⠸", "⠼",
  "⠴", "⠦", "⠧", "⠇", "⠏",
  "⠿", "⣿", "⣶", "⣤", "⣀"
];

const STREAM_LENGTH = 24;

function createInitialCells() {
  return Array.from(
    { length: STREAM_LENGTH },
    (_, index) => BRAILLE_FRAMES[index % BRAILLE_FRAMES.length]
  );
}

export function BrailleNoiseStream() {
  const [cells, setCells] = useState(createInitialCells);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCells((current) =>
        current.map((_, index) => {
          const nextIndex = Math.floor(Math.random() * BRAILLE_FRAMES.length);
          return BRAILLE_FRAMES[(nextIndex + index) % BRAILLE_FRAMES.length];
        })
      );
    }, 90);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div data-testid="ai-braille-stream" className="mt-2 font-mono text-sm text-muted-foreground select-none">
      {cells.join("")}
    </div>
  );
}
