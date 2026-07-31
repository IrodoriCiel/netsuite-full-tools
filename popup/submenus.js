(function () {
  function sync() {
    var root = document.documentElement;
    var h = document.getElementById('colorThemeHue');
    var s = document.getElementById('colorThemeSat');
    var l = document.getElementById('colorThemeLig');
    if (h) root.style.setProperty('--nsft-h', h.value);
    if (s) root.style.setProperty('--nsft-s', s.value + '%');
    if (l) root.style.setProperty('--nsft-l', l.value + '%');
  }
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id && e.target.id.indexOf('colorTheme') === 0) sync();
  });
  document.addEventListener('change', sync);
  document.addEventListener('DOMContentLoaded', sync);
  setTimeout(sync, 300);
  sync();
})();

