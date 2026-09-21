/* Runtime configuration: which repository this deployment edits.
 *
 * The requirement this exists for is one build deployed alongside many
 * sites, each configured at runtime for the single repo it serves. So the
 * config is data, not code: a site drops a `cms.config.yml` next to its
 * pages and nothing is rebuilt.
 *
 * `parseConfig` is the contract and `loadConfig` is the convenience. Keeping
 * them apart matters more than it looks -- a shell that builds its config in
 * JavaScript, a test with a literal, and a site with a YAML file all want
 * the same validation, and only one of them wants a fetch.
 *
 * Parsing NORMALISES: every optional field comes back filled in, so nothing
 * downstream has to remember which defaults apply. `CmsConfig` is what a
 * consumer reads; `CmsConfigInput` is what they may write.
 */

/** Thrown for anything wrong with a config, naming where. */
export class ConfigError extends Error {
    /** Dotted path to the offending value, e.g. `collections[2].folder`. */
    readonly path: string;

    constructor(path: string, message: string) {
        super(path ? `${path}: ${message}` : message);
        this.name = 'ConfigError';
        this.path = path;
    }
}

export interface BackendConfig {
    /** `owner/name`. */
    readonly repo: string;
    /** The branch entries are read from and pull requests target. */
    readonly branch: string;
    /** REST API root, without a trailing slash. */
    readonly apiBase: string;
}

export interface MediaConfig {
    /** Repository path uploads are committed to, e.g. `static/images`. */
    readonly folder: string;
    /** What the content references them by, e.g. `/images`. */
    readonly publicPath: string;
}

/** One choice in a `select` field. */
export interface FieldOption {
    readonly value: string;
    readonly label: string;
}

/**
 * One frontmatter field.
 *
 * Validated here and rendered by the shell's widgets. `widget` is an
 * unconstrained string on purpose: a site may register its own, so an
 * allowlist here would make that a fork of the build rather than a line of
 * config. The shell's answer to a name it does not know is a read-only
 * control that says so, never a text box -- silently editing a `relation`
 * as text is how garbage gets written into somebody's data model.
 */
export interface Field {
    readonly name: string;
    readonly label: string;
    readonly widget: string;
    readonly required: boolean;
    /**
     * The choices a `select` offers. Empty for every other widget.
     *
     * Required for `select` and checked HERE rather than at render time,
     * because an empty dropdown looks like a loading bug and a config
     * error looks like a config error.
     */
    readonly options: readonly FieldOption[];
    /**
     * What a NEW entry starts this field at. `undefined` for none.
     *
     * Applied when an entry is created (M5-5) and deliberately not when
     * one is opened: filling a missing key in on open would turn every
     * save of an existing file into a frontmatter rewrite, which is the
     * whole-file diff this project exists to avoid.
     */
    readonly default: unknown;
}

/** Many entries under one folder, one file each. */
export interface FolderCollection {
    readonly kind: 'folder';
    readonly name: string;
    readonly label: string;
    readonly folder: string;
    /** Whether the shell may add entries to it. */
    readonly create: boolean;
    /**
     * Whether the shell may remove entries from it.
     *
     * Separate from `create` and defaulting to false on its own. They are
     * not two halves of one permission: a collection an author adds to
     * every week may still be one nobody should be able to take a page
     * out of, and deriving the second from the first would grant that
     * silently the moment somebody turned on the first.
     */
    readonly delete: boolean;
    /** Without the dot. */
    readonly extension: string;
    /**
     * Filename template for new entries, e.g. `{{year}}-{{slug}}`.
     *
     * Validated at parse time and expanded by `expandSlug`. Both live
     * here, and the second is the reason the first can be strict: a
     * template nothing rejects is a template the shell silently writes
     * into a filename, and `{{Year}}` -- which is not a token, because
     * the tokens are lower case -- would arrive in the repository
     * spelled exactly like that.
     */
    readonly slug: string;
    readonly fields: readonly Field[];
}

/** A fixed set of named files, each edited in place. */
export interface FileCollection {
    readonly kind: 'file';
    readonly name: string;
    readonly label: string;
    readonly files: readonly FileEntry[];
}

export interface FileEntry {
    readonly name: string;
    readonly label: string;
    readonly file: string;
    readonly fields: readonly Field[];
}

export type Collection = FolderCollection | FileCollection;

export interface CmsConfig {
    readonly backend: BackendConfig;
    readonly media: MediaConfig;
    readonly collections: readonly Collection[];
}

/** What a config file may contain: everything but the required keys is optional. */
export type CmsConfigInput = Record<string, unknown>;

const DEFAULT_BRANCH = 'main';
const DEFAULT_API_BASE = 'https://api.github.com';
const DEFAULT_EXTENSION = 'md';
const DEFAULT_SLUG = '{{slug}}';

/**
 * The names a `slug` template may use.
 *
 * Deliberately four. Every one of them is answerable at the moment an
 * entry is created from the title and the clock, with nothing else to
 * consult -- which is what lets the filename be decided, shown to the
 * author, and checked for a collision before anything is written. A token
 * naming a FIELD would move that decision to after the form is filled in,
 * so the name the author was shown and the name the file gets could
 * differ.
 */
export const SLUG_TOKENS: readonly string[] = Object.freeze(
    ['slug', 'year', 'month', 'day']);

/**
 * Anything written as a token, known or not.
 *
 * One pattern for BOTH the check and the expansion, which is the whole
 * reason it is a constant. A looser check than the expansion accepts
 * lets a typo through to be written literally into a filename; a
 * stricter one rejects a config that would have worked. They cannot
 * disagree if there is only one of them.
 *
 * `[^{}]*` rather than a lazy `.*?` is intent, not behaviour: with the
 * stray-brace check below, no template that survives parsing can tell
 * the two apart, and every template that could is refused by both. It
 * stays because it says what a token may contain.
 */
const SLUG_TOKEN = /\{\{([^{}]*)\}\}/g;

// --- reading untyped input ------------------------------------------------

function object(value: unknown, path: string): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new ConfigError(path, 'expected an object');
    }
    return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new ConfigError(path, 'expected an array');
    }
    return value;
}

/** A required non-empty string. */
function str(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new ConfigError(path, 'expected a non-empty string');
    }
    return value;
}

/** An optional string, defaulted when absent. Present-but-wrong still throws. */
function optionalStr(value: unknown, path: string, fallback: string): string {
    return value === undefined || value === null ? fallback : str(value, path);
}

function optionalBool(value: unknown, path: string, fallback: boolean): boolean {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value !== 'boolean') {
        throw new ConfigError(path, 'expected true or false');
    }
    return value;
}

// --- normalising ----------------------------------------------------------

/** Trim the slashes a hand-written path picks up, so joins are predictable. */
function trimSlashes(value: string): string {
    return value.replace(/^\/+|\/+$/g, '');
}

/**
 * The choices for a `select`, in either spelling.
 *
 * `[draft, published]` is what a person writes in YAML and
 * `[{value: draft, label: Draft}]` is what they write when the stored
 * value and the visible one differ. Accepting only the second would make
 * the common case the verbose one for no gain.
 */
function parseOptions(value: unknown, path: string): FieldOption[] {
    return array(value, path).map((raw, i) => {
        const at = `${path}[${i}]`;
        if (typeof raw === 'string') {
            return Object.freeze({value: raw, label: raw});
        }
        const option = object(raw, at);
        const optionValue = str(option.value, `${at}.value`);
        return Object.freeze({
            value: optionValue,
            label: optionalStr(option.label, `${at}.label`, optionValue)
        });
    });
}

function parseFields(value: unknown, path: string): Field[] {
    if (value === undefined || value === null) {
        return [];
    }
    return array(value, path).map((raw, i) => {
        const at = `${path}[${i}]`;
        const field = object(raw, at);
        const name = str(field.name, `${at}.name`);
        const widget = optionalStr(field.widget, `${at}.widget`, 'string');
        const hasOptions = field.options !== undefined && field.options !== null;
        /* A `select` with nothing to select from is the one field shape
           that fails as a blank control rather than as an error, so it is
           refused at parse time where the message can name the line. */
        if (widget === 'select' && !hasOptions) {
            throw new ConfigError(`${at}.options`, 'is required for a `select` field');
        }
        const options = hasOptions ? parseOptions(field.options, `${at}.options`) : [];
        if (widget === 'select' && options.length === 0) {
            throw new ConfigError(`${at}.options`, 'is empty');
        }
        return Object.freeze({
            name,
            label: optionalStr(field.label, `${at}.label`, name),
            widget,
            required: optionalBool(field.required, `${at}.required`, false),
            options: Object.freeze(options),
            default: field.default
        });
    });
}

/**
 * A `slug` template, checked.
 *
 * Every rule here names a failure that is invisible once the file is
 * written: a template the shell expands into a name nobody asked for, or
 * into a path the listing will then refuse to show.
 */
function slugTemplate(raw: unknown, path: string): string {
    const template = optionalStr(raw, path, DEFAULT_SLUG);

    /* A slug is ONE path segment. `{{year}}/{{slug}}` produces
       `content/blog/2026/hello.md`, which `slugFromPath` correctly
       refuses to read back as an entry of this collection -- so the
       author creates a page and watches it vanish from the list. It also
       makes `../` unwritable, which is worth having for its own sake. */
    if (template.includes('/')) {
        throw new ConfigError(
            path, `"${template}" contains "/"; a slug names one file, not a path`);
    }

    const used = new Set<string>();
    for (const [, name] of template.matchAll(SLUG_TOKEN)) {
        const token = name.trim();
        if (!SLUG_TOKENS.includes(token)) {
            throw new ConfigError(
                path,
                `"{{${name}}}" is not a slug token; expected one of `
                + SLUG_TOKENS.map(t => `{{${t}}}`).join(', '));
        }
        used.add(token);
    }

    /* A brace nothing above accounted for. `{{slug}}-{draft}` passes
       every check so far -- it has its `{{slug}}`, and the single-braced
       word is not a token at all, so no rule looks at it -- and then
       every file the collection ever creates is called
       `hello-{draft}.md`. Nobody connects that to the config, because
       the config looks like it worked. */
    const rest = template.replace(SLUG_TOKEN, '');
    if (/[{}]/.test(rest)) {
        throw new ConfigError(
            path,
            `"${template}" has a brace that is not part of a token;`
            + ' a token is written {{slug}}');
    }

    /* Without `{{slug}}` the template says the same thing for every
       entry, so the second one an author writes this year collides with
       the first and the shell refuses to create it. That refusal names
       the file, which is a true statement about a config nobody will
       connect to it -- so the config is what says so. */
    if (!used.has('slug')) {
        throw new ConfigError(
            path,
            `"${template}" has no {{slug}}, so every new entry would be named the same`);
    }
    return template;
}

function parseCollection(raw: unknown, path: string): Collection {
    const input = object(raw, path);
    const name = str(input.name, `${path}.name`);
    const label = optionalStr(input.label, `${path}.label`, name);

    /* `folder` and `files` are what distinguish the two kinds, so a
       collection carrying both is ambiguous rather than merely redundant --
       there is no way to guess which the author meant, and guessing would
       silently ignore half of what they wrote. */
    const hasFolder = input.folder !== undefined && input.folder !== null;
    const hasFiles = input.files !== undefined && input.files !== null;
    if (hasFolder && hasFiles) {
        throw new ConfigError(path, 'has both `folder` and `files`; a collection is one or the other');
    }
    if (!hasFolder && !hasFiles) {
        throw new ConfigError(path, 'needs either `folder` or `files`');
    }

    if (hasFiles) {
        const files = array(input.files, `${path}.files`).map((rawFile, i) => {
            const at = `${path}.files[${i}]`;
            const file = object(rawFile, at);
            const fileName = str(file.name, `${at}.name`);
            return Object.freeze({
                name: fileName,
                label: optionalStr(file.label, `${at}.label`, fileName),
                file: trimSlashes(str(file.file, `${at}.file`)),
                fields: Object.freeze(parseFields(file.fields, `${at}.fields`))
            });
        });
        if (files.length === 0) {
            throw new ConfigError(`${path}.files`, 'is empty');
        }
        return Object.freeze({kind: 'file' as const, name, label, files: Object.freeze(files)});
    }

    return Object.freeze({
        kind: 'folder' as const,
        name,
        label,
        folder: trimSlashes(str(input.folder, `${path}.folder`)),
        create: optionalBool(input.create, `${path}.create`, false),
        delete: optionalBool(input.delete, `${path}.delete`, false),
        /* A leading dot is the natural way to write this and means the same
           thing, so accept it rather than rejecting a config that is right
           in every way a reader would care about. */
        extension: optionalStr(input.extension, `${path}.extension`, DEFAULT_EXTENSION).replace(/^\./, ''),
        slug: slugTemplate(input.slug, `${path}.slug`),
        fields: Object.freeze(parseFields(input.fields, `${path}.fields`))
    });
}

/**
 * Validate and normalise a config.
 *
 * Every error names its path. That is the whole point of this function: a
 * typo in a hand-edited config file is the most likely failure a site
 * operator will ever hit, and `undefined is not a function` three frames
 * later in the git client is not an answer to it.
 */
export function parseConfig(input: CmsConfigInput): CmsConfig {
    const root = object(input, '');

    const backend = object(root.backend, 'backend');
    const repo = str(backend.repo, 'backend.repo');
    /* Checked rather than split-and-hoped: `owner/name/extra` and a bare
       `name` both produce a URL that 404s, and a 404 from the API reads as
       "no such repository" rather than "your config is wrong". */
    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
        throw new ConfigError('backend.repo', `expected "owner/name", got "${repo}"`);
    }

    const media = object(root.media, 'media');

    const collections = array(root.collections, 'collections')
        .map((raw, i) => parseCollection(raw, `collections[${i}]`));
    if (collections.length === 0) {
        throw new ConfigError('collections', 'is empty');
    }

    const seen = new Set<string>();
    for (const collection of collections) {
        if (seen.has(collection.name)) {
            throw new ConfigError('collections', `duplicate collection name "${collection.name}"`);
        }
        seen.add(collection.name);
    }

    return Object.freeze({
        backend: Object.freeze({
            repo,
            branch: optionalStr(backend.branch, 'backend.branch', DEFAULT_BRANCH),
            apiBase: optionalStr(backend.apiBase, 'backend.apiBase', DEFAULT_API_BASE)
                .replace(/\/+$/, '')
        }),
        media: Object.freeze({
            folder: trimSlashes(str(media.folder, 'media.folder')),
            /* Kept leading-slash-as-written: `/images` and `images` mean
               different things in a document, and normalising would change
               what the published markdown says. */
            publicPath: str(media.publicPath, 'media.publicPath').replace(/\/+$/, '')
        }),
        collections: Object.freeze(collections)
    });
}

/**
 * Fetch and parse a config file.
 *
 * JSON is parsed natively; anything else goes through `yaml`, which is
 * imported dynamically so that a JSON-configured site never downloads a
 * YAML parser. JSON is a subset of YAML, so the order only affects cost.
 */
export async function loadConfig(
    url: string,
    options: {fetch?: typeof globalThis.fetch} = {}
): Promise<CmsConfig> {
    const get = options.fetch ?? globalThis.fetch;
    const response = await get(url);
    if (!response.ok) {
        throw new ConfigError('', `could not load ${url}: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        const {parse} = await import('yaml');
        try {
            data = parse(text);
        } catch (error) {
            throw new ConfigError('', `${url} is neither JSON nor YAML: ${(error as Error).message}`);
        }
    }
    return parseConfig(data as CmsConfigInput);
}

// --- paths ----------------------------------------------------------------

/** The named collection, or null. */
export function findCollection(config: CmsConfig, name: string): Collection | null {
    return config.collections.find(c => c.name === name) ?? null;
}

/** Where an entry of this collection lives. */
export function entryPath(collection: Collection, slug: string): string {
    if (collection.kind === 'file') {
        const entry = collection.files.find(f => f.name === slug);
        if (!entry) {
            throw new ConfigError(`collections.${collection.name}`, `has no file named "${slug}"`);
        }
        return entry.file;
    }
    return `${collection.folder}/${slug}.${collection.extension}`;
}

/**
 * The fields declared for one entry of a collection.
 *
 * Here rather than in the shell because a file collection declares them
 * per FILE, so the lookup is the same one `entryPath` does -- and two
 * places that resolve a slug to a file are two places that can disagree
 * about which file an entry is.
 */
export function fieldsFor(collection: Collection, slug: string): readonly Field[] {
    if (collection.kind === 'file') {
        return collection.files.find(f => f.name === slug)?.fields ?? [];
    }
    return collection.fields;
}

/**
 * The ASCII, URL-safe form of a piece of text.
 *
 * ONE rule, shared by the name an uploaded image gets and the name a new
 * entry gets. Two spellings of it would put `uber-uns.png` beside
 * `ueber-uns.md` in the same repository for the same two words, and
 * neither would look wrong on its own.
 *
 * Comes back EMPTY for text with no ASCII form at all -- a title written
 * in Chinese, say -- rather than guessing at one. The callers differ in
 * what they do about that, which is why this does not decide: an upload
 * falls back to a filename, and the shell refuses to create the entry and
 * asks for a name it can use.
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        /* Accents come off rather than being replaced: `ünïcode` is
           `unicode`, not `n-code`, and a European title is not an edge
           case. */
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * The filename stem a new entry gets, from its title and the clock.
 *
 * Pure, and the date is a parameter rather than read here, for the
 * reason every date in this project is: a function that asks the clock
 * cannot be asserted about, and a filename is the one thing about an
 * entry nobody can change afterwards without breaking its URL.
 */
export function expandSlug(collection: FolderCollection, title: string, at: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    const values: Record<string, string> = {
        slug: slugify(title),
        /* The AUTHOR's calendar day, not UTC's. Somebody writing at nine
           in the evening in Berlin files a post under the day they wrote
           it, which is the date they will later look for it under -- and
           under UTC a third of their evenings would be filed under the
           day before. */
        year: String(at.getFullYear()),
        month: pad(at.getMonth() + 1),
        day: pad(at.getDate())
    };
    /* Every token here is known, because `parseConfig` refused the
       template otherwise. That is the point of checking it there: this
       cannot produce `{{Year}}-hello`, and there is no fallback here
       whose behaviour anybody would have to guess at. */
    return collection.slug.replace(SLUG_TOKEN, (_, name: string) => values[name.trim()]);
}

/** The slug a repository path corresponds to, or null if it is not one. */
export function slugFromPath(collection: Collection, path: string): string | null {
    if (collection.kind === 'file') {
        return collection.files.find(f => f.file === path)?.name ?? null;
    }
    const prefix = `${collection.folder}/`;
    const suffix = `.${collection.extension}`;
    if (!path.startsWith(prefix) || !path.endsWith(suffix)) {
        return null;
    }
    const slug = path.slice(prefix.length, path.length - suffix.length);
    /* A file in a SUBfolder is not an entry of this collection. Without
       this the shell would list it, and saving it would write to a path
       `entryPath()` can never produce. */
    return slug === '' || slug.includes('/') ? null : slug;
}

/** Where an uploaded file is committed. */
export function mediaPath(config: CmsConfig, filename: string): string {
    return `${config.media.folder}/${filename}`;
}

/** What the content references that file by. */
export function mediaURL(config: CmsConfig, filename: string): string {
    return `${config.media.publicPath}/${filename}`;
}
