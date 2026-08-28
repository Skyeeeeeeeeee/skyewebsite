/* SkyeLens — channel reference tabs.
   The Suno prompt bench and the Shorts title bank, ported from the artifacts.
   Everything here is reference text, so it's static data rendered once. */

/* ---------------- jazz prompt bench ---------------- */
export const JAZZ_SETUP = [
  ['Instrumental', 'Toggle it on. Don’t rely on writing "no vocals" — Suno adds singing by default and the toggle is the only reliable switch.'],
  ['Style field', 'Paste the prompt into the style box, leave lyrics empty.'],
  ['Batch', 'Run one prompt many times before switching. Consistency across a video matters more than variety.'],
  ['Download', 'Save as you go. A track that isn’t on your drive before Sept 3 counts against the new cap.'],
  ['Name', 'Rename on download — mood-bpm-take.mp3. At 200 files, "untitled (4)" is unusable.'],
];

export const JAZZ_WARN = {
  lead: 'Keep rate is about one in four.',
  rest: 'Generate expecting to discard most of it. If you’re keeping everything, you aren’t listening critically enough — a stream lives or dies on nothing jarring you out of the background.',
};

export const JAZZ_PROMPTS = [
  { name: 'House style', use: 'the channel’s default', bpm: 68,
    text: 'slow noir jazz ballad, brushed drums, upright bass, rhodes piano, muted trumpet, smoky after-hours bar, warm tape saturation, vintage mono recording, instrumental, 68 BPM' },
  { name: 'Rain window', use: 'pairs with rain ambience', bpm: 62,
    text: 'melancholy noir jazz, soft piano, bowed upright bass, distant tenor saxophone, 1940s lounge, tape hiss, spacious reverb, instrumental, 62 BPM' },
  { name: 'Slow morning', use: 'coffee / lighter edition', bpm: 78,
    text: 'gentle vintage jazz trio, warm rhodes piano, brushed snare, walking upright bass, muted trumpet, unhurried and hopeful, soft vinyl warmth, instrumental, 78 BPM' },
  { name: 'Small hours', use: 'sparsest, for sleep', bpm: 56,
    text: 'sparse dark jazz, lone piano, quiet upright bass, distant cymbal wash, long reverb tail, minimal and patient, close mic room tone, instrumental, 56 BPM' },
  { name: 'Club swing', use: 'lifts a slow stretch', bpm: 96,
    text: 'medium swing jazz trio, brushed drums, walking upright bass, bluesy piano comping, smoky basement club, vintage recording, instrumental, 96 BPM' },
  { name: 'Saxophone lead', use: 'the signature sound', bpm: 66,
    text: 'slow tenor saxophone ballad, breathy subtone, jazz trio backing, after hours, warm vinyl crackle, mellow and unhurried, instrumental, 66 BPM' },
  { name: 'Vibraphone', use: 'texture break', bpm: 72,
    text: 'cool jazz with vibraphone, soft mallets, brushed drums, upright bass, dreamy and cold, 1950s recording, instrumental, 72 BPM' },
  { name: 'Archtop guitar', use: 'texture break', bpm: 70,
    text: 'vintage jazz guitar ballad, hollow body archtop, warm clean tone, brushed drums, upright bass, mellow 1950s lounge, instrumental, 70 BPM' },
  { name: 'Whiskey blues', use: 'heavier, later', bpm: 60,
    text: 'slow smoky blues jazz, muted trumpet, low piano chords, brush kit, late night bar, tape warmth, weary and rich, instrumental, 60 BPM' },
  { name: 'Solo piano', use: 'openers and closers', bpm: 54,
    text: 'quiet solo jazz piano, sustain pedal, intimate close mic, room tone, tender and slow, felt hammers, instrumental, 54 BPM' },
];

export const JAZZ_CREDITS = [
  ['40%', 'House style and Saxophone lead — the channel’s core identity.'],
  ['30%', 'Rain window, Small hours, Whiskey blues — the late-night bulk.'],
  ['20%', 'Slow morning and Club swing — a second video, or daytime variety.'],
  ['10%', 'Vibraphone, Archtop, Solo piano — texture breaks so an hour doesn’t blur.'],
];

export const JAZZ_NOTE = {
  lead: 'Listen at low volume while doing something else.',
  rest: 'That’s how your audience hears it. A track that’s gorgeous under headphones and irritating at background level is a track to cut, and you’ll only notice at the volume it’ll actually be played at.',
};

/* ---------------- shorts title bank ---------------- */
export const TITLE_FACTS = [
  ['3', 'Hashtags shown above your title. YouTube picks the three it judges most engaging — not the first three you typed.'],
  ['60', 'Hard ceiling. Go over it and YouTube ignores every hashtag on the video. You’re nowhere near this.'],
  ['0', 'Tolerance for unrelated tags. Misleading metadata can get a video pulled from search — or removed.'],
];

export const TITLE_WARN = {
  lead: 'This is the part to take seriously.',
  rest: 'Your current block carries #rpg, #level, #puzzle and #simulationsoftware on a physics animation that is not a video game, plus #adhd, which describes nothing in the video. YouTube’s Misleading Metadata policy says unrelated hashtags "may result in the removal of your video or playlist." For a channel three months from a Partner Program review, that’s not a risk worth 200 characters.',
};

export const TAG_SETS = [
  {
    name: 'Square race Shorts', note: 'Specific first, broad last. Every one of these describes something a viewer would actually see.',
    tags: '#squarerace #satisfying #oddlysatisfying #marblerace #physics #simulation #maze #pickacolor #satisfyingvideo',
  },
  {
    name: 'Bouncing square song videos', note: 'Different format, different audience. Don’t reuse the race set here — the overlap is only #satisfying.',
    tags: '#guessthesong #bouncingball #musicquiz #songquiz #satisfying #oddlysatisfying #piano #relaxing',
  },
  {
    name: 'Retire these', drop: true,
    note: 'These point the feed at people looking for video games. That’s not what you make, so the viewers it brings swipe away — which is the signal that decides whether you get shown to more people.',
    tags: '#simulationsoftware #rpg #level #puzzle #gaming #simulator #2d #adhd',
  },
];

export const TITLE_GROUPS = [
  {
    id: 'commit', name: 'Commit before it starts', color: '#c9976a',
    why: 'Forces a decision in the first second, which is what turns a viewer into a commenter. This group is your highest-leverage one — you’re asking for comments already, just too quietly.',
    items: ['Pick your square now. No takebacks.', 'Choose a color before it starts', 'Lock it in. Final answer?', 'One guess. Choose now.', 'Say your color out loud first', 'Don’t scroll. Pick one.', 'Commit to a square in 3 seconds', 'Pick a color and don’t change it'],
  },
  {
    id: 'odds', name: 'Odds and numbers', color: '#5a8a7a',
    why: 'A number makes the stake legible before the video starts. It also gives each title something concrete that no other title on your channel has.',
    items: ['4 squares. 1 finish line.', '8 squares, only one wins', '16 squares enter. One leaves.', '100 squares, one winner', 'Only 1 in 4 get this right', '12 seconds. 4 squares. Go.', '25% chance. Pick well.', '3 squares. No second place.'],
  },
  {
    id: 'underdog', name: 'Underdog', color: '#e8b563',
    why: 'Promises a twist, so people stay for the payoff. Use these only on races that actually have a comeback — a title that lies costs you the next video’s retention.',
    items: ['Red was last the entire time', 'Blue came back from dead last', 'The slowest square won this', 'Nobody picks green. Watch green.', 'Last place wins this one', 'Purple had no business winning'],
  },
  {
    id: 'close', name: 'Photo finish', color: '#c96a7a',
    why: 'Sells the ending rather than the premise. Best on your genuinely tight races — this is the group that gets people to watch to the last frame.',
    items: ['Closest finish I’ve made yet', 'Photo finish — which square?', 'Decided by one bounce', 'This comes down to millimeters', 'Impossible to call this one', 'They finish within a frame'],
  },
  {
    id: 'variant', name: 'New format', color: '#c96a52',
    why: 'The most important group on this page. Each of these is a video you haven’t made — same satisfying core, new surface. Novelty is what fixes a saturated feed.',
    items: ['Square race, but the maze moves', 'Elimination: last square standing', 'Square race with obstacles', 'Tournament, round 1', 'Square race but they can push', 'Slowest square wins this time', 'The maze rebuilds every lap', 'Square race in the dark', 'Two mazes, one winner', 'Square race but gravity flips', 'Squares get faster every lap', 'One square is invisible'],
  },
  {
    id: 'search', name: 'Searchable', color: '#8f8f96',
    why: 'Plain and literal, for the 1.5% of your traffic that comes from search. Not exciting — that’s the point. Sprinkle a few in so you’re not 96% dependent on the Shorts feed.',
    items: ['Satisfying square race', 'Square race maze — pick a color', 'Marble race but with squares', 'Oddly satisfying square race maze', 'Color picking square race maze'],
  },
];

export const PUBLISH_CHECK = [
  ['One title, used once.', 'Duplicate titles across dozens of videos give the feed nothing to tell them apart. Cross a title off this list when you use it.'],
  ['Put the ask on screen, not in the description.', '"Pick your color" as text in the first two seconds will beat any CTA buried under the fold. Your comment rate is around 0.03% — that’s the number this fixes.'],
  ['One upload a day.', 'On every day you posted twice, the second one landed at a fraction of the first. Same audience, split two ways.'],
  ['Work through the New format group.', 'Saturation is the thing actually costing you reach. Fifty-two near-identical videos is why the feed cooled, and a genuinely new variant is what warms it back up.'],
];

/* ---------------- rendering ---------------- */
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// one shared copy helper: swaps the label briefly, falls back to selecting the text
function copyText(text, btn, label = 'Copy') {
  const done = (msg) => {
    btn.textContent = msg;
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = label; btn.classList.remove('copied'); }, 1500);
  };
  try {
    navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Press ⌘C'));
  } catch {
    done('Press ⌘C');
  }
}

function copyBtn(text, label = 'Copy') {
  const b = el('button', 'ch-copy', label);
  b.type = 'button';
  b.addEventListener('click', (e) => { e.stopPropagation(); copyText(text, b, label); });
  return b;
}

function calloutEl(cls, { lead, rest }) {
  const box = el('div', 'ch-callout ' + cls);
  const p = el('p');
  p.append(el('strong', null, lead + ' '), document.createTextNode(rest));
  box.append(p);
  return box;
}

function sectionEl(title, sub) {
  const s = el('section', 'ch-section');
  s.append(el('h2', 'ch-h2', title));
  if (sub) s.append(el('p', 'ch-sub', sub));
  return s;
}

function tagRows(pairs) {
  const ul = el('ul', 'ch-rules');
  pairs.forEach(([tag, body]) => {
    const li = el('li');
    li.append(el('span', 'ch-tag', tag), el('span', null, body));
    ul.append(li);
  });
  return ul;
}

export function renderJazz(root) {
  root.innerHTML = '';

  const setup = sectionEl('Set these once');
  setup.append(tagRows(JAZZ_SETUP), calloutEl('warn', JAZZ_WARN));
  root.append(setup);

  const prompts = sectionEl('The prompts', 'Ten prompts covering the moods a 24/7 jazz channel needs. Click any of them to copy.');
  const all = el('div', 'ch-prompt-grid');
  JAZZ_PROMPTS.forEach(p => {
    const card = el('div', 'ch-card');
    const top = el('div', 'ch-card-top');
    const names = el('div');
    names.append(el('span', 'ch-name', p.name), el('span', 'ch-use', '· ' + p.use));
    top.append(names, el('span', 'ch-bpm', p.bpm + ' BPM'));
    const body = el('p', 'ch-mono', p.text);
    const actions = el('div', 'ch-actions');
    actions.append(copyBtn(p.text));
    card.append(top, body, actions);
    card.addEventListener('click', () => copyText(p.text, actions.firstChild));
    all.append(card);
  });
  prompts.append(all);
  root.append(prompts);

  const credits = sectionEl('How to spend 2,500 credits',
    'Roughly 500 songs, which at a one-in-four keep rate leaves about 125 tracks — six hours of music. A workable split, weighted toward the moods that fill the most airtime:');
  credits.append(tagRows(JAZZ_CREDITS), calloutEl('note', JAZZ_NOTE));
  root.append(credits);

  root.append(el('p', 'ch-foot',
    'Written for TofuBro, August 2026. BPM values are hints to Suno, not guarantees — check the tempo of what comes back before sequencing a video.'));
}

export function renderTitles(root) {
  root.innerHTML = '';

  const facts = sectionEl('The three tag facts that actually matter');
  const grid = el('div', 'ch-facts');
  TITLE_FACTS.forEach(([n, body]) => {
    const c = el('div', 'ch-fact');
    c.append(el('div', 'ch-fact-n', n), el('div', 'ch-fact-lab', body));
    grid.append(c);
  });
  facts.append(grid, calloutEl('warn', TITLE_WARN));
  root.append(facts);

  const sets = sectionEl('Tag sets to paste');
  TAG_SETS.forEach(set => {
    const wrap = el('div', 'ch-tagset' + (set.drop ? ' drop' : ''));
    const head = el('div', 'ch-tagset-head');
    head.append(el('h3', null, set.name), el('span', 'ch-count', set.tags.split(/\s+/).length + ' tags'));
    wrap.append(head, el('p', 'ch-note', set.note));
    const boxRow = el('div', 'ch-tagbox');
    boxRow.append(el('code', null, set.tags));
    if (!set.drop) boxRow.append(copyBtn(set.tags));
    wrap.append(boxRow);
    sets.append(wrap);
  });
  root.append(sets);

  const total = TITLE_GROUPS.reduce((n, g) => n + g.items.length, 0);
  const titles = sectionEl(total + ' titles', 'Grouped by the angle each one plays. Click a title to copy it.');

  const bar = el('div', 'ch-chips');
  const groupsWrap = el('div', 'ch-groups');
  const chips = [];
  const setFilter = (id) => {
    chips.forEach(c => c.classList.toggle('active', c.dataset.filter === id));
    groupsWrap.querySelectorAll('.ch-group').forEach(g => {
      g.hidden = id !== 'all' && g.dataset.group !== id;
    });
  };
  const mkChip = (id, label, color) => {
    const c = el('button', 'ch-chip');
    c.type = 'button';
    c.dataset.filter = id;
    if (color) {
      const dot = el('span', 'ch-dot');
      dot.style.background = color;
      c.append(dot);
    }
    c.append(document.createTextNode(label));
    c.addEventListener('click', () => setFilter(id));
    chips.push(c);
    bar.append(c);
  };
  mkChip('all', 'All ' + total);
  TITLE_GROUPS.forEach(g => mkChip(g.id, g.name, g.color));

  TITLE_GROUPS.forEach(g => {
    const box = el('div', 'ch-group');
    box.dataset.group = g.id;
    const head = el('div', 'ch-group-head');
    const mark = el('span', 'ch-group-mark');
    mark.style.background = g.color;
    head.append(mark, el('h3', null, g.name), el('span', 'ch-count', g.items.length));
    head.append(copyBtn(g.items.join('\n'), 'Copy all'));
    box.append(head, el('p', 'ch-group-why', g.why));
    const list = el('div', 'ch-titles');
    g.items.forEach(t => {
      const row = el('button', 'ch-title');
      row.type = 'button';
      row.style.setProperty('--lane', g.color);
      row.append(el('span', 'ch-title-text', t), el('span', 'ch-title-copy', 'Copy'));
      row.addEventListener('click', () => copyText(t, row.querySelector('.ch-title-copy')));
      list.append(row);
    });
    box.append(list);
    groupsWrap.append(box);
  });
  setFilter('all');
  titles.append(bar, groupsWrap);
  root.append(titles);

  const check = sectionEl('Before you hit publish');
  const ol = el('ol', 'ch-check');
  PUBLISH_CHECK.forEach(([lead, rest]) => {
    const li = el('li');
    li.append(el('b', null, lead + ' '), document.createTextNode(rest));
    ol.append(li);
  });
  check.append(ol);
  root.append(check);

  const foot = el('p', 'ch-foot');
  foot.append(document.createTextNode('Hashtag limits and the misleading-metadata rule are from YouTube’s own documentation — '));
  const a = el('a', null, 'Using hashtags');
  a.href = 'https://support.google.com/youtube/answer/6390658?hl=en';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  foot.append(a, document.createTextNode('. View numbers are from your Studio analytics for Jul 27 – Aug 23, 2026.'));
  root.append(foot);
}
