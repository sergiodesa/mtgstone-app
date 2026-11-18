// Games and players, kept in localStorage (a few KB per game).
import { parseExport, gameKey, sortTime } from './game.js';

const KEY = 'lifestone.v1';
const BACKUP_APP = 'lifestone-companion';

let state = load();
const listeners = new Set();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.games) && Array.isArray(s.people)) return s;
  } catch { /* fall through */ }
  return { games: [], people: [] };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.error('save failed', e);
  }
  listeners.forEach((fn) => fn());
}

export const onChange = (fn) => listeners.add(fn);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const games = () => state.games.slice().sort((a, b) => sortTime(b) - sortTime(a));
export const game = (id) => state.games.find((g) => g.id === id);
export const people = () => state.people.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt'));
export const person = (id) => state.people.find((p) => p.id === id);

// Returns { record, status: 'new' | 'updated' | 'same' }
export function importText(text) {
  const data = parseExport(text);
  const key = gameKey(data);
  const old = state.games.find((g) => g.key === key);
  if (old) {
    if (data.total < old.data.total) return { record: old, status: 'same' };
    const same = JSON.stringify(old.data) === JSON.stringify(data);
    old.data = data;
    if (old.seats.length !== data.mode) old.seats = fitSeats(old.seats, data.mode);
    if (!same) save();
    return { record: old, status: same ? 'same' : 'updated' };
  }
  const record = {
    id: uid(),
    key,
    importedAt: Date.now(),
    data,
    seats: fitSeats(lastSeats(data.mode), data.mode),
    winner: null,
    notes: '',
  };
  state.games.push(record);
  save();
  return { record, status: 'new' };
}

// New games start with the people (not decks) of the last game of the same size
function lastSeats(mode) {
  const prev = games().find((g) => g.data.mode === mode);
  return prev ? prev.seats.map((s) => ({ person: s.person || null, deck: '' })) : [];
}

function fitSeats(seats, n) {
  return Array.from({ length: n }, (_, i) => seats[i] || { person: null, deck: '' });
}

export function updateGame(id, patch) {
  const g = game(id);
  if (!g) return;
  Object.assign(g, patch);
  save();
}

export function setSeat(id, seat, patch) {
  const g = game(id);
  if (!g) return;
  g.seats[seat] = { ...g.seats[seat], ...patch };
  save();
}

export function deleteGame(id) {
  state.games = state.games.filter((g) => g.id !== id);
  save();
}

export function addPerson(name) {
  const clean = name.trim().slice(0, 32);
  if (!clean) return null;
  const existing = state.people.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing;
  const p = { id: uid(), name: clean };
  state.people.push(p);
  save();
  return p;
}

export function renamePerson(id, name) {
  const p = person(id);
  const clean = name.trim().slice(0, 32);
  if (!p || !clean) return;
  p.name = clean;
  save();
}

export function deletePerson(id) {
  state.people = state.people.filter((p) => p.id !== id);
  for (const g of state.games) for (const s of g.seats) if (s.person === id) s.person = null;
  save();
}

// Decks this person used before, most frequent first
export function decksOf(personId) {
  const count = new Map();
  for (const g of state.games) {
    for (const s of g.seats) {
      const d = s.deck?.trim();
      if (d && (!personId || s.person === personId)) count.set(d, (count.get(d) || 0) + 1);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
}

export function exportBackup() {
  return JSON.stringify({ app: BACKUP_APP, v: 1, exportedAt: new Date().toISOString(), ...state }, null, 1);
}

// Merges a backup: unknown games and people are added, known ones kept.
export function importBackup(text) {
  const b = JSON.parse(text);
  if (b?.app !== BACKUP_APP || !Array.isArray(b.games) || !Array.isArray(b.people)) {
    throw new Error('Este ficheiro não é uma cópia de segurança do LifeSTONE');
  }
  let added = 0;
  for (const p of b.people) {
    if (p?.id && p.name && !person(p.id)) state.people.push({ id: p.id, name: String(p.name).slice(0, 32) });
  }
  for (const g of b.games) {
    if (!g?.id || !g.data || state.games.some((x) => x.id === g.id || x.key === g.key)) continue;
    state.games.push(g);
    added++;
  }
  save();
  return added;
}

export function clearAll() {
  state = { games: [], people: [] };
  save();
}

export function seedDemo(records, ppl) {
  state = { games: records, people: ppl };
  save();
}

// Ask the browser not to evict our data under storage pressure
export function persist() {
  navigator.storage?.persist?.().catch(() => {});
}
