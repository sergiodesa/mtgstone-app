// Life-over-time chart as an SVG string (step lines, one per player)
import { formatClock } from './game.js';

export function lifeChartSVG(analysis, colors, { width = 340, height = 190, labels = true } = {}) {
  const { series, xMax, timed } = analysis;
  const pad = { l: labels ? 30 : 6, r: 8, t: 10, b: labels ? 22 : 6 };
  const ys = series.flat().map((p) => p.y);
  let yMin = Math.min(0, ...ys);
  let yMax = Math.max(...ys, 1);
  if (yMax - yMin < 10) yMax = yMin + 10;
  const W = width - pad.l - pad.r;
  const H = height - pad.t - pad.b;
  const X = (x) => pad.l + (x / xMax) * W;
  const Y = (y) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * H;

  const step = niceStep((yMax - yMin) / 4);
  let grid = '';
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    const y = Y(v).toFixed(1);
    grid += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" class="${v === 0 ? 'zero' : 'grid'}"/>`;
    if (labels) grid += `<text x="${pad.l - 6}" y="${y}" class="ylab">${v}</text>`;
  }
  if (labels) {
    grid += `<text x="${pad.l}" y="${height - 4}" class="xlab" text-anchor="start">${timed ? '00:00' : 'início'}</text>`;
    grid += `<text x="${width - pad.r}" y="${height - 4}" class="xlab" text-anchor="end">${timed ? formatClock(xMax) : `${xMax} alterações`}</text>`;
  }

  // Draw the players in reverse so P1 ends up on top
  const lines = series
    .map((pts, p) => {
      let d = `M${X(pts[0].x).toFixed(1)},${Y(pts[0].y).toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) {
        d += `H${X(pts[i].x).toFixed(1)}V${Y(pts[i].y).toFixed(1)}`;
      }
      const last = pts[pts.length - 1];
      return `<path d="${d}" stroke="${colors[p]}" class="line"/>` +
        `<circle cx="${X(last.x).toFixed(1)}" cy="${Y(last.y).toFixed(1)}" r="3.5" fill="${colors[p]}"/>`;
    })
    .reverse()
    .join('');

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Vida ao longo do jogo">${grid}${lines}</svg>`;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}
