// Resolve the viewing mode before the first paint.
(() => {
  let view = new URLSearchParams(location.search).get('view');
  if (view !== 'night' && view !== 'day') {
    try { view = localStorage.getItem('gyri-view'); } catch {}
  }
  document.documentElement.dataset.view = view === 'night' ? 'night' : 'day';
})();
