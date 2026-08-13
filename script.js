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
  // returns false (instead of throwing) when storage is full, so callers can roll back in-memory state
  const save = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  const state = {
    notes: load('sw_notes', ''),
    events: load('sw_events', []),
    memories: load('sw_memories', []),
    wishlist: load('sw_wishlist', []),
    links: load('sw_links', []),
    decor: load('sw_decor', []),
    decorSize: load('sw_decorSize', 'medium'),
    linksSize: load('sw_linksSize', 'medium'),
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const saveIndicator = document.getElementById('saveIndicator');
  let saveTimer = null;
  function flashSaved(text = 'Saved', isError = false) {
    saveIndicator.textContent = text;
    saveIndicator.classList.toggle('error', isError);
    saveIndicator.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveIndicator.classList.remove('show'), isError ? 2600 : 1200);
  }
  const flashError = (text) => flashSaved(text, true);

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

  const validViews = ['notes', 'events', 'memories', 'wishlist', 'links', 'decor'];
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

  /* ---------------- shared url helper ---------------- */
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

  /* ---------------- generic composer (events / memories / wishlist) ---------------- */
  function wireComposer(kind, storeKey, { hasLink = false, render } = {}) {
    const openBtn = document.querySelector(`[data-open="${kind}"]`);
    const composer = document.getElementById(`composer-${kind}`);
    const cancelBtn = document.querySelector(`[data-cancel="${kind}"]`);
    const saveBtn = document.querySelector(`[data-save="${kind}"]`);
    const titleInput = document.getElementById(`${kind}-title`);
    const descInput = document.getElementById(`${kind}-desc`);
    const linkInput = hasLink ? document.getElementById(`${kind}-link`) : null;
    const doRender = render || (() => renderList(kind, storeKey));

    function closeComposer() {
      composer.classList.remove('open');
      openBtn.classList.remove('is-open');
      titleInput.value = '';
      descInput.value = '';
      if (linkInput) { linkInput.value = ''; linkInput.style.borderColor = ''; }
    }

    openBtn.addEventListener('click', () => {
      const isOpen = composer.classList.toggle('open');
      openBtn.classList.toggle('is-open', isOpen);
      if (isOpen) titleInput.focus();
      else closeComposer();
    });

    cancelBtn.addEventListener('click', closeComposer);

    function commit() {
      const title = titleInput.value.trim();
      const desc = descInput.value.trim();
      if (!title) { titleInput.focus(); return; }

      let link = null;
      if (linkInput && linkInput.value.trim()) {
        link = normalizeUrl(linkInput.value);
        if (!link) {
          linkInput.style.borderColor = 'rgba(226,114,91,0.6)';
          linkInput.focus();
          setTimeout(() => { linkInput.style.borderColor = ''; }, 900);
          return;
        }
      }

      state[storeKey].unshift({ id: uid(), title, desc, link, createdAt: Date.now() });
      if (!save('sw_' + storeKey, state[storeKey])) {
        state[storeKey].shift();
        flashError('Storage full — remove something first');
        return;
      }
      flashSaved();
      closeComposer();
      doRender();
    }

    saveBtn.addEventListener('click', commit);
    [titleInput, descInput, linkInput].filter(Boolean).forEach(el => {
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit();
        if (e.key === 'Escape') closeComposer();
      });
    });
  }

  // builds the shared title/link/desc/meta card used by Events, Wishlist and Memories
  function buildEntryCard(item, extraClass, onDelete) {
    const card = document.createElement('div');
    card.className = extraClass ? `card ${extraClass}` : 'card';

    const top = document.createElement('div');
    top.className = 'card-top';
    const h3 = document.createElement('h3');
    h3.textContent = item.title;
    const delBtn = document.createElement('button');
    delBtn.className = 'card-delete';
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    delBtn.addEventListener('click', () => {
      card.classList.add('removing');
      setTimeout(onDelete, 260);
    });
    top.append(h3, delBtn);

    if (item.link) {
      const openLink = document.createElement('a');
      openLink.className = 'card-link';
      openLink.href = item.link;
      openLink.target = '_blank';
      openLink.rel = 'noopener noreferrer';
      openLink.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M7 17 17 7M9 7h8v8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        new URL(item.link).hostname.replace(/^www\./, '');
      card.append(top, openLink);
    } else {
      card.append(top);
    }

    const p = document.createElement('p');
    p.textContent = item.desc || '';
    if (item.desc) card.append(p);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = fmtDate(item.createdAt);
    card.append(meta);
    return card;
  }

  function renderList(kind, storeKey) {
    const listEl = document.getElementById(`list-${kind}`);
    const emptyEl = document.getElementById(`empty-${kind}`);
    const items = state[storeKey];
    listEl.innerHTML = '';
    emptyEl.classList.toggle('show', items.length === 0);

    items.forEach((item, i) => {
      const card = buildEntryCard(item, '', () => {
        state[storeKey] = state[storeKey].filter(x => x.id !== item.id);
        save('sw_' + storeKey, state[storeKey]);
        renderList(kind, storeKey);
      });
      card.style.animationDelay = Math.min(i * 40, 300) + 'ms';
      listEl.append(card);
    });
  }

  // memories get a fun scrapbook timeline instead of a flat grid, grouped by month and sorted newest-first
  function renderMemories() {
    const listEl = document.getElementById('list-memories');
    const emptyEl = document.getElementById('empty-memories');
    const items = [...state.memories].sort((a, b) => b.createdAt - a.createdAt);
    listEl.innerHTML = '';
    emptyEl.classList.toggle('show', items.length === 0);

    const groups = new Map();
    items.forEach(item => {
      const label = new Date(item.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    });

    let i = 0;
    groups.forEach((groupItems, label) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'timeline-group';

      const marker = document.createElement('div');
      marker.className = 'timeline-marker';

      const labelEl = document.createElement('div');
      labelEl.className = 'timeline-group-label';
      labelEl.textContent = label;

      const entriesEl = document.createElement('div');
      entriesEl.className = 'timeline-entries';

      groupItems.forEach(item => {
        const tilt = (i % 2 === 0 ? -1 : 1) * (1.1 + (i % 3) * 0.4);
        const wrap = document.createElement('div');
        wrap.className = 'tilt-wrap';
        wrap.style.setProperty('--tilt', tilt + 'deg');
        const card = buildEntryCard(item, 'memory-card', () => {
          state.memories = state.memories.filter(x => x.id !== item.id);
          save('sw_memories', state.memories);
          renderMemories();
        });
        card.style.animationDelay = Math.min(i * 40, 300) + 'ms';
        wrap.append(card);
        entriesEl.append(wrap);
        i++;
      });

      groupEl.append(marker, labelEl, entriesEl);
      listEl.append(groupEl);
    });
  }

  wireComposer('events', 'events');
  wireComposer('memories', 'memories', { render: renderMemories });
  wireComposer('wishlist', 'wishlist', { hasLink: true });
  renderList('events', 'events');
  renderMemories();
  renderList('wishlist', 'wishlist');

  /* ---------------- links (shared card builder, used by Links + Decor) ---------------- */

  function buildLinkCard(item, i, onDelete) {
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
      setTimeout(() => onDelete(), 260);
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
    return card;
  }

  function renderLinks() {
    const listEl = document.getElementById('list-links');
    const emptyEl = document.getElementById('empty-links');
    const items = state.links;
    listEl.innerHTML = '';
    emptyEl.classList.toggle('show', items.length === 0);

    items.forEach((item, i) => {
      const card = buildLinkCard(item, i, () => {
        state.links = state.links.filter(x => x.id !== item.id);
        save('sw_links', state.links);
        renderLinks();
      });
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
      linkInput.style.borderColor = 'rgba(226,114,91,0.6)';
      setTimeout(() => { linkInput.style.borderColor = ''; }, 900);
      return;
    }
    const domain = new URL(href).hostname.replace(/^www\./, '');
    state.links.unshift({ id: uid(), url: href, domain, createdAt: Date.now() });
    if (!save('sw_links', state.links)) {
      state.links.shift();
      flashError('Storage full — remove something first');
      return;
    }
    flashSaved();
    linkInput.value = '';
    renderLinks();
  });

  renderLinks();

  /* ---------------- room decor (links + uploaded photos, masonry) ---------------- */

  function buildPhotoCard(item, i, onDelete) {
    const card = document.createElement('div');
    card.className = 'card photo-card';
    card.style.animationDelay = Math.min(i * 40, 300) + 'ms';

    const img = document.createElement('img');
    img.src = item.dataUrl;
    img.loading = 'lazy';
    img.alt = '';

    const delBtn = document.createElement('button');
    delBtn.className = 'card-delete';
    delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    delBtn.addEventListener('click', () => {
      card.classList.add('removing');
      setTimeout(() => onDelete(), 260);
    });

    card.append(img, delBtn);
    return card;
  }

  function renderDecor() {
    const listEl = document.getElementById('list-decor');
    const emptyEl = document.getElementById('empty-decor');
    const items = state.decor;
    listEl.innerHTML = '';
    emptyEl.classList.toggle('show', items.length === 0);

    items.forEach((item, i) => {
      const onDelete = () => {
        state.decor = state.decor.filter(x => x.id !== item.id);
        save('sw_decor', state.decor);
        renderDecor();
      };
      const card = item.kind === 'photo' ? buildPhotoCard(item, i, onDelete) : buildLinkCard(item, i, onDelete);
      listEl.append(card);
    });
  }

  function addDecorItem(item) {
    state.decor.unshift(item);
    if (!save('sw_decor', state.decor)) {
      state.decor.shift();
      flashError('Storage full — remove a photo or two');
      return false;
    }
    flashSaved();
    renderDecor();
    return true;
  }

  const decorLinkForm = document.getElementById('decorLinkForm');
  const decorLinkInput = document.getElementById('decorLinkInput');
  decorLinkForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const href = normalizeUrl(decorLinkInput.value);
    if (!href) {
      decorLinkInput.focus();
      decorLinkInput.style.borderColor = 'rgba(226,114,91,0.6)';
      setTimeout(() => { decorLinkInput.style.borderColor = ''; }, 900);
      return;
    }
    const domain = new URL(href).hostname.replace(/^www\./, '');
    if (addDecorItem({ id: uid(), kind: 'link', url: href, domain, createdAt: Date.now() })) {
      decorLinkInput.value = '';
    }
  });

  function compressImage(file, maxDim = 1100, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
            else { width = Math.round(width * maxDim / height); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('bad image'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  const decorPhotoInput = document.getElementById('decorPhotoInput');
  decorPhotoInput.addEventListener('change', async () => {
    const files = Array.from(decorPhotoInput.files || []).filter(f => f.type.startsWith('image/'));
    for (const file of files) {
      try {
        const dataUrl = await compressImage(file);
        const ok = addDecorItem({ id: uid(), kind: 'photo', dataUrl, createdAt: Date.now() });
        if (!ok) break;
      } catch {
        flashError("Couldn't read that photo");
      }
    }
    decorPhotoInput.value = '';
  });

  function wireSizeToggle(toggleId, targetEl, storeKeyName, initial) {
    const buttons = Array.from(document.querySelectorAll(`#${toggleId} .size-btn`));
    function apply(size) {
      targetEl.dataset.size = size;
      buttons.forEach(b => b.classList.toggle('active', b.dataset.size === size));
      save(storeKeyName, size);
    }
    buttons.forEach(btn => btn.addEventListener('click', () => apply(btn.dataset.size)));
    apply(initial);
  }
  wireSizeToggle('decorSizeToggle', document.getElementById('list-decor'), 'sw_decorSize', state.decorSize);
  wireSizeToggle('linksSizeToggle', document.getElementById('list-links'), 'sw_linksSize', state.linksSize);

  renderDecor();
})();
