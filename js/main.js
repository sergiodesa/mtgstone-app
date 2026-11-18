// LifeSTONE companion: router and views
import * as store from './store.js';
import {
  analyse, winnerOf, seatName, stats, formatDate, formatDuration, formatClock, PLAYER_COLORS, ParseError,
} from './game.js';
import { lifeChartSVG } from './chart.js';
import { esc, icon, toast, confirmTap, askText, downloadText } from './ui.js';
import { startCamera, scanFile } from './scan.js';
import { shareGame } from './share.js';
import { demoData } from './demo.js';

export const APP_VERSION = '1.0';
const REPO = 'https://github.com/sergiodesa/mtgstone-app';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let stopCamera = null;
let lastRoute = '';

const modeLabel = (m) => (m === 1 ? '1 jogador' : `${m} jogadores`);
const pct = (x) => `${Math.round(x * 100)}%`;
const brand = (cls = '') => `<span class="brand ${cls}">Life<b>STONE</b></span>`;

/* ---------- Router ---------- */

function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#g=')) {
    // App link from a QR code (future firmware): import and open
    importAndOpen(location.href, true);
    return;
  }
  const [, name = '', arg] = hash.split('/');
  if (stopCamera && name !== 'scan') {
    stopCamera();
    stopCamera = null;
  }
  const keepScroll = hash === lastRoute;
  const y = window.scrollY;
  lastRoute = hash;

  document.body.classList.toggle('fullscreen', name === 'scan');
  tabbar.querySelectorAll('a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === (name === 'game' ? '' : name));
  });

  switch (name) {
    case 'game': renderGame(arg); break;
    case 'stats': renderStats(); break;
    case 'players': renderPlayers(); break;
    case 'more': renderMore(); break;
    case 'scan': renderScan(); break;
    default: renderGames();
  }
  window.scrollTo(0, keepScroll ? y : 0);
}

const rerender = () => {
  lastRoute = location.hash || '#/';
  route();
};

function importAndOpen(text, replace = false) {
  try {
    const { record, status } = store.importText(text);
    const msg = { new: 'Jogo guardado', updated: 'Jogo atualizado com o novo QR', same: 'Este jogo já estava guardado' }[status];
    toast(msg, status === 'same' ? '' : 'ok');
    navigator.vibrate?.(40);
    const target = `#/game/${record.id}`;
    if (replace) {
      history.replaceState(null, '', target);
      rerender();
    } else if (location.hash === target) {
      rerender();
    } else {
      location.hash = target;
    }
    return true;
  } catch (e) {
    toast(e instanceof ParseError ? e.message : 'Não foi possível ler este QR code', 'error');
    if (replace) history.replaceState(null, '', '#/');
    return false;
  }
}

/* ---------- Games list ---------- */

function gameCard(r, people) {
  const g = r.data;
  const w = winnerOf(r);
  const a = analyse(g);
  const chips = g.lives
    .map((life, p) => `
      <div class="chip ${w === p ? 'win' : ''} ${a.out[p] ? 'out' : ''}" style="--p:${PLAYER_COLORS[p]}">
        <span class="chip-name">${esc(seatName(r, p, people))}</span>
        <span class="chip-life num">${life}</span>
      </div>`)
    .join('');
  const winner = w !== null ? `${icon('trophy', 'sm accent')}<span>${esc(seatName(r, w, people))}</span>` : '<span class="dim">Sem vencedor</span>';
  return `
    <a class="card game-card" href="#/game/${r.id}">
      <div class="row between">
        <span class="gc-date">${esc(formatDate(g.date, r.importedAt))}</span>
        <span class="pill">${g.mode}P · ${g.startLife}</span>
      </div>
      <div class="chips n${g.mode}">${chips}</div>
      <div class="row between gc-foot">
        <span class="row gap-s">${g.mode > 1 ? winner : '<span class="dim">Jogo a solo</span>'}</span>
        <span class="row gap-s dim">${g.duration ? `${icon('clock', 'sm')}${formatDuration(g.duration)}` : ''}</span>
      </div>
    </a>`;
}

function renderGames() {
  const list = store.games();
  const people = store.people();
  if (!list.length) {
    view.innerHTML = `
      <header class="top">${brand()}</header>
      <section class="empty">
        <div class="logo-glow"><img src="icons/stone.png" alt=""></div>
        <h2>Ainda não há jogos</h2>
        <p>No fim de um jogo, abre o QR no LifeSTONE e lê-o com o telemóvel.</p>
        <ol class="steps">
          <li><span>Carrega em <span class="key">BOOT</span> para abrir o menu do jogo</span></li>
          <li><span>Toca em <b>History</b> e depois em <b>Export QR</b></span></li>
          <li><span>Aqui, toca em <b>Ler QR</b> e aponta para o ecrã</span></li>
        </ol>
        <a class="btn primary big" href="#/scan">${icon('scan')}Ler QR</a>
        <button class="btn ghost" id="demo">Ver com jogos de exemplo</button>
      </section>`;
    view.querySelector('#demo').addEventListener('click', loadDemo);
    return;
  }
  const s = stats(list, people);
  view.innerHTML = `
    <header class="top">
      ${brand()}
      <a class="btn primary small" href="#/scan">${icon('scan', 'sm')}Ler QR</a>
    </header>
    <div class="summary">
      <div><span class="num">${s.games}</span><small>jogos</small></div>
      <div><span class="num">${Math.round(s.totalTime / 3600)}</span><small>horas</small></div>
      <div><span class="num">${people.length}</span><small>jogadores</small></div>
    </div>
    <div class="list">${list.map((r) => gameCard(r, people)).join('')}</div>`;
}

function loadDemo() {
  const d = demoData();
  store.seedDemo(d.games, d.people);
  toast('Jogos de exemplo adicionados', 'ok');
  rerender();
}

/* ---------- Scanner ---------- */

function renderScan() {
  view.innerHTML = `
    <div class="scan">
      <video id="cam" playsinline muted></video>
      <div class="scan-shade"></div>
      <div class="scan-top">
        <a class="icon-btn" href="#/" aria-label="Fechar">${icon('close')}</a>
        <span>Ler QR do LifeSTONE</span>
        <span class="icon-btn hidden"></span>
      </div>
      <div class="viewfinder"><i></i><i></i><i></i><i></i></div>
      <div class="scan-bottom">
        <p id="scan-msg">Aponta para o QR no ecrã do aparelho</p>
        <p class="dim small"><span class="key">BOOT</span> → History → Export QR</p>
        <div class="row gap">
          <label class="btn">${icon('image', 'sm')}Escolher foto<input type="file" accept="image/*" id="photo" hidden></label>
          <button class="btn" id="paste">${icon('text', 'sm')}Colar texto</button>
        </div>
      </div>
    </div>`;

  const msg = view.querySelector('#scan-msg');
  const video = view.querySelector('#cam');
  const start = () => {
    startCamera(video, (text) => {
      stopCamera = null;
      if (!importAndOpen(text)) setTimeout(() => { if (location.hash === '#/scan') start(); }, 1500);
    })
      .then((stop) => {
        if (location.hash !== '#/scan') stop();
        else stopCamera = stop;
      })
      .catch((e) => {
        msg.textContent = e.name === 'NotAllowedError'
          ? 'Sem acesso à câmara. Autoriza nas definições ou usa "Escolher foto".'
          : e.message || 'Não foi possível abrir a câmara';
        msg.classList.add('warn');
      });
  };
  start();

  view.querySelector('#photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    msg.textContent = 'A ler a foto…';
    const text = await scanFile(file).catch(() => null);
    if (text) importAndOpen(text);
    else {
      msg.textContent = 'Não encontrei nenhum QR code nesta foto';
      msg.classList.add('warn');
    }
  });
  view.querySelector('#paste').addEventListener('click', async () => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* ask instead */ }
    if (!text) text = window.prompt('Cola aqui o texto do QR code') || '';
    if (text) importAndOpen(text);
  });
}

/* ---------- Game detail ---------- */

function renderGame(id) {
  const r = store.game(id);
  if (!r) {
    location.replace('#/');
    return;
  }
  const g = r.data;
  const a = analyse(g);
  const people = store.people();
  const w = winnerOf(r);
  const name = (p) => esc(seatName(r, p, people));
  const manual = r.winner !== null && r.winner !== undefined;

  const tiles = g.lives.map((life, p) => {
    const deck = r.seats[p]?.deck?.trim();
    const status = w === p ? `<span class="tag win">${icon('trophy', 'xs')}Vencedor</span>`
      : a.out[p] ? '<span class="tag out">Eliminado</span>' : '';
    return `
      <button class="tile ${w === p ? 'win' : ''}" data-seat="${p}" style="--p:${PLAYER_COLORS[p]}">
        <span class="tile-head"><span class="tile-name">${name(p)}</span>${status}</span>
        ${deck ? `<span class="tile-deck">${esc(deck)}</span>` : ''}
        <span class="tile-life num ${a.out[p] ? 'neg' : ''}">${life}</span>
      </button>`;
  }).join('');

  const seatRows = g.lives.map((_, p) => {
    const s = r.seats[p] || {};
    const options = people.map((x) => `<option value="${x.id}" ${x.id === s.person ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    return `
      <div class="seat" style="--p:${PLAYER_COLORS[p]}">
        <span class="seat-tag">P${p + 1}</span>
        <select class="field" data-person="${p}" aria-label="Jogador P${p + 1}">
          <option value="">Sem nome</option>${options}<option value="__new">+ Novo jogador…</option>
        </select>
        <input class="field" data-deck="${p}" list="decks-${p}" placeholder="Deck ou comandante" value="${esc(s.deck || '')}" autocomplete="off" enterkeyhint="done">
        <datalist id="decks-${p}"></datalist>
      </div>`;
  }).join('');

  let commander = '';
  if (a.hasCommander) {
    const head = g.lives.map((_, s) => `<th style="color:${PLAYER_COLORS[s]}">${name(s)}</th>`).join('');
    const rows = g.lives.map((_, t) => `
      <tr><th style="color:${PLAYER_COLORS[t]}">${name(t)}</th>${a.commander[t].map((v, s) =>
        `<td class="${s === t ? 'self' : v >= 21 ? 'lethal' : v ? '' : 'dim'}">${s === t ? '' : v}</td>`).join('')}</tr>`).join('');
    commander = `
      <h3 class="section">${icon('sword', 'sm')}Dano de comandante</h3>
      <div class="card"><table class="matrix"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>
        <p class="small dim top-gap">Cada linha é o dano que o jogador recebeu de cada comandante. ${21} ou mais elimina.</p></div>`;
  }

  const maxTaken = Math.max(1, ...a.taken);
  const bars = g.lives.map((_, p) => `
    <div class="bar-row">
      <span class="bar-name" style="color:${PLAYER_COLORS[p]}">${name(p)}</span>
      <span class="bar"><i style="width:${(a.taken[p] / maxTaken) * 100}%;background:${PLAYER_COLORS[p]}"></i></span>
      <span class="bar-val">−${a.taken[p]}${a.gained[p] ? ` <em class="pos">+${a.gained[p]}</em>` : ''}</span>
    </div>`).join('');

  const historyRows = g.entries.map((e) => {
    const d = e.to - e.from;
    return `
      <li>
        <span class="h-time">${a.timed ? formatClock(e.s) : ''}</span>
        <span class="dot" style="background:${PLAYER_COLORS[e.p]}"></span>
        <span class="h-name">${name(e.p)}</span>
        ${e.src !== null ? `<span class="h-src">${icon('sword', 'xs')}${name(e.src)}</span>` : '<span></span>'}
        <span class="h-life">${e.from} → <b>${e.to}</b></span>
        <span class="h-delta ${d < 0 ? 'neg' : 'pos'}">${d > 0 ? '+' : ''}${d}</span>
      </li>`;
  }).reverse().join('');

  view.innerHTML = `
    <header class="top">
      <a class="icon-btn" href="#/" aria-label="Voltar">${icon('back')}</a>
      <div class="top-title"><b>${esc(formatDate(g.date, r.importedAt))}</b></div>
      <button class="icon-btn" id="share" aria-label="Partilhar">${icon('share')}</button>
    </header>
    <div class="pills">
      <span class="pill">${modeLabel(g.mode)}</span>
      <span class="pill">Vida inicial ${g.startLife}</span>
      ${g.duration ? `<span class="pill">${icon('clock', 'xs')}${formatDuration(g.duration)}</span>` : ''}
      <span class="pill">${g.total} ${g.total === 1 ? 'alteração' : 'alterações'}</span>
    </div>

    <div class="tiles n${g.mode}">${tiles}</div>
    ${g.mode > 1 ? `<p class="hint">Toca num jogador para o marcar como vencedor${manual ? ' · <button class="link" id="auto">automático</button>' : ''}</p>` : ''}

    <h3 class="section">${icon('players', 'sm')}Quem jogou</h3>
    <div class="card seats">${seatRows}</div>

    ${g.entries.length ? `
      <h3 class="section">${icon('heart', 'sm')}Vida ao longo do jogo</h3>
      <div class="card chart-card">${lifeChartSVG(a, PLAYER_COLORS)}
        <div class="legend">${g.lives.map((_, p) => `<span><i style="background:${PLAYER_COLORS[p]}"></i>${name(p)}</span>`).join('')}</div>
      </div>
      ${commander}
      <h3 class="section">${icon('bolt', 'sm')}Dano recebido</h3>
      <div class="card">${bars}
        ${a.biggestHit ? `<p class="small dim top-gap">Maior golpe: <b class="neg">−${a.biggestHit.amount}</b> em ${name(a.biggestHit.player)}${a.biggestHit.source !== null ? ` (comandante de ${name(a.biggestHit.source)})` : ''}</p>` : ''}
      </div>
      <h3 class="section">${icon('games', 'sm')}Histórico</h3>
      ${g.truncated ? `<p class="hint">O QR só leva as últimas ${g.entries.length} de ${g.total} alterações.</p>` : ''}
      <ul class="card history">${historyRows}</ul>` : '<p class="hint">Sem alterações de vida registadas.</p>'}

    <h3 class="section">${icon('edit', 'sm')}Notas</h3>
    <textarea class="field notes" id="notes" rows="3" placeholder="Jogada da noite, cartas, local…">${esc(r.notes || '')}</textarea>

    <div class="actions">
      <button class="btn primary" id="share2">${icon('share', 'sm')}Partilhar imagem</button>
      <button class="btn danger" id="delete">${icon('trash', 'sm')}Apagar jogo</button>
    </div>`;

  // Winner
  view.querySelectorAll('.tile').forEach((t) => t.addEventListener('click', () => {
    if (g.mode === 1) return;
    const seat = Number(t.dataset.seat);
    store.updateGame(r.id, { winner: w === seat ? -1 : seat });
    rerender();
  }));
  view.querySelector('#auto')?.addEventListener('click', () => {
    store.updateGame(r.id, { winner: null });
    rerender();
  });

  // Seats
  view.querySelectorAll('[data-person]').forEach((sel) => sel.addEventListener('change', async () => {
    const seat = Number(sel.dataset.person);
    let value = sel.value || null;
    if (value === '__new') {
      const n = await askText('Novo jogador', { placeholder: 'Nome' });
      const p = n && store.addPerson(n);
      if (!p) {
        sel.value = r.seats[seat]?.person || '';
        return;
      }
      value = p.id;
    }
    store.setSeat(r.id, seat, { person: value });
    rerender();
  }));
  view.querySelectorAll('[data-deck]').forEach((input) => {
    const seat = Number(input.dataset.deck);
    const list = view.querySelector(`#decks-${seat}`);
    const fill = (names) => {
      list.innerHTML = [...new Set(names)].slice(0, 12).map((d) => `<option value="${esc(d)}">`).join('');
    };
    input.addEventListener('focus', () => fill(store.decksOf(r.seats[seat]?.person).concat(store.decksOf(null))));
    input.addEventListener('input', debounce(async () => {
      const q = input.value.trim();
      const own = store.decksOf(r.seats[seat]?.person).filter((d) => d.toLowerCase().includes(q.toLowerCase()));
      fill(own.concat(q.length >= 3 ? await scryfall(q) : []));
    }, 250));
    input.addEventListener('change', () => {
      store.setSeat(r.id, seat, { deck: input.value.trim().slice(0, 60) });
      rerender();
    });
  });

  view.querySelector('#notes').addEventListener('change', (e) => store.updateGame(r.id, { notes: e.target.value.slice(0, 1000) }));

  const share = async () => {
    const result = await shareGame(store.game(r.id), store.people()).catch(() => 'error');
    if (result === 'downloaded') toast('Imagem guardada', 'ok');
    else if (result === 'error') toast('Não foi possível criar a imagem', 'error');
  };
  view.querySelector('#share').addEventListener('click', share);
  view.querySelector('#share2').addEventListener('click', share);
  confirmTap(view.querySelector('#delete'), () => {
    store.deleteGame(r.id);
    toast('Jogo apagado');
    location.hash = '#/';
  });
}

function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Card names for the deck field (works offline too: just returns nothing)
const scryCache = new Map();
async function scryfall(q) {
  const k = q.toLowerCase();
  if (scryCache.has(k)) return scryCache.get(k);
  try {
    const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
    const names = res.ok ? (await res.json()).data || [] : [];
    scryCache.set(k, names);
    return names;
  } catch {
    return [];
  }
}

/* ---------- Statistics ---------- */

function renderStats() {
  const list = store.games();
  const people = store.people();
  if (!list.length) {
    view.innerHTML = `
      <header class="top"><h1>Estatísticas</h1></header>
      <section class="empty"><div class="logo-glow">${icon('stats', 'xl accent')}</div>
        <h2>Sem estatísticas ainda</h2><p>Lê o QR de alguns jogos e dá nomes aos jogadores para veres quem ganha mais.</p>
        <a class="btn primary big" href="#/scan">${icon('scan')}Ler QR</a></section>`;
    return;
  }
  const s = stats(list, people);
  const board = (rows, label) => rows.map((x, i) => `
    <div class="rank">
      <span class="rank-n ${i === 0 ? 'first' : ''}">${i + 1}</span>
      <span class="rank-main"><b>${esc(label(x))}</b>
        <span class="bar"><i style="width:${(x.played ? x.wins / x.played : 0) * 100}%"></i></span></span>
      <span class="rank-val"><b class="num">${x.played ? pct(x.wins / x.played) : '—'}</b><small>${x.wins}/${x.played}</small></span>
    </div>`).join('');

  const modes = [1, 2, 4].filter((m) => s.modes[m]);
  view.innerHTML = `
    <header class="top"><h1>Estatísticas</h1></header>
    <div class="stat-grid">
      <div class="card stat"><span class="num">${s.games}</span><small>jogos</small></div>
      <div class="card stat"><span class="num">${formatDuration(s.totalTime).replace(' min', 'm')}</span><small>a jogar</small></div>
      <div class="card stat"><span class="num">${formatDuration(s.avgTime).replace(' min', 'm')}</span><small>por jogo</small></div>
    </div>

    <h3 class="section">${icon('trophy', 'sm')}Jogadores</h3>
    <div class="card">${s.players.length ? board(s.players, (x) => x.person.name)
      : '<p class="dim small">Dá nomes aos jogadores nos jogos para aparecer aqui o ranking.</p>'}</div>

    ${s.decks.length ? `<h3 class="section">${icon('games', 'sm')}Decks</h3><div class="card">${board(s.decks.slice(0, 10), (x) => x.name)}</div>` : ''}

    <h3 class="section">${icon('players', 'sm')}Formatos</h3>
    <div class="card">
      <div class="split">${modes.map((m) => `<i style="flex:${s.modes[m]}" class="m${m}"></i>`).join('')}</div>
      <div class="legend">${modes.map((m) => `<span><i class="m${m}"></i>${modeLabel(m)} · ${s.modes[m]}</span>`).join('')}</div>
    </div>

    <h3 class="section">${icon('bolt', 'sm')}Recordes</h3>
    <div class="card links">
      ${s.longest ? `<a href="#/game/${s.longest.id}" class="link-row"><span>Jogo mais longo</span><b>${formatDuration(s.longest.data.duration)}</b>${icon('chevron', 'sm dim')}</a>` : ''}
      ${s.biggestHit ? `<a href="#/game/${s.biggestHit.record.id}" class="link-row"><span>Maior golpe</span><b class="neg">−${s.biggestHit.amount}</b>${icon('chevron', 'sm dim')}</a>` : ''}
    </div>`;
}

/* ---------- Players ---------- */

function renderPlayers() {
  const people = store.people();
  const s = stats(store.games(), people);
  const info = new Map(s.players.map((x) => [x.person.id, x]));
  const rows = people.map((p, i) => {
    const x = info.get(p.id);
    const decks = store.decksOf(p.id);
    return `
      <div class="person">
        <span class="avatar" style="--p:${PLAYER_COLORS[i % 4]}">${esc(p.name.slice(0, 1).toUpperCase())}</span>
        <span class="person-main"><b>${esc(p.name)}</b>
          <small class="dim">${x ? `${x.played} ${x.played === 1 ? 'jogo' : 'jogos'} · ${x.wins} ${x.wins === 1 ? 'vitória' : 'vitórias'}` : 'Ainda sem jogos'}${decks[0] ? ` · ${esc(decks[0])}` : ''}</small></span>
        <button class="icon-btn" data-rename="${p.id}" aria-label="Mudar o nome">${icon('edit', 'sm')}</button>
        <button class="icon-btn" data-remove="${p.id}" aria-label="Apagar">${icon('trash', 'sm')}</button>
      </div>`;
  }).join('');
  view.innerHTML = `
    <header class="top"><h1>Jogadores</h1><button class="btn primary small" id="add">${icon('plus', 'sm')}Novo</button></header>
    ${people.length ? `<div class="card people">${rows}</div>` : `
      <section class="empty"><div class="logo-glow">${icon('players', 'xl accent')}</div>
        <h2>O teu grupo de jogo</h2><p>Regista as tuas partidas de grupo</p></section>`}`;

  view.querySelector('#add').addEventListener('click', async () => {
    const n = await askText('Novo jogador', { placeholder: 'Nome' });
    if (n && store.addPerson(n)) rerender();
  });
  view.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', async () => {
    const p = store.person(b.dataset.rename);
    const n = await askText('Mudar o nome', { value: p.name });
    if (n) {
      store.renamePerson(p.id, n);
      rerender();
    }
  }));
  view.querySelectorAll('[data-remove]').forEach((b) => {
    confirmTap(b, () => {
      store.deletePerson(b.dataset.remove);
      rerender();
    }, 'Apagar?');
  });
}

/* ---------- More ---------- */

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

function renderMore() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const install = standalone ? '' : `
    <h3 class="section">${icon('phone', 'sm')}Instalar</h3>
    <div class="card">
      ${ios ? '<p>No Safari, toca em <b>Partilhar</b> e depois em <b>Adicionar ao ecrã principal</b>. A app passa a abrir em ecrã inteiro e funciona sem internet.</p>'
        : `<p>Instala a app para a abrir em ecrã inteiro e usar sem internet.</p>
           <button class="btn primary top-gap" id="install">${icon('download', 'sm')}Instalar app</button>`}
    </div>`;

  view.innerHTML = `
    <header class="top"><h1>Mais</h1></header>
    ${install}
    <h3 class="section">${icon('download', 'sm')}Cópia de segurança</h3>
    <div class="card">
      <p class="dim small">Os jogos ficam só neste telemóvel. Exporta uma cópia para não os perderes ou para os passares para outro telemóvel.</p>
      <div class="row gap top-gap">
        <button class="btn" id="export">${icon('download', 'sm')}Exportar</button>
        <label class="btn">${icon('upload', 'sm')}Importar<input type="file" accept="application/json,.json" id="import" hidden></label>
      </div>
    </div>

    <h3 class="section">${icon('games', 'sm')}Dados</h3>
    <div class="card">
      <div class="row gap">
        <button class="btn" id="demo">Exemplos</button>
        <button class="btn danger" id="clear">${icon('trash', 'sm')}Apagar tudo</button>
      </div>
      <p class="small dim top-gap">"Exemplos" mostra 6 jogos inventados para experimentar a app.</p>
      <div hidden>
      </div>
    </div>

    <section class="about card">
      <div class="logo-glow small"><img src="icons/stone.png" alt=""></div>
      ${brand('big')}
      <p class="dim">Companion app ${APP_VERSION}</p>
      <p>O diário de jogos do teu contador de vidas para Magic: The Gathering</p>
      <p>Made by <span class="accent">Sergio de Sa</span></p>
      <a class="btn ghost" href="${REPO}" target="_blank" rel="noopener">${icon('github', 'sm')}Código no GitHub</a>
      <p class="credits">Montserrat e Boldonse (SIL OFL) · jsQR (Apache 2.0) · Nomes de cartas por Scryfall</p>
    </section>`;

  view.querySelector('#install')?.addEventListener('click', async () => {
    if (!installPrompt) {
      toast('Usa o menu do browser → "Instalar app" ou "Adicionar ao ecrã principal"');
      return;
    }
    installPrompt.prompt();
    installPrompt = null;
  });
  view.querySelector('#export').addEventListener('click', () => {
    downloadText(store.exportBackup(), `lifestone-backup-${new Date().toISOString().slice(0, 10)}.json`);
  });
  view.querySelector('#import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const n = store.importBackup(await f.text());
      toast(`${n} ${n === 1 ? 'jogo importado' : 'jogos importados'}`, 'ok');
    } catch (err) {
      toast(err.message || 'Ficheiro inválido', 'error');
    }
    e.target.value = '';
  });
  view.querySelector('#demo').addEventListener('click', () => {
    if (store.games().length && !confirm('Isto substitui os teus jogos pelos de exemplo. Continuar?')) return;
    loadDemo();
  });
  confirmTap(view.querySelector('#clear'), () => {
    store.clearAll();
    toast('Tudo apagado');
    rerender();
  });
}

/* ---------- Start ---------- */

if (new URLSearchParams(location.search).has('demo') && !store.games().length) {
  const d = demoData();
  store.seedDemo(d.games, d.people);
}
store.persist();
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
