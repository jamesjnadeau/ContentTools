/**
 * Shapes of the four library namespace objects.
 *
 * Each library creates one object and its sibling modules hang classes off it
 * (`ContentEdit.Text = class ...`). TypeScript infers the bare object literal,
 * so without these declarations every cross-module member access is an error
 * -- 2,814 of them, which is 97% of the errors the conversion started with.
 *
 * Constants are typed properly because they are declared inline and their
 * types are obvious and useful. The classes are `unknown`-free `any` for now:
 * they are defined in other modules, and importing them here would make the
 * namespace module circular with everything that uses it. They get tightened
 * per directory as Phase 5 ratchets, which is the whole point of declaring
 * the member list up front -- assigning an undeclared member is already an
 * error, so typos cannot slip through while the types are still loose.
 */

/** A class attached to a namespace, not yet given a precise type. */
type NamespaceClass = any;

export interface HTMLStringNamespace {
    Character: NamespaceClass;
    String: NamespaceClass;
    Tag: NamespaceClass;
}

export interface ContentSelectNamespace {
    Range: NamespaceClass;
}

export interface FSMNamespace {
    Machine: NamespaceClass;
}

export interface ContentEditNamespace {
    // Settings
    ALIGNMENT_CLASS_NAMES: {left: string; right: string};
    DEFAULT_MAX_ELEMENT_WIDTH: number;
    DEFAULT_MIN_ELEMENT_WIDTH: number;
    DRAG_HOLD_DURATION: number;
    DROP_EDGE_SIZE: number;
    ENABLE_DRAG_CLONING: boolean;
    HELPER_CHAR_LIMIT: number;
    INDENT: string;
    LANGUAGE: string;
    LINE_ENDINGS: string;
    PREFER_LINE_BREAKS: boolean;
    RESIZE_CORNER_SIZE: number;
    TRIM_WHITESPACE: boolean;

    // Strictly increasing modification stamp; see Node.taint().
    _lastModifiedStamp: number;
    _nextModifiedStamp: () => number;

    // Helpers
    _: (s: string) => string;
    _translations: Record<string, Record<string, string>>;
    addTranslations: (language: string, translations: Record<string, string>) => void;
    addCSSClass: (domElement: Element, className: string) => void;
    removeCSSClass: (domElement: Element, className: string) => void;
    attributesToString: (attributes: Record<string, unknown>) => string;

    // Element classes
    Element: NamespaceClass;
    ElementCollection: NamespaceClass;
    Fixture: NamespaceClass;
    Image: NamespaceClass;
    ImageFixture: NamespaceClass;
    List: NamespaceClass;
    ListItem: NamespaceClass;
    ListItemText: NamespaceClass;
    Node: NamespaceClass;
    NodeCollection: NamespaceClass;
    PreText: NamespaceClass;
    Region: NamespaceClass;
    ResizableElement: NamespaceClass;
    Root: NamespaceClass;
    Static: NamespaceClass;
    Table: NamespaceClass;
    TableCell: NamespaceClass;
    TableCellText: NamespaceClass;
    TableRow: NamespaceClass;
    TableSection: NamespaceClass;
    TagNames: NamespaceClass;
    Text: NamespaceClass;
    Video: NamespaceClass;
}

export interface ContentToolsNamespace {
    // Settings consumers reassign. These are plain properties rather than
    // module exports precisely so that `ContentTools.IMAGE_UPLOADER = fn`
    // keeps working; see the surface test.
    CANCEL_MESSAGE: string;
    DEFAULT_TOOLS: string[][];
    DEFAULT_VIDEO_HEIGHT: number;
    DEFAULT_VIDEO_WIDTH: number;
    HIGHLIGHT_HOLD_DURATION: number;
    IMAGE_UPLOADER: ((dialog: any) => void) | null;
    INLINE_TAGS: string[];
    INSPECTOR_IGNORED_ELEMENTS: string[];
    MIN_CROP: number;
    RESTRICTED_ATTRIBUTES: Record<string, string[]>;

    // Secondary namespace holding the registered tools
    Tools: Record<string, NamespaceClass>;

    // Helpers
    getEmbedVideoURL: (url: string) => string | null;
    getHTMLCleaner: () => any;
    getRestrictedAtributes: (tagName: string, attributes?: Record<string, unknown>) => string[];
    getScrollPosition: () => [number, number];

    // UI + editor classes
    AnchoredComponentUI: NamespaceClass;
    AnchoredDialogUI: NamespaceClass;
    ComponentUI: NamespaceClass;
    DialogUI: NamespaceClass;
    EditorApp: NamespaceClass;
    Event: NamespaceClass;
    FlashUI: NamespaceClass;
    HTMLCleaner: NamespaceClass;
    History: NamespaceClass;
    IgnitionUI: NamespaceClass;
    ImageDialog: NamespaceClass;
    InspectorUI: NamespaceClass;
    LinkDialog: NamespaceClass;
    ModalUI: NamespaceClass;
    PropertiesDialog: NamespaceClass;
    Style: NamespaceClass;
    StylePalette: NamespaceClass;
    TableDialog: NamespaceClass;
    TagUI: NamespaceClass;
    Tool: NamespaceClass;
    ToolShelf: NamespaceClass;
    ToolUI: NamespaceClass;
    ToolboxUI: NamespaceClass;
    VideoDialog: NamespaceClass;
    WidgetUI: NamespaceClass;
}
