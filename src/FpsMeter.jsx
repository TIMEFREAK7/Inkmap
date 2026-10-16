import { useEffect, useState } from 'react';

// Tier 0 gate: average fps, dropped frames and the slowest frame over each 5 seconds.
// A frame counts as dropped when it took over 1.5x the typical (median) frame: 8.3 ms on a 120 Hz screen.
export default function FpsMeter() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let raf, prev = performance.now(), frames = [];
    const tick = now => {
      frames.push(now - prev);
      prev = now;
      const total = frames.reduce((a, b) => a + b, 0);
      if (total >= 5000) {
        const typical = [...frames].sort((a, b) => a - b)[frames.length >> 1];
        setStats({
          fps: Math.round((frames.length * 1000) / total),
          hz: Math.round(1000 / typical),
          dropped: frames.filter(f => f > typical * 1.5).length,
          worst: Math.round(Math.max(...frames)),
        });
        frames = [];
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fps">
      {stats ? `${stats.fps} fps of ${stats.hz} Hz · ${stats.dropped} dropped · slowest ${stats.worst} ms` : 'Measuring…'}
    </div>
  );
}
