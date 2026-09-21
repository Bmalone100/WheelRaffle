import { useEffect, useRef, useState } from 'react';

const PALETTE = ['#5C3A7A', '#F5DEB3', '#3D2555', '#D9BD86'];
const TEXT_ON = ['#FBF3E3', '#3D2555', '#FBF3E3', '#3D2555'];

export function buildSegments(pool) {
  const total = pool.reduce((sum, e) => sum + e.entries, 0);
  let cursor = 0;
  return pool.map((e, i) => {
    const sweep = total > 0 ? (e.entries / total) * 360 : 0;
    const segment = {
      ...e,
      startAngle: cursor,
      endAngle: cursor + sweep,
      color: PALETTE[i % PALETTE.length],
      textColor: TEXT_ON[i % TEXT_ON.length],
    };
    cursor += sweep;
    return segment;
  });
}

function drawWheel(canvas, segments) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const radius = size / 2;
  ctx.clearRect(0, 0, size, size);

  segments.forEach((seg) => {
    const start = ((seg.startAngle - 90) * Math.PI) / 180;
    const end = ((seg.endAngle - 90) * Math.PI) / 180;

    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.arc(radius, radius, radius - 6, start, end);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = '#FAF6EE';
    ctx.lineWidth = 2;
    ctx.stroke();

    const sweep = seg.endAngle - seg.startAngle;
    if (sweep > 6) {
      const mid = ((seg.startAngle + seg.endAngle) / 2 - 90) * (Math.PI / 180);
      ctx.save();
      ctx.translate(radius + Math.cos(mid) * (radius * 0.62), radius + Math.sin(mid) * (radius * 0.62));
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = seg.textColor;
      ctx.font = `600 ${Math.max(11, Math.min(16, radius * 0.07))}px 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = seg.entries > 1 ? `${seg.name} (${seg.entries})` : seg.name;
      ctx.fillText(label.length > 18 ? `${label.slice(0, 16)}…` : label, 0, 0);
      ctx.restore();
    }
  });
}

export default function Wheel({ pool, spinning, targetAngle, onSpinComplete }) {
  const canvasRef = useRef(null);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (!canvasRef.current || pool.length === 0) return;
    drawWheel(canvasRef.current, buildSegments(pool));
  }, [pool]);

  useEffect(() => {
    if (targetAngle == null) return;
    setRotation(targetAngle);
  }, [targetAngle]);

  return (
    <div className="wheel-wrapper">
      <div className="wheel-pointer" />
      <canvas
        ref={canvasRef}
        width={480}
        height={480}
        className="wheel-canvas"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? 'transform 5.5s cubic-bezier(0.15, 0.8, 0.1, 1)' : 'none',
        }}
        onTransitionEnd={() => spinning && onSpinComplete()}
      />
    </div>
  );
}
