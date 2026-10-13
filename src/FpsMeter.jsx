import { useEffect, useState } from 'react';

// Tier 0 gate: shows average fps and the slowest frame over the last 5 seconds.
export default function FpsMeter() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let raf, prev = performance.now(), frames = [];
    const tick = now => {
      frames.push(now - prev);
      prev = now;
      const total = frames.reduce((a, b) => a + b, 0);
      if (total >= 5000) {
        setStats({ fps: Math.round((frames.length * 1000) / total), worst: Math.round(Math.max(...frames)) });
        frames = [];
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fps" aria-live="polite">
      {stats ? `${stats.fps} fps · slowest frame ${stats.worst} ms` : 'Measuring…'}
    </div>
  );
}
