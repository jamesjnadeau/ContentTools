import iconFont from '../assets/icons.woff?inline';

/* The icon font, registered on the DOCUMENT rather than the shadow root.
 *
 * This exists because of a trap that is invisible in every DOM assertion:
 * `@font-face` declared inside a shadow root is IGNORED by Chromium and
 * WebKit. The chrome stylesheet the element adopts is where the glyphs are
 * drawn, but it cannot be where the face is declared -- so the font has to
 * reach the document by another route, and that route is here.
 *
 * It is JavaScript rather than CSS for a second reason. The obvious fix
 * would be to put a data-URI @font-face into chrome.scss, but
 * test/golden/styles.spec.mjs asserts that the chrome sheet contains zero
 * @font-face rules and no `url(` at all -- the property that makes inlining
 * it as a string safe. Both halves of that test are load-bearing, so the
 * font is injected instead of declared.
 *
 * The bytes are inlined (~6.8 KB of woff, ~9.1 KB as base64) so there is no
 * asset path to resolve. That is what makes the element drop-in: a consumer
 * with a script tag and a custom element gets working icons without knowing
 * where dist/images/ ended up.
 */

/**
 * Whether a face named `icon` is already registered on this document.
 *
 * This is the whole idempotence mechanism, and it covers both routes below
 * because a face declared by injected CSS lands in `doc.fonts` just as a
 * constructed one does (asserted in styles.spec.js -- it is the reason a
 * separate WeakSet guard was removed as dead weight rather than kept for
 * appearances). It also means a consumer who already linked
 * content-tools-content.css pays nothing here.
 *
 * FontFaceSet is not iterable in every engine, hence the try: failing to
 * detect an existing face costs a harmless duplicate, so this degrades the
 * right way.
 */
function alreadyRegistered(doc: Document): boolean {
    try {
        for (const face of doc.fonts as unknown as Iterable<FontFace>) {
            if (String(face.family).replace(/['"]/g, '') === 'icon') {
                return true;
            }
        }
    } catch {
        /* not iterable here; fall through and register */
    }
    return false;
}

/**
 * Register the icon font on `doc`, once.
 *
 * Idempotent, and deliberately never undone: a font registration is cheap,
 * and removing it on teardown would blank the icons of an element that is
 * reconnecting in the same tick.
 */
export function ensureIconFont(doc: Document): void {
    if (alreadyRegistered(doc)) {
        return;
    }

    const src = `url("${iconFont}")`;
    // Read FontFace off the document's own window: an element inside an
    // <iframe> has a different realm, and a face constructed in this one
    // cannot be added to that document's FontFaceSet.
    const view = doc.defaultView as (Window & typeof globalThis) | null;

    if (view && typeof view.FontFace === 'function' && doc.fonts) {
        const face = new view.FontFace('icon', src, {
            weight: 'normal',
            style: 'normal'
        });
        doc.fonts.add(face);
        // document.fonts.check() reports false until the face has actually
        // been requested, so load it eagerly -- this is the same idiom the
        // visual suite uses to tell a real glyph from a tofu box. A data URI
        // cannot realistically fail, but an unhandled rejection would be
        // noise either way.
        face.load().catch(() => { /* nothing useful to do */ });
        return;
    }

    // No FontFace constructor: fall back to a <style> element. The attribute
    // is the idempotence marker for anyone inspecting the page.
    const style = doc.createElement('style');
    style.setAttribute('data-content-tools', 'icon-font');
    style.textContent =
        `@font-face{font-family:'icon';src:${src};` +
        'font-weight:normal;font-style:normal}';
    (doc.head || doc.documentElement).appendChild(style);
}
