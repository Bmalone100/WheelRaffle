import { useEffect, useRef, useState } from 'react';

const MIN_READABLE_FONT = 10;

// Deterministic PRNG so the wheel's slice order stays in sync between what's
// drawn and what App.jsx computes the winning angle from, without either side
// needing to share live state — same ticket set in, same shuffle out.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed;
  return function () {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTickets(pool) {
  const tickets = [];
  pool.forEach((e) => {
    for (let i = 0; i < e.entries; i++) {
      tickets.push({ id: e.id, name: e.name, email: e.email, ticketKey: `${e.id}#${i}` });
    }
  });
  return tickets;
}

function shuffledTickets(pool) {
  const tickets = buildTickets(pool);
  const seed = hashString(
    tickets
      .map((t) => t.ticketKey)
      .sort()
      .join('|')
  );
  const rand = mulberry32(seed);
  for (let i = tickets.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tickets[i], tickets[j]] = [tickets[j], tickets[i]];
  }
  return tickets;
}

// Sweeps hue 0 (red) -> 270 (violet) across the wheel in slice order, so
// going clockwise from the pointer reads red-orange-yellow-green-blue-indigo-violet.
function rainbowColor(index, total) {
  const hue = total > 1 ? (index / (total - 1)) * 270 : 0;
  const text = hue > 40 && hue < 200 ? '#20241f' : '#fdfdfd';
  return { fill: `hsl(${hue}, 75%, 50%)`, text };
}

export function buildSegments(pool) {
  const tickets = shuffledTickets(pool);
  const total = tickets.length;
  const sweep = total > 0 ? 360 / total : 0;
  return tickets.map((t, i) => {
    const { fill, text } = rainbowColor(i, total);
    return {
      ...t,
      startAngle: i * sweep,
      endAngle: (i + 1) * sweep,
      color: fill,
      textColor: text,
    };
  });
}

// Sizes a label to fill most of its wedge: start from the arc's angular
// width (how tall text can be without touching the slice edges), then shrink
// to fit the available centre-to-rim run if the name is long. Returns null
// when even the floor size wouldn't be readable — caller skips the label and
// leans on the hover tooltip instead.
function fitLabelFontSize(ctx, label, sweepDeg, radius) {
  const sweepRad = (sweepDeg * Math.PI) / 180;
  const arcWidth = 2 * (radius * 0.72) * Math.sin(sweepRad / 2);
  const innerGap = radius * 0.14;
  const available = radius - 14 - innerGap;

  let size = Math.max(MIN_READABLE_FONT, Math.min(arcWidth * 0.82, radius * 0.2));

  ctx.font = `700 ${size}px 'Segoe UI', sans-serif`;
  const width = ctx.measureText(label).width;
  if (width > available && width > 0) {
    size *= available / width;
  }

  return size < MIN_READABLE_FONT ? null : size;
}

function drawWheel(canvas, segments) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const radius = size / 2;
  ctx.clearRect(0, 0, size, size);

  const lineWidth = segments.length > 40 ? 0.5 : 2;

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
    ctx.lineWidth = lineWidth;
    ctx.stroke();

    const sweep = seg.endAngle - seg.startAngle;
    const mid = ((seg.startAngle + seg.endAngle) / 2 - 90) * (Math.PI / 180);
    const label = seg.name.length > 28 ? `${seg.name.slice(0, 26)}…` : seg.name;
    const fontSize = fitLabelFontSize(ctx, label, sweep, radius);
    if (fontSize == null) return;

    // Text runs along the slice's own radial line (centre -> rim), flipped
    // upright on the left half so it never renders upside down.
    const flip = Math.cos(mid) < 0;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.arc(radius, radius, radius - 6, start, end);
    ctx.closePath();
    ctx.clip();

    ctx.translate(radius, radius);
    ctx.rotate(flip ? mid + Math.PI : mid);
    ctx.fillStyle = seg.textColor;
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fontSize}px 'Segoe UI', sans-serif`;

    const innerGap = radius * 0.14;
    if (flip) {
      ctx.textAlign = 'right';
      ctx.fillText(label, -innerGap, 0);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(label, innerGap, 0);
    }
    ctx.restore();
  });
}

function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

export default function Wheel({ pool, spinning, targetAngle, onSpinComplete }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const segmentsRef = useRef([]);
  const [rotation, setRotation] = useState(0);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!canvasRef.current || pool.length === 0) {
      segmentsRef.current = [];
      return;
    }
    const segments = buildSegments(pool);
    segmentsRef.current = segments;
    drawWheel(canvasRef.current, segments);
  }, [pool]);

  useEffect(() => {
    if (targetAngle == null) return;
    setRotation(targetAngle);
  }, [targetAngle]);

  const handleMouseMove = (e) => {
    if (spinning || !wrapperRef.current || segmentsRef.current.length === 0) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const radiusPx = rect.width / 2;
    if (Math.hypot(dx, dy) > radiusPx) {
      setHover(null);
      return;
    }

    const screenAngle = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI + 90);
    const wheelAngle = normalizeAngle(screenAngle - rotation);
    const seg = segmentsRef.current.find((s) => wheelAngle >= s.startAngle && wheelAngle < s.endAngle);
    if (!seg) {
      setHover(null);
      return;
    }

    const entrant = pool.find((p) => p.id === seg.id);
    setHover({
      x: e.clientX,
      y: e.clientY,
      name: seg.name,
      entries: entrant ? entrant.entries : null,
    });
  };

  const handleMouseLeave = () => setHover(null);

  return (
    <div className="wheel-wrapper" ref={wrapperRef}>
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
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {hover && (
        <div className="wheel-tooltip" style={{ left: hover.x + 18, top: hover.y + 18 }}>
          <div className="wheel-tooltip-name">{hover.name}</div>
          {hover.entries != null && (
            <div className="wheel-tooltip-meta">
              {hover.entries} ticket{hover.entries === 1 ? '' : 's'} in the wheel
            </div>
          )}
        </div>
      )}
    </div>
  );
}
