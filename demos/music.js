// Background music: a quiet playlist that only starts when the visitor asks for it.
// Stickothy's track is separate from the regular playlist and requires his request.
(() => {
  const btn = document.querySelector('.music-toggle');
  if (!btn) return;
  const tracks = ['avanti-time', 'hazelwood-coming-of-age', 'massobeats-gingersweet']
    .map((name) => `assets/audio/${name}.mp3`);
  const VOLUME = .32;
  let audio = null, index = Math.floor(Math.random() * tracks.length), fade = 0, playbackRequest = 0;
  let stickothy = false, regularAudio = null, stickothyAudio = null;
  const notify = (type, detail = {}) => dispatchEvent(new CustomEvent(type, { detail: { stickothy, ...detail } }));

  // Ease the volume to a target so starting and stopping never jolt.
  function fadeTo(target, done) {
    cancelAnimationFrame(fade);
    const from = audio.volume, start = performance.now(), ms = 600;
    const step = (now) => {
      const t = Math.min(1, (now - start) / ms);
      audio.volume = from + (target - from) * t;
      if (t < 1) fade = requestAnimationFrame(step); else done?.();
    };
    fade = requestAnimationFrame(step);
  }

  function load() {
    audio = regularAudio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => { if (!stickothy) changeTrack(1); });
  }

  function play() {
    const request = ++playbackRequest;
    cancelAnimationFrame(fade);
    if (!audio) { load(); audio.src = tracks[index]; }
    audio.volume = 0;
    audio.play().then(() => {
      if (request !== playbackRequest || btn.getAttribute('aria-pressed') !== 'true') return;
      fadeTo(VOLUME);
      notify('portfolio:music-started');
    }).catch(() => { if (request === playbackRequest) set(false); });
  }

  function pause() {
    const request = ++playbackRequest;
    if (audio) fadeTo(0, () => { if (request === playbackRequest) audio.pause(); });
    notify('portfolio:music-paused');
  }

  function changeTrack(direction) {
    const on = btn.getAttribute('aria-pressed') === 'true';
    cancelAnimationFrame(fade); playbackRequest++;
    if (!audio) load();
    audio.pause();
    const wasStickothy = stickothy;
    if (!regularAudio) load();
    audio = regularAudio;
    if (!stickothy) index = (index + direction + tracks.length) % tracks.length;
    stickothy = false; audio.loop = false; audio.src = tracks[index];
    notify('portfolio:music-selection', { stickothy: wasStickothy });
    if (on) play();
  }

  function set(on) {
    btn.setAttribute('aria-pressed', String(on));
    btn.title = on ? 'Pause background music' : 'Play background music';
    btn.setAttribute('aria-label', btn.title);
  }

  // Keep his audio element so interruptions resume from the same position.
  addEventListener('portfolio:play-track', (e) => {
    cancelAnimationFrame(fade); playbackRequest++;
    audio?.pause();
    if (!stickothyAudio) {
      stickothyAudio = new Audio();
      stickothyAudio.preload = 'auto';
      stickothyAudio.src = e.detail.src;
      stickothyAudio.loop = true;
    }
    audio = stickothyAudio; stickothy = true;
    set(true); play();
  });

  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    set(on);
    // A visitor's Play always selects the regular playlist; Stickothy handles his retry.
    if (on && stickothy) {
      audio.pause();
      if (!regularAudio) load();
      audio = regularAudio;
      stickothy = false; audio.loop = false; audio.src = tracks[index];
      notify('portfolio:music-selection');
    }
    on ? play() : pause();
  });
  document.querySelector('.music-previous')?.addEventListener('click', () => changeTrack(-1));
  document.querySelector('.music-next')?.addEventListener('click', () => changeTrack(1));
})();
