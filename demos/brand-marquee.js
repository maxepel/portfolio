/* Repeat one complete group so the pencil logos loop without a jump. */
(() => {
  const track = document.querySelector('.brand-marquee-track');
  const group = track?.querySelector('.brand-marquee-group');
  if (!group) return;
  const copy = group.cloneNode(true);
  copy.setAttribute('aria-hidden', 'true');
  // Visible copies still open their links; only the original is a keyboard stop.
  copy.querySelectorAll('a').forEach(link => { link.tabIndex = -1; });
  track.append(copy);
  track.classList.add('is-ready');
})();
