// Reserve room for every class and the navigation before sizing the artwork.
(() => {
  const hero = document.getElementById('hero');
  const info = document.getElementById('ring-info');
  const chart = document.getElementById('chart-left');
  const column = document.getElementById('chart-col');
  const controls = document.getElementById('chart-style-bar');
  const app = document.getElementById('app');
  const tabs = document.getElementById('tabs');
  const px = value => parseFloat(value) || 0;
  const outerHeight = element => {
    const style = getComputedStyle(element);
    return element.offsetHeight + px(style.marginTop) + px(style.marginBottom);
  };
  let frame = 0;
  function fit() {
    frame = 0;
    if (app.classList.contains('panel-focused')) return;
    const style = getComputedStyle(hero);
    const columnStyle = getComputedStyle(column);
    // A hidden chart leaves its column empty but still displayed, so check the chart itself.
    const columnVisible = getComputedStyle(column).display !== 'none' && !chart.classList.contains('chart-hidden');
    const fixedHeight = px(style.paddingTop) + px(style.paddingBottom)
      + outerHeight(info) + (columnVisible ? outerHeight(controls)
      + px(columnStyle.marginTop) + px(columnStyle.marginBottom) : 0);
    // The tabs' auto top margin is free space, not content, so only their own height is reserved.
    const height = app.clientHeight - tabs.offsetHeight - fixedHeight;
    const width = hero.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
    // The chart grows to use the room the frame leaves, up to 1.45x, and shrinks when it doesn't fit.
    const scale = chart.offsetHeight ? Math.min(1.45, Math.max(0, height - 4) / chart.offsetHeight, width / chart.offsetWidth) : 1;
    // Zoom participates in layout, so controls and classes follow the resized chart.
    const zoom = String(Math.floor(scale * 1000) / 1000);
    if (chart.style.zoom !== zoom) chart.style.zoom = zoom;
    // Tabs follow the visible content instead of a viewport-filling empty area.
    const contentHeight = Math.ceil(fixedHeight + (columnVisible ? chart.offsetHeight * Number(zoom) : 0) + 4);
    hero.style.height = contentHeight + 'px';
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(fit); }
  const observer = new ResizeObserver(schedule);
  [app, hero, info, chart, controls, tabs].forEach(element => observer.observe(element));
  new MutationObserver(schedule).observe(app, {attributes:true, attributeFilter:['class']});
  document.fonts.ready.then(schedule);
  schedule();
})();
