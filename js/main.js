// Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
}

// Dropdowns on touch. Phones, tablets and touchscreen laptops have no hover, so
// the first tap on "Work" or "Services" opens its menu instead of navigating;
// the menu's own links then work normally.
const tapToOpen = () => window.matchMedia('(max-width: 900px), (hover: none)').matches;
const menuItems = Array.from(document.querySelectorAll('.nav-links > li'))
  .filter(li => li.querySelector('.nav-dropdown'));

menuItems.forEach(li => {
  const parentLink = li.querySelector(':scope > a');
  parentLink.setAttribute('aria-haspopup', 'true');
  parentLink.setAttribute('aria-expanded', 'false');
  parentLink.addEventListener('click', e => {
    if (!tapToOpen()) return;
    e.preventDefault();
    const willOpen = !li.classList.contains('open');
    menuItems.forEach(other => {               // one menu open at a time
      other.classList.remove('open');
      other.querySelector(':scope > a').setAttribute('aria-expanded', 'false');
    });
    if (willOpen) {
      li.classList.add('open');
      parentLink.setAttribute('aria-expanded', 'true');
    }
  });
});

// Tapping anywhere outside an open menu closes it.
document.addEventListener('click', e => {
  if (e.target.closest('.nav-links > li.open')) return;
  menuItems.forEach(li => {
    li.classList.remove('open');
    li.querySelector(':scope > a').setAttribute('aria-expanded', 'false');
  });
});


// Fade-up on scroll
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.08 });
document.querySelectorAll('.fade-up').forEach(el => observer.observe(el));

// Contact form (mailto handoff)
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', e => {
    e.preventDefault();
    const d = new FormData(e.target);
    const subject = encodeURIComponent('Website Inquiry: ' + (d.get('project') || 'General'));
    const body = encodeURIComponent(
      'Name: ' + d.get('fname') + ' ' + d.get('lname') +
      '\nEmail: ' + d.get('email') +
      '\nProject: ' + d.get('project') +
      '\n\n' + d.get('message')
    );
    window.location.href = 'mailto:brynn.yonker@gmail.com?subject=' + subject + '&body=' + body;
    const msg = document.getElementById('form-msg');
    if (msg) msg.style.display = 'block';
  });
}

// Thumbnail fallback. If a thumbnail can't load (offline, 404, or a sandboxed
// preview that blocks third-party images), swap in a waveform placeholder
// rather than letting the browser draw a broken-image glyph. Swapping the src
// (instead of removing the node) keeps the element's box, so nothing collapses.
(function thumbnailFallback() {
  const PLACEHOLDER =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='90' " +
    "viewBox='0 0 160 90' preserveAspectRatio='xMidYMid slice'%3E" +
    "%3Crect width='160' height='90' fill='%232f3a31'/%3E%3Cg fill='%23d98a63' fill-opacity='0.5'%3E" +
    [22, 38, 14, 52, 30, 44, 18, 58, 26, 40, 12, 48, 34, 20, 42, 28]
      .map((h, i) => `%3Crect x='${10 + i * 9}' y='${(90 - h) / 2}' width='3' height='${h}' rx='1.5'/%3E`)
      .join('') +
    '%3C/g%3E%3C/svg%3E';

  function fallback(img) {
    // Step down to YouTube's smaller frame before giving up on YouTube entirely.
    if (img.dataset.ytAlt && !img.dataset.altTried) {
      img.dataset.altTried = '1';
      img.src = img.dataset.ytAlt;
      return;
    }
    if (img.dataset.fallbackApplied) return;
    img.dataset.fallbackApplied = '1';
    // Prefer the project's own artwork; the generic waveform is the last resort.
    img.src = img.dataset.fallback || PLACEHOLDER;
    img.classList.add('is-fallback');   // lets CSS skip the zoom meant for YouTube frames
  }

  // YouTube answers a missing high-res frame with a 120x90 grey placeholder
  // rather than an error, so a tiny image counts as a miss too.
  const missing = img => img.complete && img.naturalWidth <= 120;

  document.querySelectorAll('img.video-thumb, img.scout-thumb, img.ig-thumb').forEach(img => {
    img.addEventListener('error', () => fallback(img));
    img.addEventListener('load', () => { if (img.naturalWidth <= 120) fallback(img); });
    // Cover images that already failed before this script ran.
    if (missing(img)) fallback(img);
  });

  // Portrait and audiobook covers sit on top of a designed ground (a monogram
  // or a typographic cover) that already fills the space, and their containers
  // set their own aspect-ratio. So here the right move is to drop the broken
  // image and let what's underneath show through.
  function reveal(img) {
    if (img.dataset.revealed) return;
    img.dataset.revealed = '1';
    img.remove();
  }

  document.querySelectorAll('.about-portrait img, .ab-cover img').forEach(img => {
    img.addEventListener('error', () => reveal(img));
    if (img.complete && img.naturalWidth === 0) reveal(img);
  });
})();

// A/B audio player. Both tracks play together and the toggle only changes which
// one is audible, so switching never loses your place — that side-by-side is the
// whole point of a before/after.
(function abPlayer() {
  const root = document.getElementById('abPlayer');
  if (!root) return;

  const raw = document.getElementById('abpRaw');
  const designed = document.getElementById('abpDesigned');
  const playBtn = document.getElementById('abpPlay');
  const waveBox = document.getElementById('abpWave');
  const timeEl = document.getElementById('abpTime');
  const canvas = waveBox.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const toggles = Array.from(root.querySelectorAll('.abp-toggle button'));

  const EVENTS = [0.40, 1.25, 2.00, 3.05, 3.85, 4.60];   // hit times, both takes
  const CLIP = 5;                                         // nominal length (s)
  const BARS = 96;
  let current = 'raw';
  let raf = null;

  // Bar heights are derived from the hit times, so the drawing matches what you
  // hear: the designed take reads taller, with tails the raw take doesn't have.
  function buildBars(kind) {
    const designedTake = kind === 'designed';
    const floor = designedTake ? 0.06 : 0.12;   // raw sits on a noisier floor
    const out = [];
    for (let i = 0; i < BARS; i++) {
      const t = (i / BARS) * CLIP;
      let v = floor * (0.6 + 0.4 * Math.sin(i * 1.7));
      for (const e of EVENTS) {
        const d = t - e;
        if (d >= 0) {
          const decay = designedTake ? 0.42 : 0.10;
          const peak = designedTake ? 0.98 : 0.34;
          v = Math.max(v, peak * Math.exp(-d / decay));
        }
      }
      out.push(Math.min(1, v));
    }
    return out;
  }

  let bars = buildBars(current);

  function size() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    const r = canvas.getBoundingClientRect();
    const w = r.width, h = r.height;
    ctx.clearRect(0, 0, w, h);
    const dur = raw.duration || CLIP;
    const progress = dur ? raw.currentTime / dur : 0;
    const gap = w / BARS;
    const bw = Math.max(1.5, gap * 0.55);
    for (let i = 0; i < BARS; i++) {
      const bh = Math.max(2, bars[i] * h * 0.88);
      const x = i * gap + (gap - bw) / 2;
      const y = (h - bh) / 2;
      // Played portion in the accent, the rest held back.
      ctx.fillStyle = (i / BARS) <= progress ? '#c25e34' : 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      const rr = Math.min(bw / 2, bh / 2);
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + bw, y, x + bw, y + bh, rr);
      ctx.arcTo(x + bw, y + bh, x, y + bh, rr);
      ctx.arcTo(x, y + bh, x, y, rr);
      ctx.arcTo(x, y, x + bw, y, rr);
      ctx.closePath();
      ctx.fill();
    }
  }

  const fmt = s => {
    if (!isFinite(s)) s = 0;
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };

  function tick() {
    // Two independent elements drift apart over time; nudge the silent one back
    // so a mid-listen switch lands on the same moment even in a long clip.
    const lead = current === 'raw' ? raw : designed;
    const follow = current === 'raw' ? designed : raw;
    if (!follow.paused && Math.abs(lead.currentTime - follow.currentTime) > 0.08) {
      follow.currentTime = lead.currentTime;
    }
    draw();
    timeEl.textContent = `${fmt(raw.currentTime)} / ${fmt(raw.duration || CLIP)}`;
    raf = requestAnimationFrame(tick);
  }

  function applyTrack() {
    raw.muted = current !== 'raw';
    designed.muted = current !== 'designed';
  }

  function play() {
    // Keep the pair aligned before starting; drift makes the comparison lie.
    designed.currentTime = raw.currentTime;
    applyTrack();
    Promise.all([raw.play(), designed.play()]).then(() => {
      root.classList.add('is-playing');
      playBtn.setAttribute('aria-label', 'Pause comparison');
      if (!raf) tick();
    }).catch(() => {
      // Autoplay policy or a missing file — leave the UI in its resting state.
      root.classList.remove('is-playing');
    });
  }

  function pause() {
    raw.pause(); designed.pause();
    root.classList.remove('is-playing');
    playBtn.setAttribute('aria-label', 'Play comparison');
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    draw();
  }

  playBtn.addEventListener('click', () => (raw.paused ? play() : pause()));

  toggles.forEach(btn => btn.addEventListener('click', () => {
    current = btn.dataset.track;
    toggles.forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    bars = buildBars(current);
    applyTrack();
    draw();
  }));

  waveBox.addEventListener('click', e => {
    const r = waveBox.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const dur = raw.duration || CLIP;
    raw.currentTime = designed.currentTime = pos * dur;
    draw();
  });

  raw.addEventListener('ended', pause);
  raw.addEventListener('loadedmetadata', () => {
    timeEl.textContent = `0:00 / ${fmt(raw.duration)}`;
    draw();
  });

  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { size(); draw(); }, 120);
  });

  applyTrack();
  size();
  draw();
})();

// Hero slider: 3 slides, each with a live Canvas audio-bar visualization
(function heroSlider() {
  const root = document.getElementById('heroSlider');
  if (!root) return;

  const slides = Array.from(root.querySelectorAll('.hero-slide'));
  const dots = Array.from(root.querySelectorAll('.hero-dot'));
  const prevBtn = root.querySelector('[data-dir="-1"]');
  const nextBtn = root.querySelector('[data-dir="1"]');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AUTOPLAY_MS = 6000;

  const vizConfigs = {
    dialogue: { color: '#c25e34', bars: 52, mode: 'bursty', ease: 0.22 },
    ambience: { color: '#6a8d72', bars: 40, mode: 'lazy', ease: 0.12 },
    narration: { color: '#d98a63', bars: 60, mode: 'bursty', ease: 0.18 }
  };

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const entries = slides.map(slide => {
    const canvas = slide.querySelector('canvas.hero-canvas');
    const config = vizConfigs[canvas.dataset.viz];
    const heights = new Array(config.bars).fill(0).map(() => Math.random() * 0.4);
    const targets = heights.slice();
    return { canvas, ctx: canvas.getContext('2d'), config, heights, targets, raf: null };
  });

  function sizeCanvas(entry) {
    const rect = entry.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    entry.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    entry.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    entry.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawFrame(entry) {
    const { ctx, canvas, config, heights, targets } = entry;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    const n = config.bars;
    const gap = w / n;
    const barW = Math.max(1.5, gap * 0.5);
    for (let i = 0; i < n; i++) {
      heights[i] += (targets[i] - heights[i]) * config.ease;
      if (Math.abs(heights[i] - targets[i]) < 0.02 && Math.random() < (config.mode === 'lazy' ? 0.02 : 0.06)) {
        targets[i] = config.mode === 'bursty'
          ? (Math.random() < 0.22 ? Math.random() * 0.12 : 0.28 + Math.random() * 0.72)
          : 0.15 + Math.random() * 0.85;
      }
      const barH = Math.max(2, heights[i] * h * 0.82);
      const x = i * gap + (gap - barW) / 2;
      const y = (h - barH) / 2;
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = config.color;
      roundRect(ctx, x, y, barW, barH, barW / 2);
      ctx.fill();
    }
  }

  function loop(entry) {
    drawFrame(entry);
    entry.raf = requestAnimationFrame(() => loop(entry));
  }

  function startViz(i) {
    const entry = entries[i];
    sizeCanvas(entry);
    if (reduceMotion) { drawFrame(entry); return; }
    if (!entry.raf) loop(entry);
  }

  function stopViz(i) {
    const entry = entries[i];
    if (entry.raf) { cancelAnimationFrame(entry.raf); entry.raf = null; }
  }

  let index = 0;
  let timer = null;

  function goTo(i) {
    const next = (i + slides.length) % slides.length;
    slides[index].classList.remove('is-active');
    dots[index].classList.remove('is-active');
    stopViz(index);
    index = next;
    slides[index].classList.add('is-active');
    dots[index].classList.add('is-active');
    startViz(index);
  }

  function restartAutoplay() {
    if (timer) clearInterval(timer);
    if (reduceMotion) return;
    timer = setInterval(() => goTo(index + 1), AUTOPLAY_MS);
  }

  if (prevBtn) prevBtn.addEventListener('click', () => { goTo(index - 1); restartAutoplay(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { goTo(index + 1); restartAutoplay(); });
  dots.forEach((dot, i) => dot.addEventListener('click', () => { goTo(i); restartAutoplay(); }));

  root.addEventListener('mouseenter', () => { if (timer) clearInterval(timer); });
  root.addEventListener('mouseleave', restartAutoplay);
  root.addEventListener('focusin', () => { if (timer) clearInterval(timer); });
  root.addEventListener('focusout', restartAutoplay);

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => sizeCanvas(entries[index]), 120);
  });

  startViz(0);
  restartAutoplay();
})();

// "Show all" for long lists. Without JavaScript everything is simply visible.
// With it, a list opens at a few full rows; rows are counted from the live
// column count, so the cut-off never leaves a ragged half row.
document.querySelectorAll('.more-btn[data-expand]').forEach(btn => {
  const list = document.getElementById(btn.dataset.expand);
  if (!list) return;
  const rows = list.classList.contains('ss-grid') ? 2 : 3;
  const items = Array.from(list.children);
  const label = btn.textContent;

  function columns() {
    return getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  }
  function mark() {
    const limit = columns() * rows;
    items.forEach((el, i) => el.classList.toggle('is-extra', i >= limit));
    btn.hidden = items.length <= limit && list.classList.contains('is-collapsed');
  }

  list.classList.add('is-collapsed');
  btn.setAttribute('aria-controls', list.id);
  btn.setAttribute('aria-expanded', 'false');
  mark();
  window.addEventListener('resize', mark);

  btn.addEventListener('click', () => {
    const collapsed = list.classList.toggle('is-collapsed');
    btn.textContent = collapsed ? label : 'Show fewer';
    btn.setAttribute('aria-expanded', String(!collapsed));
    if (collapsed) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});
