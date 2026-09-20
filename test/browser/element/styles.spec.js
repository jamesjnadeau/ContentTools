import {
    chromeStyles, hostStyles, chromeStyleSheet, hostStyleSheet
} from '../../../src/element/styles.js';
import {ensureIconFont} from '../../../src/element/icon-font.js';

/* The two things the element puts into a page that are not the editor
   itself: the chrome stylesheet it adopts into its shadow root, and the icon
   font it registers on the document.

   Both fail silently when they are wrong. A broken cascade layer looks like
   a stylesheet that simply has no effect; a missing @font-face renders every
   toolbox glyph as a tofu box that no DOM assertion can see. So both are
   asserted through real rendering rather than by inspecting the text. */

describe('chrome stylesheet', () => {

    it('parses to real rules once wrapped in its cascade layer', () => {
        // The wrap is textual, so a stray @charset or an unbalanced brace
        // would produce a sheet that parses to nothing and silently styles
        // nothing. Counting rules is what catches that.
        const sheet = chromeStyleSheet(document);
        expect(sheet).not.toBe(null);
        expect(sheet.cssRules).toHaveLength(1);

        const layer = sheet.cssRules[0];
        expect(layer.constructor.name).toBe('CSSLayerBlockRule');
        expect(layer.name).toBe('ct-chrome');
        // The real chrome sheet is ~228 rules; any collapse to a handful
        // means the wrap ate the content.
        expect(layer.cssRules.length).toBeGreaterThan(100);
    });

    it('carries no @font-face and no url()', () => {
        // Restated here as well as in the golden styles suite, because THIS
        // is the file that inlines the text into the JS bundle: an asset
        // reference would have no base to resolve against once it is a
        // string, and an @font-face would be silently ignored inside the
        // shadow root.
        expect(chromeStyles).not.toContain('@font-face');
        expect(chromeStyles).not.toContain('url(');
    });

    it('is cached per document', () => {
        // A CSSStyleSheet is bound to the document that constructed it, so
        // the cache has to be keyed by document rather than be a single
        // module constant -- an element in an <iframe> needs its own.
        expect(chromeStyleSheet(document)).toBe(chromeStyleSheet(document));
    });

    it('is constructed in the target document, not this realm', () => {
        const frame = document.createElement('iframe');
        document.body.appendChild(frame);
        try {
            const inner = frame.contentDocument;
            const sheet = chromeStyleSheet(inner);
            expect(sheet).not.toBe(null);
            expect(sheet).not.toBe(chromeStyleSheet(document));
            // The proof: a sheet from the wrong realm throws on adoption.
            const host = inner.createElement('div');
            inner.body.appendChild(host);
            const root = host.attachShadow({mode: 'open'});
            expect(() => { root.adoptedStyleSheets = [sheet]; }).not.toThrow();
        } finally {
            frame.remove();
        }
    });
});

describe('host stylesheet', () => {

    it('gives the host a block box', () => {
        // An unstyled custom element is display:inline, which gives it a
        // zero content box and collapses the editor inside it.
        expect(hostStyles).toContain(':host');
        const sheet = hostStyleSheet(document);
        expect(sheet).not.toBe(null);
        expect(sheet.cssRules.length).toBeGreaterThan(0);
    });

    it('is NOT layered', () => {
        // :host rules are structural defaults a consumer should be able to
        // override the same way as any other rule. Layering them would make
        // them lose to every unlayered consumer rule, which is right, but
        // they also must not be inside the chrome layer where a consumer
        // resetting the layer would take them out.
        const sheet = hostStyleSheet(document);
        for (const rule of sheet.cssRules) {
            expect(rule.constructor.name).not.toBe('CSSLayerBlockRule');
        }
    });
});

describe('cascade layer', () => {

    /* The guarantee this exists for: a consumer's rule beats the editor's at
       EQUAL specificity. Order alone cannot deliver that across
       adoptedStyleSheets and in-tree <link>s, which is why the chrome sits
       in a layer. If layers ever stop being the right tool, this fails
       immediately rather than at a consumer's site. */

    function mount(applyConsumer) {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = host.attachShadow({mode: 'open'});
        const target = document.createElement('div');
        target.className = 'ct-probe';
        root.appendChild(target);

        const layered = new CSSStyleSheet();
        layered.replaceSync('@layer ct-chrome { .ct-probe { color: rgb(255, 0, 0); } }');
        root.adoptedStyleSheets = [layered];
        applyConsumer(root, target);
        return {host, target};
    }

    it('lets an adopted consumer sheet win at equal specificity', () => {
        const {host, target} = mount(root => {
            const consumer = new CSSStyleSheet();
            consumer.replaceSync('.ct-probe { color: rgb(0, 128, 0); }');
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, consumer];
        });
        expect(getComputedStyle(target).color).toBe('rgb(0, 128, 0)');
        host.remove();
    });

    it('lets a consumer <style> element win even when inserted FIRST', () => {
        // The order-independence that is the entire reason for the layer: a
        // <style> placed before the adopted sheet still wins, because
        // unlayered beats layered regardless of position.
        const {host, target} = mount((root, el) => {
            const style = document.createElement('style');
            style.textContent = '.ct-probe { color: rgb(0, 0, 255); }';
            root.insertBefore(style, el);
        });
        expect(getComputedStyle(target).color).toBe('rgb(0, 0, 255)');
        host.remove();
    });

    it('still applies the chrome rule when the consumer says nothing', () => {
        // Guards the opposite failure: a layer that loses to everything,
        // including nothing at all.
        const {host, target} = mount(() => {});
        expect(getComputedStyle(target).color).toBe('rgb(255, 0, 0)');
        host.remove();
    });
});

describe('ensureIconFont', () => {

    /** The faces registered on `doc` whose family is `icon`. */
    function iconFaces(doc) {
        return [...doc.fonts].filter(
            face => String(face.family).replace(/['"]/g, '') === 'icon');
    }

    /* fonts.check() is a weaker oracle than it looks: for a family with NO
       registered face it returns TRUE, vacuously -- "every matching face is
       loaded" is satisfied by there being none. Verified directly against
       Chromium. So it distinguishes loaded from failed-to-load, but says
       nothing about whether the font was registered at all, which is exactly
       the failure this module exists to prevent.

       Registration is therefore asserted separately, and the glyph is
       measured on top of that, because a registered-but-wrong font still
       renders tofu. */

    it('registers the icon face on the document', () => {
        expect(iconFaces(document)).toHaveLength(0);
        ensureIconFont(document);
        expect(iconFaces(document)).toHaveLength(1);
    });

    it('loads it, so glyphs render rather than tofu', async () => {
        ensureIconFont(document);
        await document.fonts.load('16px icon');
        // Meaningful now that a face IS registered: false would mean the
        // data URI failed to decode.
        expect(document.fonts.check('16px icon')).toBe(true);

        // And the real discriminator -- a tofu box and a glyph differ in
        // advance width. Without this, a face that registers but decodes to
        // nothing still passes everything above.
        const span = document.createElement('span');
        span.textContent = '\ue000';
        span.style.cssText = 'position:absolute;font-size:64px;font-family:icon';
        document.body.appendChild(span);
        const iconWidth = span.getBoundingClientRect().width;
        span.style.fontFamily = 'ct-no-such-family';
        const fallbackWidth = span.getBoundingClientRect().width;
        span.remove();

        expect(iconWidth).toBeGreaterThan(0);
        expect(iconWidth).not.toBe(fallbackWidth);
    });

    it('is idempotent per document', () => {
        ensureIconFont(document);
        ensureIconFont(document);
        ensureIconFont(document);
        expect(iconFaces(document)).toHaveLength(1);
    });

    it('falls back to a <style> element where FontFace is unavailable', () => {
        // The fallback path, and the only place the WeakSet guard actually
        // does anything: without a FontFace constructor there is no
        // FontFaceSet to scan, so re-entry would append a second <style> on
        // every connect. Verified by mutation -- removing the guard leaves
        // every other assertion in this file green.
        const frame = document.createElement('iframe');
        document.body.appendChild(frame);
        try {
            const inner = frame.contentDocument;
            // Stand in for an engine without constructable FontFace.
            delete frame.contentWindow.FontFace;

            ensureIconFont(inner);
            const styles = inner.querySelectorAll('style[data-content-tools="icon-font"]');
            expect(styles).toHaveLength(1);
            expect(styles[0].textContent).toContain('@font-face');
            expect(styles[0].textContent).toContain('data:font/woff;base64,');

            // The fact that makes ONE guard enough for both routes: a face
            // declared by injected CSS shows up in doc.fonts exactly as a
            // constructed one does, so the family scan catches re-entry
            // here too. Pinned, because a separate WeakSet guard was
            // removed on the strength of it.
            expect([...inner.fonts].some(
                f => String(f.family).replace(/['"]/g, '') === 'icon')).toBe(true);

            ensureIconFont(inner);
            ensureIconFont(inner);
            expect(inner.querySelectorAll('style[data-content-tools="icon-font"]'))
                .toHaveLength(1);
        } finally {
            frame.remove();
        }
    });

    it('registers into a different document', async () => {
        // The WeakMap/WeakSet keying is per document for a reason: an
        // element inside an <iframe> is in a different realm, and a face
        // built in this one cannot be added to that FontFaceSet.
        const frame = document.createElement('iframe');
        document.body.appendChild(frame);
        try {
            const inner = frame.contentDocument;
            expect(iconFaces(inner)).toHaveLength(0);
            ensureIconFont(inner);
            expect(iconFaces(inner)).toHaveLength(1);
            await inner.fonts.load('16px icon');
            expect(inner.fonts.check('16px icon')).toBe(true);
        } finally {
            frame.remove();
        }
    });
});
