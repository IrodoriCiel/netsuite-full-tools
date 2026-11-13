(function (g) {
    'use strict';
    const LIBS = [
        'scripts/libs/sql-formatter/sql-formatter.min.js',
        'scripts/libs/highlight/highlight.min.js',
        'scripts/libs/highlight/languages/json.min.js',
        'scripts/libs/highlight/languages/sql.min.js',
        'scripts/libs/highlight/languages/freemarker.js'
    ];
    g.NSFT_CODE_LIBS = Object.freeze(LIBS.slice());

    g.NSFT_SUITE_BUNDLE = Object.freeze({
        js: Object.freeze(LIBS.concat([
            'scripts/libs/codemirror/codemirror.min.js',
            'scripts/libs/codemirror/mode/sql/sql.min.js',
            'scripts/libs/codemirror/addon/hint/show-hint.min.js',
            'scripts/libs/codemirror/addon/hint/sql-hint.min.js',
            'scripts/libs/codemirror/addon/edit/matchbrackets.min.js',
            'scripts/libs/codemirror/addon/edit/closebrackets.min.js',
            'scripts/libs/codemirror/addon/comment/comment.min.js',
            'scripts/libs/codemirror/addon/fold/foldcode.min.js',
            'scripts/libs/codemirror/addon/fold/foldgutter.min.js',
            'scripts/libs/codemirror/addon/fold/brace-fold.min.js',
            'scripts/libs/codemirror/addon/fold/comment-fold.min.js',
            'scripts/libs/tabulator/tabulator.min.js',
            'scripts/libs/chartjs/chart.umd.min.js',
            'scripts/modules/suiteql_runner/chart/nsft_chart_core.js',
            'scripts/modules/_shared/nsft_panel_bridge.js',
            'scripts/modules/suiteql_runner/suiteql_runner.js',
            'scripts/modules/_shared/nsft_code_editor.js',
            'scripts/modules/suitescript_console/suitescript_console_mode.js',
            'scripts/modules/suitescript_console/suitescript_console.js',
            'scripts/modules/suiteql_runner/ai/nsft_ai_agent.js'
        ])),
        css: Object.freeze([
            'scripts/libs/codemirror/codemirror.min.css',
            'scripts/libs/codemirror/theme/material-darker.min.css',
            'scripts/libs/codemirror/addon/hint/show-hint.min.css',
            'scripts/libs/codemirror/addon/fold/foldgutter.min.css',
            'scripts/libs/tabulator/tabulator.min.css',
            'scripts/modules/suiteql_runner/suiteql_runner.css',
            'scripts/modules/suitescript_console/suitescript_console.css',
            'scripts/modules/suiteql_runner/ai/nsft_ai.css'
        ])
    });
})(typeof self !== 'undefined' ? self : window);
