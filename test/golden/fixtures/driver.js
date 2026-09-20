/* Test driver. Exposes window.__ct for Playwright to call.

   Everything here talks to the PUBLIC integration contract only
   (EditorApp.get().init, addEventListener('saved'), busy(), StylePalette,
   IMAGE_UPLOADER, toolbox().tools()). That is deliberate: the golden master
   must fail if the contract changes, and must not depend on internals that
   the port is free to reshape. */
(function () {
    'use strict';

    var editor = null;
    var savedPayloads = [];
    var eventLog = [];
    var uploaderCalls = [];

    // --- normalisation ------------------------------------------------------
    // Snapshots must be stable across runs and machines. Strip anything that is
    // inherently non-deterministic or purely presentational.

    function normaliseHTML(html) {
        return String(html)
            // collapse all whitespace runs, including across tags
            .replace(/\s+/g, ' ')
            .replace(/>\s+</g, '><')
            .trim();
    }

    // Attributes ContentEdit adds for its own bookkeeping, plus anything
    // carrying a generated id or measured geometry.
    var VOLATILE_ATTRS = /\s(?:data-ce-size|data-ce-moving|style="[^"]*(?:width|height|top|left)[^"]*")="?[^"\s>]*"?/g;

    function serializeElement(el) {
        if (!el) return null;
        var clone = el.cloneNode(true);
        // Drop inline geometry that depends on viewport/layout.
        var all = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('*')));
        all.forEach(function (n) {
            if (!n.getAttribute) return;
            ['data-ce-size', 'data-ce-moving'].forEach(function (a) { n.removeAttribute(a); });
            var s = n.getAttribute && n.getAttribute('style');
            if (s && /(?:top|left|width|height):/.test(s)) n.removeAttribute('style');
        });
        return normaliseHTML(clone.outerHTML);
    }

    // --- setup --------------------------------------------------------------

    function reset() {
        savedPayloads = [];
        eventLog = [];
        uploaderCalls = [];
    }

    window.__ct = {
        /* Initialise the editor exactly as a host page would. */
        init: function (opts) {
            opts = opts || {};
            reset();

            if (opts.stylePalette) {
                ContentTools.StylePalette.add([
                    new ContentTools.Style('By-line', 'article__by-line', ['p']),
                    new ContentTools.Style('Caption', 'article__caption', ['p']),
                    new ContentTools.Style('Example', 'example', ['pre'])
                ]);
            }

            if (opts.imageUploader) {
                // Mirrors the sandbox's fake uploader, but synchronous and
                // deterministic. Exercises the full 8-event dialog contract.
                ContentTools.IMAGE_UPLOADER = function (dialog) {
                    uploaderCalls.push('mounted');
                    dialog.addEventListener('imageuploader.cancelupload', function () {
                        uploaderCalls.push('cancelupload');
                    });
                    dialog.addEventListener('imageuploader.clear', function () {
                        uploaderCalls.push('clear');
                        dialog.clear();
                    });
                    dialog.addEventListener('imageuploader.fileready', function () {
                        uploaderCalls.push('fileready');
                        dialog.populate('/image.png', [400, 300]);
                    });
                    dialog.addEventListener('imageuploader.rotateccw', function () {
                        uploaderCalls.push('rotateccw');
                    });
                    dialog.addEventListener('imageuploader.rotatecw', function () {
                        uploaderCalls.push('rotatecw');
                    });
                    dialog.addEventListener('imageuploader.save', function () {
                        uploaderCalls.push('save');
                        dialog.save('/image.png', [400, 300], {alt: 'test'});
                    });
                    dialog.addEventListener('imageuploader.mount', function () {
                        uploaderCalls.push('mount');
                    });
                    dialog.addEventListener('imageuploader.unmount', function () {
                        uploaderCalls.push('unmount');
                    });
                };
            }

            editor = ContentTools.EditorApp.get();

            ['start', 'started', 'stop', 'stopped', 'save', 'saved', 'revert']
                .forEach(function (name) {
                    editor.addEventListener(name, function (ev) {
                        var d = ev.detail() || {};
                        eventLog.push(name);
                        if (name === 'saved') {
                            savedPayloads.push({
                                regions: d.regions || {},
                                passive: !!d.passive
                            });
                        }
                    });
                });

            editor.init(
                opts.regions || '[data-editable], [data-fixture]',
                opts.namingProp || 'data-name'
            );
            return true;
        },

        start: function () { editor.start(); },
        stop:  function (save) { editor.stop(save); },
        save:  function (passive) { editor.save(passive); },
        revert: function () { editor.revert(); },

        /* --- observation ---------------------------------------------- */

        savedPayloads: function () {
            // Normalise every region's HTML so whitespace-only codegen changes
            // don't read as behavioural regressions.
            return savedPayloads.map(function (p) {
                var out = {};
                Object.keys(p.regions).sort().forEach(function (k) {
                    out[k] = normaliseHTML(p.regions[k]);
                });
                return {regions: out, passive: p.passive};
            });
        },

        /* The contract that matters most: WHICH regions come back, in order. */
        savedRegionNames: function () {
            return savedPayloads.map(function (p) { return Object.keys(p.regions).sort(); });
        },

        eventLog: function () { return eventLog.slice(); },
        uploaderCalls: function () { return uploaderCalls.slice(); },

        regionNames: function () {
            return Object.keys(editor.regions()).sort();
        },

        orderedRegionNames: function () {
            return editor.orderedRegions().map(function (r) {
                return r.domElement().getAttribute('data-name');
            });
        },

        /* Serialized chrome — catches UI regressions the regions map can't see. */
        chrome: function () {
            return {
                app: serializeElement(document.querySelector('.ct-app')),
                toolbox: serializeElement(document.querySelector('.ct-toolbox')),
                inspector: serializeElement(document.querySelector('.ct-inspector')),
                ignition: serializeElement(document.querySelector('.ct-ignition'))
            };
        },

        contentHTML: function () {
            return serializeElement(document.querySelector('.article__content'));
        },

        /* --- editing primitives --------------------------------------- */

        /* Focus a region's first text element and place a collapsed caret. */
        focusRegion: function (name, index) {
            var region = editor.regions()[name];
            if (!region) throw new Error('no region ' + name);
            var el = region.children[index || 0];
            el.focus();
            new ContentSelect.Range(0, 0).select(el.domElement());
            return el.type();
        },

        /* Select a character range within the focused element. */
        selectRange: function (from, to) {
            var el = ContentEdit.Root.get().focused();
            if (!el) throw new Error('nothing focused');
            new ContentSelect.Range(from, to).select(el.domElement());
            el.selection(new ContentSelect.Range(from, to));
        },

        /* Apply a tool by name, exactly as the toolbox would. */
        applyTool: function (name) {
            var tool = ContentTools.ToolShelf.fetch(name);
            var el = ContentEdit.Root.get().focused();
            var selection = el && el.selection ? el.selection() : null;
            if (!tool.canApply(el, selection)) return false;
            tool.apply(el, selection, function () {});
            return true;
        },

        toolNames: function () {
            return Object.keys(ContentTools.ToolShelf._tools).sort();
        },

        /* Describe a region's children -- used to observe the placeholder that
           start() injects into an empty region. */
        regionChildren: function (name) {
            var region = editor.regions()[name];
            if (!region) throw new Error('no region ' + name);
            return region.children.map(function (c) {
                return {type: c.type(), html: normaliseHTML(c.html())};
            });
        },

        setText: function (name, index, text) {
            var region = editor.regions()[name];
            var el = region.children[index || 0];
            el.content = new HTMLString.String(text);
            el.updateInnerHTML();
            el.taint();
        }
    };
})();
