/* The test driver, minus the two things that differ between an imperative
   `EditorApp.get().init(...)` page and a `<content-tools-editor>` page.

   It lives in its own file so the two drivers CANNOT drift. An equivalence
   proof between two pages is worth nothing if the observation code on each
   side is a separate copy that might normalise differently, serialize a
   different subtree, or quietly stop asserting something. Everything the
   snapshots are built from is here, written once.

   Everything here talks to the PUBLIC integration contract only
   (EditorApp.get().init, addEventListener('saved'), busy(), StylePalette,
   IMAGE_UPLOADER, toolbox().tools()). That is deliberate: the golden master
   must fail if the contract changes, and must not depend on internals that
   the port is free to reshape.

   Loaded as a CLASSIC script by both pages -- the imperative page has no
   module of its own, and the element page loads this before its module so
   the factory is already on `window`. */
(function () {
    'use strict';

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

    function serializeElement(el) {
        if (!el) return null;
        var clone = el.cloneNode(true);
        // Drop inline geometry that depends on viewport/layout.
        var all = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('*')));
        all.forEach(function (n) {
            if (!n.getAttribute) return;
            ['data-ce-size', 'data-ce-moving'].forEach(function (a) { n.removeAttribute(a); });
            /* `ct-widget--active` is the class every widget gains 100 ms
               after it mounts, to transition itself in. It says nothing
               about behaviour and everything about when you looked: on a
               slow runner the timer fires before the snapshot is taken
               and on a fast one it does not, so recording it makes a
               frozen snapshot a coin toss. Stripped rather than waited
               out -- a settle would put the class in every snapshot and
               still leave the next scenario racing a different timer. */
            if (n.classList) n.classList.remove('ct-widget--active');
            var s = n.getAttribute && n.getAttribute('style');
            if (s && /(?:top|left|width|height):/.test(s)) n.removeAttribute('style');
        });
        return normaliseHTML(clone.outerHTML);
    }

    /**
     * Build the `window.__ct` surface.
     *
     * `env` supplies the two halves that genuinely differ:
     *
     *   globals     the four namespaces -- window globals from the IIFE build
     *               on the imperative page, ESM imports on the element page.
     *   chromeRoot  where the editor chrome lives: `document` for the
     *               imperative page, the element's `shadowRoot` for the
     *               element page. This is the ONLY observation that moves.
     *   editorApp   the singleton, however this page reaches it.
     *   boot        put the editor in the state `init()` leaves it in. The
     *               element has already done this from its attributes by the
     *               time its module runs, so there it is a no-op.
     *   start/stop/save/revert  driven through each page's own public API, so
     *               the element's methods are what the scenarios exercise.
     */
    window.__ctCreateDriver = function (env) {
        var ContentTools = env.globals.ContentTools;
        var ContentEdit = env.globals.ContentEdit;
        var ContentSelect = env.globals.ContentSelect;
        var HTMLString = env.globals.HTMLString;

        var editor = null;
        var savedPayloads = [];
        var eventLog = [];
        var uploaderCalls = [];

        function reset() {
            savedPayloads = [];
            eventLog = [];
            uploaderCalls = [];
        }

        function chromeQuery(selector) {
            return serializeElement(env.chromeRoot().querySelector(selector));
        }

        return {
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

                editor = env.editorApp();

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

                env.boot(opts);
                return true;
            },

            start: function () { env.start(); },
            stop:  function (save) { env.stop(save); },
            save:  function (passive) { env.save(passive); },
            revert: function () { env.revert(); },

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
                /* `null` rather than a throw for a missing region, because
                   `stop()` empties `_regions` without touching
                   `_orderedRegions` -- so after a stop this list is as long
                   as it ever was and every entry is undefined. That is
                   v1.6.16 behaviour, preserved; recording it is more useful
                   than crashing on it, and the value is still compared, so a
                   page that DIDN'T do it would still show up. */
                return editor.orderedRegions().map(function (r) {
                    return r ? r.domElement().getAttribute('data-name') : null;
                });
            },

            /* Serialized chrome -- catches UI regressions the regions map can't see. */
            chrome: function () {
                return {
                    app: chromeQuery('.ct-app'),
                    toolbox: chromeQuery('.ct-toolbox'),
                    inspector: chromeQuery('.ct-inspector'),
                    ignition: chromeQuery('.ct-ignition')
                };
            },

            /* Content is in the light DOM on BOTH pages -- that is what Mode A
               means -- so this one is `document` either way. */
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

            /* Read the selection back through the seam. On the element page
               this is the three-branch shadow chain; on the imperative page
               it is the light-DOM implementation. Same numbers either way is
               the point. */
            querySelection: function () {
                var el = ContentEdit.Root.get().focused();
                if (!el) throw new Error('nothing focused');
                // query() always returns a Range; an unreadable selection
                // comes back collapsed at 0, which is itself the answer.
                return ContentSelect.Range.query(el.domElement()).get();
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
            },

            /* Whether the consumer's IMAGE_UPLOADER assignment stuck. The
               ESM config-mutability tripwire, asked through whichever
               namespace object this page holds. */
            imageUploaderType: function () {
                return typeof ContentTools.IMAGE_UPLOADER;
            },

            /* Measure a collapsed caret. This is the one read path that needs
               a LIVE Range: rect() inserts a marker span to measure a
               collapsed selection, and a StaticRange -- which is what
               getComposedRanges() hands back on the engines that have it --
               has no insertNode(). Reconstructing the live Range is what
               getRange() exists for, and this is what notices if it stops
               happening. */
            measureCaret: function (name, index, at) {
                var region = editor.regions()[name];
                if (!region) throw new Error('no region ' + name);
                var el = region.children[index || 0];
                var before = el.domElement().innerHTML;
                el.focus();
                new ContentSelect.Range(at, at).select(el.domElement());
                var rect = ContentSelect.Range.rect();
                return {
                    found: Boolean(rect),
                    finite: Boolean(rect) && isFinite(rect.top) && isFinite(rect.left),
                    // The article sits below the page's own 32px padding, so a
                    // marker measured at the document origin means the caret
                    // was never really placed.
                    positioned: Boolean(rect) && rect.top > 0,
                    // rect() must leave no marker behind.
                    htmlUnchanged: el.domElement().innerHTML === before
                };
            },

            /* Start and cancel a drag without a mouse. What matters per engine
               is not the gesture -- Playwright synthesises that identically --
               but WHERE the helper lands and whether the body class that
               styles the page cursor is written and unwritten. In Mode A both
               answers must match the imperative page exactly. */
            dragProbe: function (name, index) {
                var region = editor.regions()[name];
                if (!region) throw new Error('no region ' + name);
                var el = region.children[index || 0];
                var root = ContentEdit.Root.get();

                root.startDragging(el, 100, 100);
                var helper = document.querySelector('.ce-drag-helper');
                var result = {
                    dragging: root.dragging() === el,
                    helperInDocument: Boolean(helper),
                    helperParentIsBody: Boolean(helper) && helper.parentNode === document.body,
                    bodyClass: document.body.classList.contains('ce--dragging'),
                    elementClass: el.domElement().classList.contains('ce-element--dragging')
                };

                root.cancelDragging();
                result.afterCancel = {
                    dragging: root.dragging() === el,
                    helperInDocument: Boolean(document.querySelector('.ce-drag-helper')),
                    bodyClass: document.body.classList.contains('ce--dragging')
                };
                return result;
            },

            stylePaletteNames: function () {
                return ContentTools.StylePalette
                    .styles(new ContentEdit.Text('p'))
                    .map(function (s) { return s.name(); });
            }
        };
    };
})();
