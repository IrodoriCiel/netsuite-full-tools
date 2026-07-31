(function nsftEarlyTheme() {
    try {
        var mode = localStorage.getItem('nsftThemeCache');
        document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
    } catch (e) { }
})();
