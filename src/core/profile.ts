/**
 * Constraint profiles.
 *
 * A profile answers "what may this editor produce?". The default profile
 * answers "anything v1.6.16 could", which is why every consulting site falls
 * through to its existing behaviour when the profile is `HTML_PROFILE` -- HTML
 * mode is a no-op, and that is gated by the golden master rather than assumed.
 *
 * The markdown profile answers "only what markdown can express", which is what
 * makes serializing a region a total function instead of a lossy best effort.
 *
 * Two properties of this module are deliberate and load-bearing:
 *
 * - It has NO imports. The custom element applies a profile synchronously in
 *   `connectedCallback` from a `mode` attribute, so it cannot await a dynamic
 *   import, and the markdown serializer (which does pull in mdast) must stay
 *   out of the default bundle.
 * - A profile is plain frozen data, not behaviour. It is carried per
 *   `EditorApp` instance rather than stored globally, so de-singletoning the
 *   app in Milestone 2b needs no change here.
 */

/** A per-tag map of the attribute names a profile permits. */
export type AttributeWhitelist = Readonly<Record<string, readonly string[]>>;

export interface ConstraintProfile {
    /** Identifies the profile; reflected by the element's `mode` attribute. */
    readonly name: string;

    /**
     * Tool names the toolbox may offer, or `null` for every registered tool.
     * Groups are filtered rather than replaced (see `filterToolGroups`) so a
     * consumer's own grouping survives being constrained.
     */
    readonly tools: ReadonlySet<string> | null;

    /** Tag names paste may produce, or `null` for `HTMLCleaner`'s default. */
    readonly tags: readonly string[] | null;

    /**
     * Of those, the ones that are meaningful with no children. The cleaner
     * deletes childless elements by default, so `img`, `hr` and `br` need
     * naming here as well as in `tags` to survive a paste.
     */
    readonly voidTags: readonly string[] | null;

    /** Attributes paste and the properties dialog permit, or `null`. */
    readonly attributes: AttributeWhitelist | null;

    /** Whether the properties dialog offers the CSS-class tab. */
    readonly styles: boolean;

    /** Whether the properties dialog offers the raw-HTML tab. */
    readonly coding: boolean;

    /** Whether images may be given explicit width and height. */
    readonly resize: boolean;

    /**
     * Whether a table may have head and foot sections. GFM tables require a
     * header row and have no footer at all, so markdown mode forces the one
     * and forbids the other.
     */
    readonly tableSections: boolean;

    /**
     * Whether a `ContentEdit.Static` element may be dragged to a new
     * position.
     *
     * A static element is ContentEdit's fallback for DOM it has no
     * editable class for. In markdown mode that is always a construct
     * markdown can express and this editor cannot -- a shortcode, a raw
     * HTML block, a footnote definition -- and its bytes are spliced back
     * from the source rather than re-serialized, so it has to stay where
     * they came from.
     */
    readonly moveStatics: boolean;
}

/** Everything v1.6.16 allowed. The default, and a pure no-op. */
export const HTML_PROFILE: ConstraintProfile = Object.freeze({
    name: 'html',
    tools: null,
    tags: null,
    voidTags: null,
    attributes: null,
    styles: true,
    coding: true,
    resize: true,
    tableSections: true,
    moveStatics: true
});

/**
 * The tags CommonMark and GFM can express, and nothing else.
 *
 * Against `HTMLCleaner.DEFAULT_TAG_WHITELIST` this drops `address`, `ins`,
 * `sup`, `u` and `tfoot` -- none of which markdown can write -- and adds `br`,
 * `hr` and `img`, which it can and which the default list omits because the
 * v1.6.16 paste path never wanted them.
 */
const MARKDOWN_TAGS: readonly string[] = Object.freeze([
    '#text',
    'a',
    'b',
    'blockquote',
    'br',
    'code',
    'del',
    'em',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    'strong',
    'table',
    'tbody',
    'td',
    'th',
    'thead',
    'tr',
    'ul'
]);

/**
 * `colspan` is absent deliberately: GFM tables are a fixed grid. `align` is
 * present because GFM does encode per-column alignment, in the delimiter row.
 */
const MARKDOWN_ATTRIBUTES: AttributeWhitelist = Object.freeze({
    'a': Object.freeze(['href', 'title']),
    'img': Object.freeze(['src', 'alt', 'title']),
    'td': Object.freeze(['align']),
    'th': Object.freeze(['align'])
});

/**
 * The 17 tools of the 21 that survive the constraint.
 *
 * Dropped: `align-left`, `align-center` and `align-right`, which write a CSS
 * class markdown cannot carry, and `video`, which is an `<iframe>` embed.
 */
const MARKDOWN_TOOLS: ReadonlySet<string> = Object.freeze(new Set([
    'bold',
    'heading',
    'image',
    'indent',
    'italic',
    'line-break',
    'link',
    'ordered-list',
    'paragraph',
    'preformatted',
    'redo',
    'remove',
    'subheading',
    'table',
    'undo',
    'unindent',
    'unordered-list'
])) as ReadonlySet<string>;

export const MARKDOWN_PROFILE: ConstraintProfile = Object.freeze({
    name: 'markdown',
    tools: MARKDOWN_TOOLS,
    tags: MARKDOWN_TAGS,
    voidTags: Object.freeze(['br', 'hr', 'img']),
    attributes: MARKDOWN_ATTRIBUTES,
    styles: false,
    coding: false,
    resize: false,
    tableSections: false,
    moveStatics: false
});

/** The profiles the element's `mode` attribute can name. */
export const PROFILES: Readonly<Record<string, ConstraintProfile>> = Object.freeze({
    html: HTML_PROFILE,
    markdown: MARKDOWN_PROFILE
});

/**
 * Filter a `DEFAULT_TOOLS`-shaped grouped list down to what the profile
 * allows, dropping any group left empty so the toolbox does not render a
 * separator with nothing after it.
 */
export function filterToolGroups(
    profile: ConstraintProfile,
    groups: string[][]
): string[][] {
    const allowed = profile.tools;
    if (!allowed) {
        return groups;
    }

    const filtered = [];
    for (const group of groups) {
        const kept = group.filter((name) => allowed.has(name));
        if (kept.length) {
            filtered.push(kept);
        }
    }
    return filtered;
}

/**
 * A copy of `profile` that also allows the tools named in `names`.
 *
 * For a consumer's own tool -- something stowed on `ContentTools.ToolShelf`
 * under a name no built-in profile knows -- which `filterToolGroups` would
 * otherwise drop without a word. A profile with no tool allow-list already
 * allows everything, so it comes back as it is.
 *
 * Only the TOOL list widens. Paste, the properties dialog and the tag
 * allow-list are untouched, and in markdown mode that is the point: the
 * tool is trusted to produce only what the serializer can write, and
 * everything else stays constrained. The name gets a suffix so a widened
 * profile never passes for the built-in one it came from.
 */
export function allowTools(
    profile: ConstraintProfile,
    names: Iterable<string>
): ConstraintProfile {
    if (!profile.tools) {
        return profile;
    }
    const tools = new Set(profile.tools);
    const added = [];
    for (const name of names) {
        if (!tools.has(name)) {
            tools.add(name);
            added.push(name);
        }
    }
    if (!added.length) {
        return profile;
    }
    return Object.freeze({
        ...profile,
        name: `${profile.name}+${added.join('+')}`,
        tools: Object.freeze(tools) as ReadonlySet<string>
    });
}

/**
 * The attribute names that must be hidden from the properties dialog for
 * `tagName`, given the deny-list the dialog already applies.
 *
 * A profile carries an allow-list, which is the complement of what the dialog
 * understands; converting here rather than teaching the dialog a second
 * filtering mode keeps one code path in the dialog and one concept in the
 * profile. `present` is the element's current attribute names -- an allow-list
 * can only deny what is actually there.
 */
export function restrictedAttributes(
    profile: ConstraintProfile,
    tagName: string,
    present: Iterable<string>,
    alreadyRestricted: readonly string[]
): string[] {
    if (!profile.attributes) {
        return alreadyRestricted.slice();
    }

    const permitted = profile.attributes[tagName.toLowerCase()] || [];
    const denied = alreadyRestricted.slice();
    for (const name of present) {
        const lower = name.toLowerCase();
        if (permitted.indexOf(lower) === -1 && denied.indexOf(lower) === -1) {
            denied.push(lower);
        }
    }
    return denied;
}
