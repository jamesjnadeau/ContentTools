/* The IMPERATIVE driver: `EditorApp.get().init(...)` against the document,
   which is how every v1.6.x integration works and what the golden master
   characterises.

   All the observation and normalisation lives in driver-core.js, shared with
   the element page. Only the four things that genuinely differ are here. */
(function () {
    'use strict';

    var app = null;

    window.__ct = window.__ctCreateDriver({
        globals: {
            ContentTools: window.ContentTools,
            ContentEdit: window.ContentEdit,
            ContentSelect: window.ContentSelect,
            HTMLString: window.HTMLString
        },
        // Chrome is mounted straight into document.body.
        chromeRoot: function () { return document; },
        editorApp: function () {
            app = window.ContentTools.EditorApp.get();
            return app;
        },
        boot: function (opts) {
            app.init(
                opts.regions || '[data-editable], [data-fixture]',
                opts.namingProp || 'data-name'
            );
        },
        start: function () { app.start(); },
        stop: function (save) { app.stop(save); },
        save: function (passive) { app.save(passive); },
        revert: function () { app.revert(); }
    });
})();
