(function nsftEarlyTheme() {
    try {
        var mode = localStorage.getItem('nsftThemeCache');
        document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
    } catch (e) { }

    try {
        if (/(?:^|[?&])view=tab(?:&|$)/.test(location.search)) {
            document.documentElement.setAttribute('data-view', 'tab');
        }
    } catch (e) { }
})();
