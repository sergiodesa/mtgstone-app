// Result card (1080x1350 PNG) for sharing a game on WhatsApp & co.
import { analyse, winnerOf, seatName, formatDate, formatDuration, PLAYER_COLORS } from './game.js';

const C = {
  bg: '#000000', card: '#16191F', text: '#F2F4F8', dim: '#8A93A6', accent: '#00D4AA',
  negative: '#FF5A5F', border: '#2C313C',
};

const tint = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * a);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

function loadImage(src) {
  return new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
}

function fitFont(ctx, text, family, weight, size, maxW) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 4;
  } while (s > 20);
  return s;
}

export async function renderResultCard(record, people) {
  await Promise.all([
    document.fonts.load('400 160px Boldonse', '0123456789-'),
    document.fonts.load('600 60px Montserrat', 'LifeSTONE'),
    document.fonts.load('500 36px Montserrat', 'abc'),
  ]).catch(() => {});

  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const g = record.data;
  const a = analyse(g);
  const winner = winnerOf(record);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header: logo + title
  const stone = await loadImage('icons/stone.png');
  ctx.textBaseline = 'middle';
  ctx.font = '600 64px Montserrat, sans-serif';
  const lifeW = ctx.measureText('Life').width;
  const titleW = lifeW + ctx.measureText('STONE').width;
  const iconW = stone ? 96 : 0;
  let x = (W - titleW - iconW - (stone ? 24 : 0)) / 2;
  if (stone) {
    ctx.fillStyle = tint(C.accent, 40 / 255);
    ctx.beginPath();
    ctx.arc(x + iconW / 2, 100, 60, 0, Math.PI * 2);
    ctx.fill();
    const k = 80 / stone.width;
    ctx.drawImage(stone, x + (iconW - 80) / 2, 100 - (stone.height * k) / 2, 80, stone.height * k);
    x += iconW + 24;
  }
  ctx.fillStyle = C.text;
  ctx.fillText('Life', x, 102);
  ctx.fillStyle = C.accent;
  ctx.fillText('STONE', x + lifeW, 102);

  ctx.textAlign = 'center';
  ctx.fillStyle = C.dim;
  ctx.font = '500 34px Montserrat, sans-serif';
  const meta = [formatDate(g.date, record.importedAt), `${g.mode} ${g.mode === 1 ? 'jogador' : 'jogadores'}`];
  if (g.duration) meta.push(formatDuration(g.duration));
  ctx.fillText(meta.join('   ·   '), W / 2, 200);

  // Player tiles
  const top = 260, gap = 24, side = 60;
  const cols = g.mode === 1 ? 1 : 2;
  const tileH = g.mode === 4 ? 330 : 560;
  const tileW = (W - side * 2 - gap * (cols - 1)) / cols;
  for (let p = 0; p < g.mode; p++) {
    const tx = side + (p % cols) * (tileW + gap);
    const ty = top + Math.floor(p / cols) * (tileH + gap);
    const color = PLAYER_COLORS[p];
    ctx.fillStyle = tint(color, 0.16);
    roundRect(ctx, tx, ty, tileW, tileH, 36);
    ctx.fill();
    if (winner === p) {
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 6;
      roundRect(ctx, tx + 3, ty + 3, tileW - 6, tileH - 6, 33);
      ctx.stroke();
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    const name = seatName(record, p, people);
    fitFont(ctx, name, 'Montserrat, sans-serif', 600, 40, tileW - 64 - (winner === p ? 220 : 0));
    ctx.fillText(name, tx + 32, ty + 52);
    const deck = record.seats?.[p]?.deck?.trim();
    if (deck) {
      ctx.fillStyle = C.dim;
      fitFont(ctx, deck, 'Montserrat, sans-serif', 500, 28, tileW - 64);
      ctx.fillText(deck, tx + 32, ty + 98);
    }
    if (winner === p) {
      ctx.font = '700 24px Montserrat, sans-serif';
      const label = 'VENCEDOR';
      const lw = ctx.measureText(label).width + 40;
      ctx.fillStyle = C.accent;
      roundRect(ctx, tx + tileW - lw - 24, ty + 30, lw, 46, 23);
      ctx.fill();
      ctx.fillStyle = '#00140F';
      ctx.textAlign = 'center';
      ctx.fillText(label, tx + tileW - 24 - lw / 2, ty + 54);
    }
    const life = String(g.lives[p]);
    ctx.textAlign = 'center';
    ctx.fillStyle = a.out[p] ? C.negative : C.text;
    const size = fitFont(ctx, life, 'Boldonse, sans-serif', 400, g.mode === 4 ? 120 : 230, tileW - 80);
    ctx.font = `400 ${size}px Boldonse, sans-serif`;
    // Centre the digits' real ink box in the space under the name
    const m = ctx.measureText(life);
    const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const areaTop = ty + (deck ? 124 : 88);
    const areaH = ty + tileH - 24 - areaTop;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(life, tx + tileW / 2, areaTop + (areaH - inkH) / 2 + m.actualBoundingBoxAscent);
    ctx.textBaseline = 'middle';
  }

  // Life chart
  const chartTop = top + (g.mode === 4 ? 2 * tileH + gap : tileH) + 50;
  const chartH = H - chartTop - 110;
  if (g.entries.length && chartH > 120) drawChart(ctx, a, side, chartTop, W - side * 2, chartH);

  ctx.textAlign = 'center';
  ctx.fillStyle = C.dim;
  ctx.font = '500 28px Montserrat, sans-serif';
  ctx.fillText('LifeSTONE · MTG life counter', W / 2, H - 50);

  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}

function drawChart(ctx, a, x, y, w, h) {
  ctx.fillStyle = C.card;
  roundRect(ctx, x, y, w, h, 28);
  ctx.fill();
  const pad = 30;
  const ys = a.series.flat().map((p) => p.y);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(yMin + 10, ...ys);
  const X = (v) => x + pad + (v / a.xMax) * (w - pad * 2);
  const Y = (v) => y + pad + (1 - (v - yMin) / (yMax - yMin)) * (h - pad * 2);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + pad, Y(0));
  ctx.lineTo(x + w - pad, Y(0));
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  for (let p = a.series.length - 1; p >= 0; p--) {
    const pts = a.series[p];
    ctx.strokeStyle = PLAYER_COLORS[p];
    ctx.beginPath();
    ctx.moveTo(X(pts[0].x), Y(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(X(pts[i].x), Y(pts[i - 1].y));
      ctx.lineTo(X(pts[i].x), Y(pts[i].y));
    }
    ctx.stroke();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Opens the system share sheet with the image, or downloads it
export async function shareGame(record, people) {
  const blob = await renderResultCard(record, people);
  const name = `lifestone-${(record.data.date || 'jogo').replace(/[ :]/g, '-')}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'LifeSTONE' });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
