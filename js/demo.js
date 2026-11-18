// Example games (Mais → "Adicionar jogos de exemplo", or ?demo in the URL)
import { parseExport, gameKey } from './game.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function simulate(seed, mode, startLife, date, minutes, winner) {
  const r = rng(seed);
  const life = new Array(mode).fill(startLife);
  const cmd = Array.from({ length: mode }, () => new Array(mode).fill(0));
  const h = [];
  let t = 30;
  const end = minutes * 60;
  const alive = () => life.map((l, p) => (l > 0 && !cmd[p].some((c) => c >= 21) ? p : -1)).filter((p) => p >= 0);
  while (t < end && alive().length > 1) {
    t += 20 + Math.floor(r() * 70);
    const targets = alive().filter((p) => p !== winner || r() < 0.35);
    const p = targets[Math.floor(r() * targets.length)] ?? alive()[0];
    const from = life[p];
    if (r() < 0.14) {
      life[p] += 1 + Math.floor(r() * 4);
      h.push([p, from, life[p], Math.min(t, end)]);
      continue;
    }
    const hit = 1 + Math.floor(r() * (startLife >= 40 ? 9 : 5));
    const src = mode === 4 && r() < 0.35 ? alive().filter((x) => x !== p)[0] : null;
    life[p] -= hit;
    if (src !== null && src !== undefined) {
      cmd[p][src] += hit;
      h.push([p, from, life[p], Math.min(t, end), src]);
    } else {
      h.push([p, from, life[p], Math.min(t, end)]);
    }
  }
  // Finish everyone except the winner
  for (const p of alive()) {
    if (p === winner || life[p] <= 0) continue;
    const from = life[p];
    life[p] = 0;
    h.push([p, from, 0, Math.min(t += 40, end)]);
  }
  return { v: 2, m: mode, s: startLife, d: date, t: Math.min(t, end), l: life, n: h.length, h };
}

export function demoData() {
  const people = [
    { id: 'demo-ana', name: 'Ana' },
    { id: 'demo-rui', name: 'Rui' },
    { id: 'demo-sergio', name: 'Sérgio' },
    { id: 'demo-marta', name: 'Marta' },
  ];
  const [A, R, S, M] = people.map((p) => p.id);
  const plan = [
    [11, 4, 40, '2026-11-15 21:10', 64, 2, [[S, 'Atraxa, Praetors\' Voice'], [A, 'Krenko, Mob Boss'], [R, 'Edgar Markov'], [M, 'Meren of Clan Nel Toth']]],
    [12, 2, 20, '2026-11-14 18:40', 22, 0, [[A, 'Mono-Red Aggro'], [R, 'Azorius Control']]],
    [13, 4, 40, '2026-11-08 20:30', 81, 1, [[S, 'Atraxa, Praetors\' Voice'], [A, 'Krenko, Mob Boss'], [R, 'Edgar Markov'], [M, 'Meren of Clan Nel Toth']]],
    [14, 2, 20, '2026-11-07 19:05', 31, 1, [[S, 'Golgari Midrange'], [M, 'Izzet Tempo']]],
    [15, 4, 40, '2026-11-01 21:00', 72, 0, [[S, 'Atraxa, Praetors\' Voice'], [A, 'Krenko, Mob Boss'], [R, 'Edgar Markov'], [M, 'Meren of Clan Nel Toth']]],
    [16, 2, 20, '2026-10-30 18:20', 18, 0, [[R, 'Azorius Control'], [S, 'Golgari Midrange']]],
  ];
  const games = plan.map(([seed, mode, life, date, min, win, seats], i) => {
    const data = parseExport(JSON.stringify(simulate(seed, mode, life, date, min, win)));
    return {
      id: `demo-${i}`,
      key: gameKey(data),
      importedAt: Date.parse(date.replace(' ', 'T')),
      data,
      seats: seats.map(([person, deck]) => ({ person, deck })),
      winner: null,
      notes: '',
    };
  });
  return { games, people };
}
