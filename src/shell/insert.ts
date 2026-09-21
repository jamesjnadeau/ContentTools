/* Putting an image that is already in the repository into the open entry.
 *
 * This is the one place the shell reaches into the EDITOR's model rather
 * than talking to the element through its attributes and events, and it is
 * worth saying why there is no cheaper way.
 *
 * Copying a markdown link to the clipboard for the author to paste does
 * not work: the editor is a WYSIWYG surface, so `![](/images/x.png)`
 * pasted into it is six words of literal text and a picture that never
 * appears -- a failure the author only discovers when the site builds.
 * Writing an `<img>` into the region's DOM directly is worse: ContentEdit
 * holds its own tree beside the DOM, and a node it does not know about is
 * silently dropped by the next save.
 *
 * So the image is built as a `ContentEdit.Image` and attached the way the
 * image tool attaches one.
 *
 * The two namespaces are imported the way `src/scripts/tools/image.ts`
 * imports them -- the namespace MODULES, not `../index.js`. That is not a
 * detour around `test/browser/shell/imports.spec.js`, it is the same
 * thing that spec is protecting: `src/index.ts` is one of the four
 * entries of the `esm` build, and an entry another entry imports becomes
 * a Rollup facade whose body moves into a shared chunk. These are the
 * same two objects, reached without naming an entry, and they cost
 * `dist/shell.js` nothing because the editor element already brought
 * them in.
 *
 * What populates them is worth saying, because it is what bit the
 * element in 7d: `ContentEdit.Image` and `ContentTools.Tool` are attached
 * to these objects by other modules, so a file that imported ONLY these
 * two would see empty namespaces. Here that cannot happen twice over --
 * `content-tools-cms.ts` statically imports the editor element, which
 * imports `../index.js` and therefore everything, and nothing below is
 * read until somebody presses Insert, which needs a mounted editor.
 *
 * The Milestone 1 obligation is unchanged in the direction that matters:
 * nothing below the shell imports the shell, and the editor's contract
 * still ends at `ct-saved`. This is a consumer using the library.
 */
import ContentEdit from '../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../scripts/namespace.js';

export interface InsertableImage {
    /** What the entry will reference. Already a repository-relative URL. */
    url: string;
    /**
     * The image's natural size, as the browser measured it.
     *
     * Required, and the caller must not guess: `ContentEdit.Image` divides
     * by the width to get an aspect ratio, so a zero produces an Infinity
     * that survives every later calculation and lands in the saved
     * `height` attribute.
     */
    size: [number, number];
    /**
     * Alt text. The filename, which is what the uploader uses -- a
     * placeholder the author is meant to replace rather than a claim that
     * it is a good description.
     */
    alt: string;
}

/**
 * Insert `image` into `regionName`, after the caret. False if it could not.
 *
 * False rather than a throw: the reachable reasons are all "the editor is
 * not there any more" -- a teardown that raced the click, an entry closed
 * between the render and the press -- and none of them is worth an alert
 * over. The caller says nothing happened.
 */
export function insertImage(regionName: string, image: InsertableImage): boolean {
    /* `current()` rather than `get()`. `get()` CONSTRUCTS a fresh dormant
       app when there is none, so a click arriving after teardown would
       build an editor nobody can see and attach the image to it -- which
       reports success and produces nothing. */
    const app = ContentTools.EditorApp.current();
    const region = app?.regions()?.[regionName];
    if (!region) {
        return false;
    }

    const node = new ContentEdit.Image({
        src: image.url,
        alt: image.alt,
        width: image.size[0],
        height: image.size[1]
    });

    /* Where the caret is, if it is in this region. ContentEdit does not
       blur on a click outside the content, so the element the author was
       last in is still reported here even though they have since clicked
       a button in the shell's shadow root -- which is exactly the
       behaviour the toolbox relies on.

       The containment check is not ceremony: `focused()` is process-wide
       and survives across entries in a way an editor instance does not,
       so without it an image could be attached to the region of an entry
       that has already been closed. */
    const focused = ContentEdit.Root.get().focused();
    const inRegion = focused
        && (focused.closest((n: {type(): string}) => n.type() === 'Region') === region);

    if (inRegion) {
        /* The editor's own rule for where an inserted block goes, asked
           through the editor's own function. Writing the climb-to-the-
           region-level-ancestor walk again here is how the media library
           and the image tool come to disagree about where an image lands
           inside a list -- the same argument that collapsed the create
           link and the create route onto one `refuseCreate`. The
           underscore is noted: it is private by convention, and a second
           copy of the rule is the worse of the two options. */
        const [at, index] = ContentTools.Tool._insertAt(focused);
        at.parent().attach(node, index);
    } else {
        /* No caret, or a caret somewhere else: the end of the entry. An
           author who opened the media library before typing anything gets
           the image at the bottom, which is somewhere they can see it and
           move it, rather than nowhere. */
        region.attach(node, region.children.length);
    }

    /* Focused, so the next insert goes after this one and so the author
       can see where it landed. It also makes the image the thing a
       subsequent keystroke acts on, which is what the image tool does. */
    node.focus();
    return true;
}
