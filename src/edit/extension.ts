/* A site's own tools, on the in-page editor.
 *
 * `dist/edit.js` builds its editor itself, from a `<script>` tag with
 * nothing to configure it, so a site that wants a tool of its own has no
 * element to set `tools` on and no `init()` to call before. This is that
 * seam: the page declares a plain object on `window` BEFORE the script
 * runs, and the surface reads it as it builds the editor.
 *
 *     <script>
 *       window.contentToolsEdit = {
 *         setup({ContentTools}) { ...stow a tool... },
 *         allowTools: ['my-tool']
 *       };
 *     </script>
 *     <script type="module" src="/cms/edit.js"></script>
 *
 * THE LIBRARY IS HANDED OVER, not imported by the page. `edit.js` pulls
 * the editor in behind a dynamic `import()` so a reader downloads none of
 * it, which means there is no `ContentTools` for the page to reach until
 * somebody is editing -- and a copy the page imported on its own would be
 * a second module instance whose `ToolShelf` the toolbox never looks at.
 * So `setup` is called with the instance the editor is about to use.
 *
 * This module sits behind that same dynamic import, beside `./surface.ts`,
 * and `./index.ts` only ever imports its TYPES.
 */

import {PROFILES, allowTools} from '../core/profile.js';
/* The CLASS module, for the same reason `./session.ts` gives -- and the
   library through it rather than from `../index.js`, which is a sibling
   build entry and off limits here. */
import {LIBRARY} from '../element/content-tools-editor.js';
import type {ContentToolsEditor} from '../element/content-tools-editor.js';

const {ContentTools} = LIBRARY;

/** What `setup` is handed: the instances the editor will use. */
export interface EditorLibrary {
    readonly ContentTools: any;
    readonly ContentEdit: any;
    readonly HTMLString: any;
}

/** `window.contentToolsEdit`. Every key is optional. */
export interface EditExtension {
    /**
     * Stow tools, add styles to the palette, anything that needs the
     * library. Called once per extension object, before the toolbox is
     * built; a returned promise is waited for, so a tool can live in a
     * module of its own and be `import()`ed here.
     */
    setup?(library: EditorLibrary): void | Promise<void>;

    /**
     * The toolbox layout, `DEFAULT_TOOLS`-shaped. Left out, the default
     * layout is used, with any `allowTools` added as a group of their own
     * at the end -- so naming a tool once is enough to see it.
     */
    tools?: readonly (readonly string[])[];

    /**
     * Tool names the markdown constraint should let through.
     *
     * The in-page editor is always in markdown mode, which allows the 17
     * built-in tools it knows and drops every other name. Listing a name
     * here is the site saying its tool writes only what markdown can
     * hold -- see `docs/custom-tools.md` for what that means.
     */
    allowTools?: readonly string[];

    /**
     * CSS for the toolbox, most often a tool's icon. The toolbox is drawn
     * in the editor's shadow root, where the page's own stylesheets do not
     * reach. See `ContentToolsEditor.adoptStyles` for how a string is
     * read.
     */
    styles?: string | CSSStyleSheet | readonly (string | CSSStyleSheet)[];
}

/* Once per object rather than once per editor: a stow is idempotent, but
   a `setup` that also adds to the style palette is not, and nothing says
   the surface is only ever opened once. */
const setUp = new WeakSet<object>();

/**
 * Put `extension` onto an editor that is built and NOT yet connected.
 *
 * Throws, with a sentence that names the key, for anything it cannot use.
 * The surface catches it and puts it on the bar -- which is where an
 * operator will see it, rather than as an exception out of a toolbox
 * that is only built when somebody presses the switch.
 */
export async function extend(
        editor: ContentToolsEditor,
        extension: EditExtension | null | undefined): Promise<void> {
    if (extension === null || extension === undefined) {
        return;
    }
    if (typeof extension !== 'object') {
        throw new Error('contentToolsEdit must be an object.');
    }

    if (extension.setup !== undefined) {
        if (typeof extension.setup !== 'function') {
            throw new Error('contentToolsEdit.setup must be a function.');
        }
        if (!setUp.has(extension)) {
            setUp.add(extension);
            await extension.setup(LIBRARY);
        }
    }

    const allowed = names(extension.allowTools, 'contentToolsEdit.allowTools');
    if (allowed.length) {
        editor.profile = allowTools(PROFILES[editor.mode], allowed);
    }

    let tools: string[][] | null = null;
    if (extension.tools !== undefined) {
        if (!Array.isArray(extension.tools)) {
            throw new Error('contentToolsEdit.tools must be an array of arrays of tool names.');
        }
        tools = extension.tools.map(
            (group, i) => names(group, `contentToolsEdit.tools[${i}]`));
    } else if (allowed.length) {
        tools = [...ContentTools.DEFAULT_TOOLS, allowed];
    }

    if (tools) {
        /* Checked NOW, because the toolbox is not built until the switch
           is pressed, and `ToolShelf.fetch` throwing from inside a click
           handler is an editor that silently fails to open. */
        for (const group of tools) {
            for (const name of group) {
                try {
                    ContentTools.ToolShelf.fetch(name);
                } catch {
                    throw new Error(
                        `\`${name}\` is in the toolbox but nothing stowed it on `
                        + 'the tool shelf. Stow it in contentToolsEdit.setup.');
                }
            }
        }
        editor.tools = tools;
    }

    const styles = extension.styles;
    for (const sheet of Array.isArray(styles) ? styles : [styles]) {
        if (sheet !== undefined && sheet !== null) {
            editor.adoptStyles(sheet);
        }
    }
}

/** A list of tool names, or a sentence about what it was instead. */
function names(value: unknown, where: string): string[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value) || !value.every(name => typeof name === 'string')) {
        throw new Error(`${where} must be an array of tool names.`);
    }
    return [...value];
}
