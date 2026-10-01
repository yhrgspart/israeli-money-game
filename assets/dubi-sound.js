/* =====================================================================
   DUBI MONEY GAMES - shared sound engine (assets only, NO browser voice)
   ---------------------------------------------------------------------
   * Voice lines : assets/audio/<id>.mp3   (made by generate_all_sounds.py)
   * Sound FX    : assets/sfx/<name>.wav   (made by generate_all_sounds.py)
   * Chrome / browser text-to-speech is blocked completely.
   * A missing file is skipped silently (console warning only).
   ===================================================================== */
(function () {
  'use strict';

  var VOICE_DIR = 'assets/audio/';
  var SFX_DIR = 'assets/sfx/';
  var MAX_SHEKEL_FILE = 500;               // sh_0 ... sh_500 exist
  var SFX_NAMES = ['click', 'coin', 'success', 'wrong', 'celebrate', 'treasure',
                   'scoop', 'cash', 'powerup', 'whoosh', 'catch', 'bomb', 'silence'];

  /* ---------- 1. Hard block of the browser (Chrome) voice ---------- */
  function blockBrowserVoice() {
    try {
      if (!('speechSynthesis' in window) || !window.speechSynthesis) return;
      try { window.speechSynthesis.cancel(); } catch (e) {}
      var noop = function () {};
      try { window.speechSynthesis.speak = noop; } catch (e) {}
      try {
        if (window.SpeechSynthesis && window.SpeechSynthesis.prototype) {
          Object.defineProperty(window.SpeechSynthesis.prototype, 'speak',
            { value: noop, configurable: true, writable: true });
        }
      } catch (e) {}
    } catch (e) {}
  }
  blockBrowserVoice();

  function warn(msg) { try { console.warn('[DubiSound] ' + msg); } catch (e) {} }

  /* ---------- 2. Voice player (one reusable <audio> = mobile friendly) ---------- */
  var V = { el: null, token: 0, missing: {}, pending: null, watch: 0, muted: false, primed: false };

  function voiceEl() {
    if (!V.el) {
      try { V.el = new Audio(); V.el.preload = 'auto'; } catch (e) { V.el = null; }
    }
    return V.el;
  }

  function partId(p) {
    if (p == null) return null;
    if (typeof p === 'string') return p;
    if (Array.isArray(p)) return p[0] || null;
    return p.id || null;
  }

  function clearHandlers(a) {
    if (!a) return;
    a.onended = null; a.onerror = null; a.onplaying = null;
  }

  function stop() {
    V.token++;
    V.pending = null;
    clearTimeout(V.watch);
    var a = V.el;
    if (a) {
      clearHandlers(a);
      try { a.pause(); } catch (e) {}
    }
  }

  function playOne(id, tk, next) {
    var a = voiceEl();
    if (!a || V.missing[id]) { next(); return; }
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(V.watch);
      clearHandlers(a);
      if (tk === V.token) next();
    }
    function markMissing() {
      if (done || tk !== V.token) return;
      V.missing[id] = true;
      warn('missing voice file: ' + VOICE_DIR + id + '.mp3 (skipped, run generate_all_sounds.py)');
      finish();
    }
    a.onended = finish;
    a.onerror = markMissing;
    a.onplaying = function () {
      if (done || tk !== V.token) return;
      clearTimeout(V.watch);
      var d = (isFinite(a.duration) && a.duration > 0) ? a.duration : 8;
      var left = Math.max(0, d - (a.currentTime || 0));
      V.watch = setTimeout(finish, (left + 2) * 1000);   // safety net if 'ended' never fires
    };
    clearTimeout(V.watch);
    V.watch = setTimeout(function () { if (!V.pending) finish(); }, 12000); // stuck loading
    try {
      a.src = VOICE_DIR + encodeURIComponent(id) + '.mp3';
      var pr = a.play();
      if (pr && pr.catch) {
        pr.catch(function (err) {
          if (done || tk !== V.token) return;
          var name = err && err.name;
          if (name === 'NotAllowedError') {            // autoplay blocked: play on first tap
            V.pending = { tk: tk, a: a };
            return;
          }
          if (name === 'AbortError') return;          // replaced by a newer sound
          if (a.error || name === 'NotSupportedError') { markMissing(); return; }
          finish();
        });
      }
    } catch (e) { finish(); }
  }

  /* parts: ['id', ...]  or  [{id:'x', text:'...'}, ...]  or  [['id','text'], ...]
     The text is only a caption for developers - it is NEVER read by the browser. */
  function speak(parts, onDone) {
    stop();
    var cb = typeof onDone === 'function' ? onDone : null;
    var ids = [];
    (parts || []).forEach(function (p) {
      var id = partId(p);
      if (id) ids.push(id);
      else warn('voice part without an audio id was skipped: ' + JSON.stringify(p));
    });
    if (V.muted || !ids.length) { if (cb) cb(); return; }
    var tk = V.token, i = 0;
    function next() {
      if (tk !== V.token) return;
      if (i >= ids.length) { if (cb) cb(); return; }
      playOne(ids[i++], tk, next);
    }
    next();
  }

  /* ---------- 3. Sound effects (small pool per effect) ---------- */
  var S = { pools: {}, missing: {}, volume: 0.55 };
  function sfxEl(name) {
    var pool = S.pools[name] || (S.pools[name] = []);
    for (var i = 0; i < pool.length; i++) if (pool[i].paused || pool[i].ended) return pool[i];
    if (pool.length >= 4) return pool[0];
    var a;
    try { a = new Audio(SFX_DIR + name + '.wav'); } catch (e) { return null; }
    a.preload = 'auto';
    a.onerror = function () {
      if (!S.missing[name]) warn('missing sound effect: ' + SFX_DIR + name + '.wav (run generate_all_sounds.py)');
      S.missing[name] = true;
    };
    pool.push(a);
    return a;
  }
  function sfx(name, volume) {
    if (V.muted || !name || name === 'none' || S.missing[name]) return;
    var a = sfxEl(name);
    if (!a) return;
    try { a.currentTime = 0; } catch (e) {}
    a.volume = typeof volume === 'number' ? volume : S.volume;
    try { var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
  }
  function preload() {
    ['click', 'coin', 'success', 'wrong', 'celebrate'].forEach(function (n) { sfxEl(n); });
  }

  /* ---------- 4. Money amount -> voice ids (sh_N / ag_N / and_ag_N) ---------- */
  function money(value) {
    var cents = Math.round(Number(value || 0) * 100);
    if (cents < 0) cents = 0;
    var w = Math.floor(cents / 100), ag = cents % 100, ids = [];
    if (ag % 10 !== 0) { warn('agorot amount ' + ag + ' rounded to tens'); ag = Math.round(ag / 10) * 10; if (ag === 100) { w++; ag = 0; } }
    if (w > MAX_SHEKEL_FILE) { warn('amount ' + w + ' is above sh_' + MAX_SHEKEL_FILE); w = MAX_SHEKEL_FILE; }
    if (w > 0) ids.push({ id: 'sh_' + w });
    if (ag > 0) ids.push({ id: (w > 0 ? 'and_ag_' : 'ag_') + ag });
    if (!ids.length) ids.push({ id: 'sh_0' });
    return ids;
  }

  /* ---------- 5. Unlock audio on the first tap (autoplay rules, iPhone) ---------- */
  function onGesture() {
    var p = V.pending;
    if (p && p.tk === V.token) {
      V.pending = null;
      try { var pr = p.a.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
      V.primed = true;
      return;
    }
    if (!V.primed) {
      V.primed = true;
      var a = voiceEl();
      // prime the shared element inside a user gesture (needed on iOS Safari)
      if (a && (a.paused || a.ended) && !a.onended) {
        try {
          a.src = SFX_DIR + 'silence.wav';
          var pr2 = a.play(); if (pr2 && pr2.catch) pr2.catch(function () {});
        } catch (e) {}
      }
    }
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (t) {
    window.addEventListener(t, onGesture, true);
  });

  /* ---------- 6. Automatic tap sounds for buttons / money ---------- */
  var COIN_SEL = '.money, .money-drop, .coin, .bill';
  var CLICK_SEL = 'button, .btn, .card, .car, .level, .option, .flavor, .spot, .say, [role="button"], [data-sfx]';
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var el = t.closest('[data-sfx]') || t.closest(COIN_SEL) || t.closest(CLICK_SEL);
    if (!el || el.disabled) return;
    var name = el.getAttribute('data-sfx') || (el.matches(COIN_SEL) ? 'coin' : 'click');
    sfx(name);
  }, true);

  /* ---------- 7. Stop voice when the page is hidden ---------- */
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);

  window.DubiSound = {
    speak: speak,
    stop: stop,
    sfx: sfx,
    money: money,
    preload: preload,
    setMuted: function (m) { V.muted = !!m; if (V.muted) stop(); },
    isMuted: function () { return V.muted; },
    missingVoices: function () { return Object.keys(V.missing); }
  };
  preload();
})();
