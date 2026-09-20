import ContentTools from '../scripts/index.js';
import ContentEdit from '../../vendor-src/content-edit/scripts/index.js';

/* The three pieces of editor configuration that are process-global, saved
 * and restored around the element's lifetime.
 *
 * None of these are per-instance settings, because in v1.6.x there were no
 * instances: `ContentTools.IMAGE_UPLOADER` is a namespace property,
 * `StylePalette` keeps one static list, and `ContentEdit.LANGUAGE` is a bare
 * string. The element exposes them as properties anyway -- that is the API a
 * custom element is expected to have -- and this module is the honest
 * accounting of what that costs: writing a global on connect, and putting it
 * back on disconnect so the page is as the element found it.
 *
 * Restoring matters more than it looks. A consumer who set
 * `ContentTools.IMAGE_UPLOADER` imperatively before ever adding the element
 * would otherwise find it silently null after the element was removed.
 */

/** What the element can set; anything left undefined is not written. */
export interface GlobalConfig {
    imageUploader?: ((dialog: any) => void) | null;
    stylePalette?: any[] | null;
    uiLang?: string | null;
}

/** Everything this module may write, as it was before the element wrote it. */
export interface GlobalsSnapshot {
    imageUploader: ((dialog: any) => void) | null;
    stylePalette: any[];
    language: string;
}

/** Capture the three globals. Call once, at boot, before applying anything. */
export function snapshotGlobals(): GlobalsSnapshot {
    const palette = (ContentTools.StylePalette as any)._styles;
    return {
        imageUploader: ContentTools.IMAGE_UPLOADER,
        // A copy: StylePalette.add() concatenates onto a new array today, but
        // a snapshot that aliases live state is a bug waiting for the day it
        // mutates in place instead.
        stylePalette: palette ? palette.slice() : [],
        language: ContentEdit.LANGUAGE
    };
}

/**
 * Write the provided settings. Keys left `undefined` are not touched, so
 * setting one property on the element does not clear the other two.
 *
 * `null` IS a write: `el.imageUploader = null` means "no uploader", which is
 * different from never having mentioned it.
 */
export function applyGlobals(config: GlobalConfig): void {
    if (config.imageUploader !== undefined) {
        ContentTools.IMAGE_UPLOADER = config.imageUploader;
    }
    if (config.stylePalette !== undefined) {
        setStylePalette(config.stylePalette);
    }
    if (config.uiLang !== undefined && config.uiLang) {
        ContentEdit.LANGUAGE = config.uiLang;
    }
}

/** Put all three back. */
export function restoreGlobals(snapshot: GlobalsSnapshot): void {
    ContentTools.IMAGE_UPLOADER = snapshot.imageUploader;
    (ContentTools.StylePalette as any)._styles = snapshot.stylePalette.slice();
    ContentEdit.LANGUAGE = snapshot.language;
}

/**
 * Replace the style palette rather than extend it.
 *
 * `StylePalette.add()` is the only public way in and it is append-only --
 * there is no `remove` and no `clear` -- so an element that applied its
 * palette on every connect would end up with the same styles listed two,
 * three, four times in the properties dialog. Assigning `_styles` is
 * reaching past the API, and is the reason this lives in one file with the
 * lease rather than being scattered through the element.
 */
export function setStylePalette(styles: any[] | null): void {
    (ContentTools.StylePalette as any)._styles = styles ? styles.slice() : [];
}
