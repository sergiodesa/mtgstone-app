// Small UI helpers shared by the views
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const P = {
  games: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  players: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4H9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sword: '<path d="M14.5 4H20v5.5L10 19.5 4.5 14z"/><path d="M7 17l-3 3M5 13l6 6"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-1-2.5c3 0 6-1.5 6-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6.2 0C6.6 2.3 5.6 2.6 5.6 2.6a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.2 9c0 4.5 3 6 6 6a3 3 0 0 0-1 2.5V21"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};

export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

let toastTimer = 0;
export function toast(message, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = `toast show ${kind}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// Same pattern as the device: a destructive button needs a second tap within 3 s
export function confirmTap(button, onConfirm, prompt = 'Toca outra vez para confirmar') {
  let armed = false;
  let timer = 0;
  const label = button.innerHTML;
  button.addEventListener('click', () => {
    if (armed) {
      clearTimeout(timer);
      onConfirm();
      return;
    }
    armed = true;
    button.classList.add('armed');
    button.textContent = prompt;
    timer = setTimeout(() => {
      armed = false;
      button.classList.remove('armed');
      button.innerHTML = label;
    }, 3000);
  });
}

// Bottom sheet with one text field. Resolves to the text, or null if cancelled.
export function askText(title, { value = '', placeholder = '', ok = 'Guardar' } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `
      <form class="sheet" autocomplete="off">
        <h3>${esc(title)}</h3>
        <input class="field" name="v" maxlength="32" placeholder="${esc(placeholder)}" value="${esc(value)}" enterkeyhint="done">
        <div class="row gap">
          <button type="button" class="btn" data-cancel>Cancelar</button>
          <button class="btn primary">${esc(ok)}</button>
        </div>
      </form>`;
    const done = (v) => {
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 200);
      resolve(v);
    };
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(null); });
    wrap.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    wrap.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = wrap.querySelector('input').value.trim();
      done(v || null);
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => {
      wrap.classList.add('show');
      wrap.querySelector('input').focus();
    });
  });
}

export function downloadText(text, name, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
