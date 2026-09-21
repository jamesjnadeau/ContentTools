import {shellStyles, shellStyleSheet} from '../../../src/shell/styles.js';

/* The shell's stylesheet. Every assertion here is for a failure that
   produces no error anywhere: a sheet that parses to nothing looks exactly
   like a sheet with no rules that match, a url() that cannot resolve looks
   like a missing asset, and an icon glyph with no font behind it is a box
   nobody's DOM assertion can see. */

describe('shell stylesheet', () => {

    it('parses to real rules once wrapped in its cascade layer', () => {
        // The layer wrap is textual. A stray @charset -- which Sass emits
        // the moment any rule contains a non-ASCII character -- is invalid
        // inside a layer block and invalidates EVERYTHING in it, so the
        // sheet would construct without complaint and style nothing.
        const sheet = shellStyleSheet(document);
        expect(sheet).not.toBe(null);
        expect(sheet.cssRules).toHaveLength(1);

        const layer = sheet.cssRules[0];
        expect(layer.constructor.name).toBe('CSSLayerBlockRule');
        expect(layer.name).toBe('ct-shell');
        expect(layer.cssRules.length).toBeGreaterThan(20);
    });

    it('is a DIFFERENT layer from the editor chrome', () => {
        // Two surfaces a host page has separate reasons to restyle. Sharing
        // one layer name would mean a page that resets the CMS frame's
        // styling silently unstyles the editor's toolbox too.
        expect(shellStyles).toContain('@layer ct-shell');
        expect(shellStyles).not.toContain('ct-chrome');
    });

    it('carries no url() and no @font-face', () => {
        // The sheet ships as a STRING inside dist/shell.js, so a relative
        // url() has no stylesheet base and resolves against the page --
        // landing wherever the asset is not. And an @font-face declared
        // inside a shadow root is ignored outright by Chromium and WebKit,
        // so it would be a rule that does nothing at all.
        expect(shellStyles).not.toContain('url(');
        expect(shellStyles).not.toContain('@font-face');
    });

    it('asks for no icon glyphs', () => {
        // Follows from the line above and is worth its own assertion,
        // because it is the one that is easy to write by accident: the
        // editor's `type-icons` mixin sets `font-family: 'icon'`, whose
        // face is registered on the DOCUMENT by src/element/icon-font.ts --
        // a module the shell frame does not import. Reaching for it renders
        // tofu boxes that every DOM assertion in this suite would pass.
        expect(shellStyles).not.toContain("'icon'");
        expect(shellStyles).not.toContain('"icon"');
    });

    it('creates no containing block', () => {
        // The editor's toolbox is `position: fixed`. Any of these
        // properties on an ancestor of the editor slot makes that resolve
        // against the shell instead of the viewport, and the toolbox
        // follows the page around as it scrolls -- with nothing thrown.
        // test/browser/shell/layout.spec.js measures the mounted result;
        // this catches it in the source, where the fix is obvious.
        // Anchored to a declaration boundary rather than matched as a
        // substring, because `text-transform: uppercase` contains
        // `transform:` and is entirely harmless. A test that fails on it
        // would be quietly worked around rather than believed.
        for (const property of ['transform', 'filter', 'backdrop-filter',
                                'perspective', 'contain', 'will-change']) {
            const declaration = new RegExp(`(^|[;{\\s])${property}\\s*:`);
            expect(declaration.test(shellStyles)).toBe(false);
        }
    });

    it('styles the host itself', () => {
        // A custom element with no display is `inline`, which gives the
        // shell a zero content box: the frame renders, has no height, and
        // nothing inside it is visible.
        expect(shellStyles).toContain(':host');

        const host = document.createElement('ct-styles-probe');
        document.body.appendChild(host);
        const root = host.attachShadow({mode: 'open'});
        root.adoptedStyleSheets = [shellStyleSheet(document)];
        try {
            expect(getComputedStyle(host).display).toBe('block');
        } finally {
            host.remove();
        }
    });

    it('is cached per document', () => {
        // A constructed sheet belongs to the document that built it, so
        // the cache cannot be one module constant -- a shell inside an
        // <iframe> needs its own, and adopting the wrong realm's sheet
        // throws.
        expect(shellStyleSheet(document)).toBe(shellStyleSheet(document));
    });
});
