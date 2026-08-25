/* ==========================================================================
   mascot.js — pixel-art prospect mascot for Sales Call Mode
   A small 16x20 pixel bust (torso and up, no legs) that sits beside the chat and reacts to the
   call: idle (waiting) / listening (you're typing) / thinking (AI is working)
   / talking (AI reply, with a mouth flap). Four variants: man/woman x
   brown/blonde. Drawn as flat positioned divs (no box-shadow seams).

   Exposed as the global SCG_MASCOT:
     mount(container, { name, gender })  build the sprite into container
     setState("idle"|"listening"|"thinking"|"talking")
   ========================================================================== */

const SCG_MASCOT = (() => {
  const PX = 6;                 // cell size in CSS px
  const COLS = 16, ROWS = 20;   // sprite grid (bust: cropped at the waist)

  // Rectangles of cells: [x, y, w, h, colorKey], top-left inclusive.
  const GRID_MAN = [
    [4,1,8,3,'cap'],[3,3,10,1,'capShade'],
    [5,4,6,6,'skin'],[6,6,1,1,'dark'],[9,6,1,1,'dark'],
    [5,9,6,1,'beard'],[6,10,4,2,'skin'],
    [4,12,8,8,'shirt'],[10,12,2,8,'shirtShade'],
    [2,13,2,2,'shirt'],[12,13,2,2,'shirt'],
    [2,15,2,5,'skin'],[12,15,2,2,'skin'],[12,17,3,2,'skin'],
  ];
  const GRID_WOMAN = [
    [4,1,8,3,'hair'],[3,3,10,1,'hairShade'],
    [3,4,2,10,'hair'],[11,4,2,10,'hair'],
    [2,2,2,2,'bow'],
    [5,4,6,6,'skin'],[6,6,1,1,'dark'],[9,6,1,1,'dark'],
    [7,9,2,1,'lips'],[6,10,4,2,'skin'],
    [4,12,8,7,'shirt'],[10,12,2,7,'shirtShade'],
    [4,19,8,1,'trim'],
    [2,13,2,2,'shirt'],[12,13,2,2,'shirt'],
    [2,15,2,5,'skin'],[12,15,2,2,'skin'],[12,17,3,2,'skin'],
  ];

  // Fixed colors, independent of hair/accent.
  const FIXED = {
    skin: '#e8b784', dark: '#2a2018', lips: '#b5636e', bow: '#d97a95',
  };
  // Hair-dependent palettes (man uses cap/capShade, woman uses hair/hairShade).
  const HAIR = {
    brown:  { cap:'#8a6a4a', capShade:'#6e5138', hair:'#4a3222', hairShade:'#382519', beard:'#4a3222' },
    blonde: { cap:'#dcb968', capShade:'#c2a052', hair:'#e3c467', hairShade:'#c9a84e', beard:'#dcb968' },
  };
  // Curated outfit accents to pick from, for variety.
  const ACCENTS = ['#4f6fa8', '#a15a5a', '#5a9a7a', '#9a7a4f'];

  // Rough female-name heuristic for figure = auto (spec's list).
  const FEMALE = new Set(['sarah','emma','sophia','olivia','emily','ava','mia','isabella',
    'jessica','hannah','laura','anna','lisa','maria','claire','grace','lucy','amy','kate',
    'katie','rachel','samantha','jennifer','nicole','michelle','amanda','stephanie',
    'elizabeth','victoria','natalie']);

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function toHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v)))
      .toString(16).padStart(2, '0')).join('');
  }
  // Mix `hex` a fraction `amt` toward `target` ({r,g,b}).
  function mix(hex, target, amt) {
    const a = hexToRgb(hex);
    return toHex(a.r + (target.r - a.r) * amt, a.g + (target.g - a.g) * amt, a.b + (target.b - a.b) * amt);
  }
  const BLACK = { r: 0, g: 0, b: 0 }, WHITE = { r: 255, g: 255, b: 255 };

  function buildPalette(hairColor, accent) {
    // Shades stay gentle so the right-edge column reads as soft shading, not a
    // hard dark line down the figure.
    return Object.assign({}, FIXED, HAIR[hairColor] || HAIR.brown, {
      shirt: accent,
      shirtShade: mix(accent, BLACK, 0.34),
      skirt: accent,
      skirtShade: mix(accent, BLACK, 0.34),
      trim: mix(accent, WHITE, 0.60),
    });
  }

  function inferGender(name) {
    const first = (name || '').trim().toLowerCase().split(/\s+/)[0];
    return FEMALE.has(first) ? 'woman' : 'man';
  }

  // State references, so setState can re-target the mounted sprite.
  let figureEl = null, statusEl = null, mouthEl = null, idleTimer = null;

  const STATUS_LABEL = {
    idle: 'On call', listening: 'Listening', thinking: 'Thinking', talking: 'Talking',
  };

  function mount(container, opts) {
    if (!container) return;
    const o = opts || {};
    const gender = o.gender === 'man' || o.gender === 'woman' ? o.gender : inferGender(o.name);
    const hairColor = Math.random() < 0.5 ? 'brown' : 'blonde';
    const accent = ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
    const palette = buildPalette(hairColor, accent);
    const grid = gender === 'woman' ? GRID_WOMAN : GRID_MAN;

    container.innerHTML = '';
    container.classList.add('mascot-rail');

    const status = document.createElement('div');
    status.className = 'mascot-status';
    status.innerHTML = '<span class="mascot-dot"></span><span class="mascot-status-text">On call</span>';

    const stage = document.createElement('div');
    stage.className = 'mascot-stage';

    const figure = document.createElement('div');
    figure.className = 'mascot-figure state-idle';
    figure.style.width = (COLS * PX) + 'px';
    figure.style.height = (ROWS * PX) + 'px';

    grid.forEach(([x, y, w, h, key]) => {
      const cell = document.createElement('div');
      cell.className = 'mascot-cell';
      cell.style.left = (x * PX) + 'px';
      cell.style.top = (y * PX) + 'px';
      cell.style.width = (w * PX) + 'px';
      cell.style.height = (h * PX) + 'px';
      cell.style.background = palette[key] || FIXED.skin;
      figure.appendChild(cell);
    });

    // Mouth: 2x1 cell at (7,9), on top, flashes only while talking.
    const mouth = document.createElement('div');
    mouth.className = 'mascot-mouth';
    mouth.style.left = (7 * PX) + 'px';
    mouth.style.top = (9 * PX) + 'px';
    mouth.style.width = (2 * PX) + 'px';
    mouth.style.height = (1 * PX) + 'px';
    mouth.style.background = gender === 'woman' ? FIXED.lips : FIXED.dark;
    figure.appendChild(mouth);

    const shadow = document.createElement('div');
    shadow.className = 'mascot-shadow';

    stage.appendChild(figure);
    stage.appendChild(shadow);

    const nameEl = document.createElement('div');
    nameEl.className = 'mascot-name';
    nameEl.textContent = o.name || '';

    container.appendChild(status);
    container.appendChild(stage);
    container.appendChild(nameEl);

    figureEl = figure;
    mouthEl = mouth;
    statusEl = status.querySelector('.mascot-status-text');
    setState('idle');
  }

  function setState(state) {
    if (!figureEl) return;
    clearTimeout(idleTimer);   // an explicit change wins over a pending talk->idle
    const s = STATUS_LABEL[state] ? state : 'idle';
    figureEl.className = 'mascot-figure state-' + s;
    if (statusEl) statusEl.textContent = STATUS_LABEL[s];
  }

  // Play the talking animation for a duration tied to reply length, then settle.
  function talkFor(replyText, thenState) {
    if (!figureEl) return;
    clearTimeout(idleTimer);
    setState('talking');
    const len = (replyText || '').length;
    const ms = Math.min(6000, Math.max(1800, len * 45));
    idleTimer = setTimeout(() => setState(thenState || 'idle'), ms);
  }

  return { mount, setState, talkFor };
})();
