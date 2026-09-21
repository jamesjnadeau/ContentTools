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
    /** Without the dot. */
    readonly extension: string;
    /** Filename template for new entries. Expanded by the shell, not here. */
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
        /* A leading dot is the natural way to write this and means the same
           thing, so accept it rather than rejecting a config that is right
           in every way a reader would care about. */
        extension: optionalStr(input.extension, `${path}.extension`, DEFAULT_EXTENSION).replace(/^\./, ''),
        slug: optionalStr(input.slug, `${path}.slug`, DEFAULT_SLUG),
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
