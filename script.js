(() => {
  'use strict';

  /* ---------------- storage helpers ---------------- */
  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  const state = {
    notes: load('sw_notes', ''),
    events: load('sw_events', []),
    memories: load('sw_memories', []),
    links: load('sw_links', []),
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const saveIndicator = document.getElementById('saveIndicator');
  let saveTimer = null;
  function flashSaved() {
    saveIndicator.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveIndicator.classList.remove('show'), 1200);
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  /* ---------------- tabs ---------------- */
  const tabsEl = document.getElementById('tabs');
  const tabButtons = Array.from(document.querySelectorAll('.tab'));
  const tabGlow = document.getElementById('tabGlow');
  const views = Array.from(document.querySelectorAll('.view'));

  function positionGlow(tab) {
    const tRect = tab.getBoundingClientRect();
    const pRect = tabsEl.getBoundingClientRect();
    tabGlow.style.left = (tRect.left - pRect.left + 10) + 'px';
    tabGlow.style.width = (tRect.width - 20) + 'px';
  }

  function activateTab(name, { skipHash } = {}) {
    tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === name));
    views.forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    const active = tabButtons.find(b => b.dataset.view === name);
    if (active) positionGlow(active);
    if (!skipHash) history.replaceState(null, '', '#' + name);
  }

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.view));
  });

  window.addEventListener('resize', () => {
    const active = tabButtons.find(b => b.classList.contains('active'));
    if (active) positionGlow(active);
  });

  const validViews = ['notes', 'events', 'memories', 'links'];
  const initialView = (location.hash || '').replace('#', '');
  activateTab(validViews.includes(initialView) ? initialView : 'notes', { skipHash: true });
  requestAnimationFrame(() => {
    const active = tabButtons.find(b => b.classList.contains('active'));
    if (active) positionGlow(active);
  });

  window.addEventListener('hashchange', () => {
    const v = location.hash.replace('#', '');
    if (validViews.includes(v)) activateTab(v, { skipHash: true });
  });

  /* ---------------- notes ---------------- */
  const notesArea = document.getElementById('notesArea');
  notesArea.value = state.notes;
  let notesTimer = null;
  notesArea.addEventListener('input', () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      state.notes = notesArea.value;
      save('sw_notes', state.notes);
      flashSaved();
    }, 400);
  });

  /* ---------------- generic composer (events / memories) ---------------- */
  function wireComposer(kind, storeKey) {
    const openBtn = document.querySelector(`[data-open="${kind}"]`);
    const composer = document.getElementById(`composer-${kind}`);
    const cancelBtn = document.querySelector(`[data-cancel="${kind}"]`);
    const saveBtn = document.querySelector(`[data-save="${kind}"]`);
    const titleInput = document.getElementById(`${kind}-title`);
    const descInput = document.getElementById(`${kind}-desc`);

    function closeComposer() {
      composer.classList.remove('open');
      openBtn.classList.remove('is-open');
      titleInput.value = '';
      descInput.value = '';
    }

    openBtn.addEventListener('click', () => {
      const isOpen = composer.classList.toggle('open');
      openBtn.classList.toggle('is-open', isOpen);
      if (isOpen) titleInput.focus();
      else { titleInput.value = ''; descInput.value = ''; }
    });

    cancelBtn.addEventListener('click', closeComposer);

    function commit() {
      const title = titleInput.value.trim();
      const desc = descInput.value.trim();
      if (!title) { titleInput.focus(); return; }
      state[storeKey].unshift({ id: uid(), title, desc, createdAt: Date.now() });
      save('sw_' + storeKey, state[storeKey]);
      flashSaved();
      closeComposer();
      renderList(kind, storeKey);
    }

    saveBtn.addEventListener('click', commit);
    [titleInput, descInput].forEach(el => {
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
        if (e.key === 'Escape') closeComposer();
      });
    });
  }

  function renderList(kind, storeKey) {
    const listEl = document.getElementById(`list-${kind}`);
    const emptyEl = document.getElementById(`empty-${kind}`);
    const items = state[storeKey];
    listEl.innerHTML = '';
    emptyEl.classList.toggle('show', items.length === 0);

    items.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.animationDelay = Math.min(i * 40, 300) + 'ms';

      const top = document.createElement('div');
      top.className = 'card-top';
      const h3 = document.createElement('h3');
      h3.textContent = item.title;
      const delBtn = document.createElement('button');
      delBtn.className = 'card-delete';
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      delBtn.addEventListener('click', () => {
        card.classList.add('removing');
        setTimeout(() => {
          state[storeKey] = state[storeKey].filter(x => x.id !== item.id);
          save('sw_' + storeKey, state[storeKey]);
          renderList(kind, storeKey);
        }, 260);
      });
      top.append(h3, delBtn);

      const p = document.createElement('p');
      p.textContent = item.desc || '';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = fmtDate(item.createdAt);

      card.append(top);
      if (item.desc) card.append(p);
      card.append(meta);
      listEl.append(card);
    });
  }

  wireComposer('events', 'events');
  wireComposer('memories', 'memories');
  renderList('events', 'events');
  renderList('memories', 'memories');

  /* ---------------- links ---------------- */
  function normalizeUrl(raw) {
    let v = raw.trim();
    if (!v) return null;
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
      const u = new URL(v);
      if (!u.hostname.includes('.')) return null;
      return u.href;
    } catch {
      return null;
    }
  }

  function renderLinks() {
    const listEl = document.getElementById('list-links');
    const emptyEl = document.getElementById('empty-links');
    const items = state.links;
    listEl.innerHTML = '';
    emptyEl.classList.toggle('show', items.length === 0);

    items.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'card link-card';
      card.style.animationDelay = Math.min(i * 40, 300) + 'ms';

      const hit = document.createElement('a');
      hit.className = 'link-open-hit';
      hit.href = item.url;
      hit.target = '_blank';
      hit.rel = 'noopener noreferrer';
      hit.setAttribute('aria-label', item.domain);

      const thumb = document.createElement('div');
      thumb.className = 'link-thumb';
      const shimmer = document.createElement('div');
      shimmer.className = 'shimmer';
      const fallback = document.createElement('div');
      fallback.className = 'link-fallback';
      fallback.textContent = (item.domain || '?').charAt(0).toUpperCase();
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.src = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(item.url)}?w=500&h=310`;
      let retries = 0;
      img.addEventListener('load', () => {
        // mshots returns a tiny placeholder while it generates the real shot; retry a few times
        if (img.naturalWidth <= 1 && retries < 4) {
          retries++;
          setTimeout(() => { img.src = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(item.url)}?w=500&h=310&r=${retries}`; }, 1500);
          return;
        }
        img.classList.add('loaded');
        shimmer.remove();
        fallback.remove();
      });
      img.addEventListener('error', () => { shimmer.remove(); img.remove(); });
      thumb.append(shimmer, fallback, img);

      const delBtn = document.createElement('button');
      delBtn.className = 'card-delete';
      delBtn.style.zIndex = 2;
      delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      delBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        card.classList.add('removing');
        setTimeout(() => {
          state.links = state.links.filter(x => x.id !== item.id);
          save('sw_links', state.links);
          renderLinks();
        }, 260);
      });

      const body = document.createElement('div');
      body.className = 'link-body';
      const favicon = document.createElement('img');
      favicon.className = 'link-favicon';
      favicon.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(item.domain)}`;
      favicon.alt = '';
      const info = document.createElement('div');
      info.className = 'link-info';
      const titleEl = document.createElement('div');
      titleEl.className = 'link-title';
      titleEl.textContent = item.domain;
      const domainEl = document.createElement('div');
      domainEl.className = 'link-domain';
      domainEl.textContent = item.url.replace(/^https?:\/\//, '');
      info.append(titleEl, domainEl);
      body.append(favicon, info);

      card.append(hit, thumb, delBtn, body);
      listEl.append(card);
    });
  }

  const linkForm = document.getElementById('linkForm');
  const linkInput = document.getElementById('linkInput');
  linkForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const href = normalizeUrl(linkInput.value);
    if (!href) {
      linkInput.focus();
      linkInput.style.borderColor = 'rgba(241,101,101,0.6)';
      setTimeout(() => { linkInput.style.borderColor = ''; }, 900);
      return;
    }
    const domain = new URL(href).hostname.replace(/^www\./, '');
    state.links.unshift({ id: uid(), url: href, domain, createdAt: Date.now() });
    save('sw_links', state.links);
    flashSaved();
    linkInput.value = '';
    renderLinks();
  });

  renderLinks();
})();
