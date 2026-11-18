// LifeSTONE game export parsing and analysis. Pure JS (no DOM) so it can be
// tested with `node --test app/test`.
//
// Export format v2 (examples/src/game.c, game_export_json):
//   {"v":2,"m":<mode>,"s":<start life>,"d":"YYYY-MM-DD HH:MM","t":<match s>,
//    "l":[lives],"n":<entries>,"h":[[player,from,to,match_s(,source)],...]}
// "d" is missing when the clock was not set, and "h" holds only the newest
// entries that fit in the QR code.

export const COMMANDER_LETHAL = 21;
export const PLAYER_COLORS = ['#4FC3F7', '#FF8A65', '#81C784', '#FFD54F'];

export class ParseError extends Error {}

const isInt = (x) => Number.isInteger(x);

// Accepts the raw QR text, or an app link carrying it after "#g=".
export function extractPayload(text) {
  const s = String(text ?? '').trim();
  const i = s.indexOf('#g=');
  if (i >= 0) {
    try {
      return decodeURIComponent(s.slice(i + 3));
    } catch {
      throw new ParseError('Link inválido');
    }
  }
  return s;
}

export function parseExport(text) {
  const payload = extractPayload(text);
  let o;
  try {
    o = JSON.parse(payload);
  } catch {
    throw new ParseError('Este QR code não é de um LifeSTONE');
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new ParseError('Este QR code não é de um LifeSTONE');
  if (o.v !== 2) throw new ParseError(`Versão de exportação não suportada (${o.v ?? '?'})`);
  if (![1, 2, 4].includes(o.m)) throw new ParseError('Número de jogadores inválido');
  if (!isInt(o.s) || !Array.isArray(o.l) || o.l.length !== o.m || !o.l.every(isInt)) {
    throw new ParseError('Dados do jogo incompletos');
  }
  const h = Array.isArray(o.h) ? o.h : [];
  const entries = [];
  for (const e of h) {
    if (!Array.isArray(e) || e.length < 4 || !e.slice(0, 4).every(isInt)) throw new ParseError('Histórico inválido');
    const [p, from, to, s, src] = e;
    if (p < 0 || p >= o.m) throw new ParseError('Histórico inválido');
    entries.push({ p, from, to, s, src: isInt(src) && src >= 0 && src < o.m ? src : null });
  }
  const date = typeof o.d === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(o.d) ? o.d : null;
  const total = isInt(o.n) && o.n >= entries.length ? o.n : entries.length;
  return {
    mode: o.m,
    startLife: o.s,
    date,
    duration: isInt(o.t) && o.t >= 0 ? o.t : 0,
    lives: o.l.slice(),
    total,
    entries,
    truncated: total > entries.length,
  };
}

// Same physical game scanned twice (e.g. once mid-game, once at the end) gets
// the same key, so the later scan updates the stored game.
export function gameKey(g) {
  if (g.date) return `${g.date}|${g.mode}|${g.startLife}`;
  return `nodate|${g.mode}|${g.startLife}|${hash(JSON.stringify(g.entries.slice(0, 6)))}`;
}

function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) {
    x ^= s.charCodeAt(i);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0).toString(36);
}

// Derived facts used by the views.
export function analyse(g) {
  const n = g.mode;
  const commander = Array.from({ length: n }, () => new Array(n).fill(0)); // [target][source]
  const taken = new Array(n).fill(0);
  const gained = new Array(n).fill(0);
  const start = g.lives.slice();
  const seen = new Array(n).fill(false);
  let biggestHit = null;

  for (const e of g.entries) {
    if (!seen[e.p]) {
      start[e.p] = e.from;
      seen[e.p] = true;
    }
    const d = e.to - e.from;
    if (d < 0) taken[e.p] -= d;
    else gained[e.p] += d;
    if (d < 0 && (!biggestHit || -d > biggestHit.amount)) biggestHit = { player: e.p, amount: -d, source: e.src };
    if (e.src !== null) commander[e.p][e.src] += e.from - e.to;
  }
  if (!g.truncated) start.fill(g.startLife);

  const out = g.lives.map((life, p) => life <= 0 || commander[p].some((c) => c >= COMMANDER_LETHAL));
  const alive = [];
  out.forEach((o, p) => { if (!o) alive.push(p); });
  const autoWinner = n > 1 && alive.length === 1 ? alive[0] : null;

  // Life over time. Use match seconds when the timer ran, otherwise entry order.
  const timed = g.entries.some((e) => e.s > 0);
  const series = Array.from({ length: n }, (_, p) => [{ x: 0, y: start[p] }]);
  g.entries.forEach((e, i) => {
    series[e.p].push({ x: timed ? e.s : i + 1, y: e.to });
  });
  const xMax = Math.max(1, timed ? Math.max(g.duration, ...g.entries.map((e) => e.s)) : g.entries.length);
  series.forEach((pts, p) => pts.push({ x: xMax, y: g.lives[p] }));

  return {
    commander,
    hasCommander: g.entries.some((e) => e.src !== null),
    taken,
    gained,
    start,
    out,
    alive,
    autoWinner,
    biggestHit,
    timed,
    xMax,
    series,
  };
}

// Winner of a stored game: an explicit choice wins over the automatic one.
// record.winner: undefined/null = automatic, -1 = no winner, 0..3 = seat.
export function winnerOf(record) {
  if (record.winner === -1) return null;
  if (isInt(record.winner) && record.winner >= 0 && record.winner < record.data.mode) return record.winner;
  return analyse(record.data).autoWinner;
}

export function seatName(record, seat, people) {
  const id = record.seats?.[seat]?.person;
  const person = id && people.find((x) => x.id === id);
  return person ? person.name : `P${seat + 1}`;
}

// Aggregate statistics over stored games.
export function stats(records, people) {
  const byPerson = new Map(people.map((p) => [p.id, { person: p, played: 0, wins: 0, decks: new Map() }]));
  const byDeck = new Map();
  let totalTime = 0;
  let timedGames = 0;
  let longest = null;
  let biggestHit = null;
  const modes = { 1: 0, 2: 0, 4: 0 };

  for (const r of records) {
    const g = r.data;
    modes[g.mode] = (modes[g.mode] || 0) + 1;
    if (g.duration > 0) {
      totalTime += g.duration;
      timedGames++;
      if (!longest || g.duration > longest.data.duration) longest = r;
    }
    const a = analyse(g);
    if (a.biggestHit && (!biggestHit || a.biggestHit.amount > biggestHit.amount)) {
      biggestHit = { ...a.biggestHit, record: r };
    }
    const w = winnerOf(r);
    for (let seat = 0; seat < g.mode; seat++) {
      const s = r.seats?.[seat];
      const won = w === seat;
      const ps = s?.person && byPerson.get(s.person);
      if (ps && g.mode > 1) {
        ps.played++;
        if (won) ps.wins++;
      }
      const deck = s?.deck?.trim();
      if (deck && g.mode > 1) {
        const k = deck.toLowerCase();
        const d = byDeck.get(k) || { name: deck, played: 0, wins: 0, owners: new Set() };
        d.played++;
        if (won) d.wins++;
        if (ps) d.owners.add(ps.person.name);
        byDeck.set(k, d);
        if (ps) ps.decks.set(k, (ps.decks.get(k) || 0) + 1);
      }
    }
  }

  const rate = (x) => (x.played ? x.wins / x.played : 0);
  const sortBoard = (a, b) => rate(b) - rate(a) || b.wins - a.wins || b.played - a.played;
  return {
    games: records.length,
    totalTime,
    avgTime: timedGames ? Math.round(totalTime / timedGames) : 0,
    modes,
    longest,
    biggestHit,
    players: [...byPerson.values()].filter((x) => x.played).sort(sortBoard),
    decks: [...byDeck.values()].sort(sortBoard),
  };
}

export function formatDuration(s) {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m} min`;
  return `${s} s`;
}

export function formatClock(s) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function formatDate(date, fallbackMs) {
  if (date) {
    const [d, t] = date.split(' ');
    const [y, mo, da] = d.split('-').map(Number);
    return `${da} ${MONTHS[mo - 1]} ${y} · ${t}`;
  }
  if (fallbackMs) {
    const x = new Date(fallbackMs);
    return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()} · lido`;
  }
  return 'Sem data';
}

// Sort key: game date if known, otherwise the time it was scanned.
export function sortTime(record) {
  if (record.data.date) {
    const [d, t] = record.data.date.split(' ');
    const ms = Date.parse(`${d}T${t}:00`);
    if (!Number.isNaN(ms)) return ms;
  }
  return record.importedAt || 0;
}
