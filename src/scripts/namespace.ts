import {rootContext} from '../core/root-context.js';
import type {ContentToolsNamespace} from '../core/namespaces.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// The literal below is deliberately incomplete: sibling modules attach the
// classes as they load. The assertion states that contract, which is what
// lets every other module see the full member list.
const ContentTools = {

    // Secondary namespace to store a common set of tools
    Tools: {},

    // Global settings

    // The message displayed to user's when we want them to confirm there changes
    // are cancelled.
    CANCEL_MESSAGE: `\
Your changes have not been saved, do you really want to lose them?\
`.trim(),

    // The default tool configuration for the editor
    DEFAULT_TOOLS: [
        [
            'bold',
            'italic',
            'link',
            'align-left',
            'align-center',
            'align-right'
        ], [
            'heading',
            'subheading',
            'paragraph',
            'unordered-list',
            'ordered-list',
            'table',
            'indent',
            'unindent',
            'line-break'
        ], [
            'image',
            'video',
            'preformatted'
        ], [
            'undo',
            'redo',
            'remove'
        ]
    ],

    // Default sizes for new videos when inserted into a region
    DEFAULT_VIDEO_HEIGHT: 300,
    DEFAULT_VIDEO_WIDTH: 400,

    // If the user holds down the shift key for an extended period of time the
    // editor app will highlight the editable regions on the page (if there are
    // any). This setting determines how long the user must hold down the shift
    // key to activate highlighting.
    HIGHLIGHT_HOLD_DURATION: 2000,

    // If specified this should be a function that accepts an
    // `ContentTools.ImageDialog` instance, typically the function then binds a
    // set of handlers to specific dialog events to implement support for
    // uploading images asynchronously.
    IMAGE_UPLOADER: null,

    // When a user pastes HTML content into the page if that content consists
    // of purely inline tags then we attempt to insert as a line in the
    // existing content and not as a list of additional paragraphs. The
    // following is a list of tags considered inline.
    INLINE_TAGS: [
        'a',
        'address',
        'b',
        'code',
        'del',
        'em',
        'i',
        'ins',
        'span',
        'strong',
        'sup',
        'u'
    ],

    // A list of element class names ignored by the inspector, typically because
    // attributes cannot be safely set against them.
    INSPECTOR_IGNORED_ELEMENTS: [
        'Fixture',
        'ListItemText',
        'Region',
        'TableCellText'
        ],

    // The minimum region that can be selected when cropping an image (in pixels)
    MIN_CROP: 10,

    // A map of restricted attributes (attributes which can't be viewed or
    // modified in the properties dialog) in the form:
    //
    // `{tagName: [attributeNames], ...}`
    //
    // Attribute and tag names must be specified in lower case.
    //
    // '*' is a special case tag name any attributes defined against it will be
    // restricted for all tags.
    //
    RESTRICTED_ATTRIBUTES: {
        '*': ['style'],
        'img': [
            'height',
            'src',
            'width',
            'data-ce-max-width',
            'data-ce-min-width'
            ],
        'iframe': ['height', 'width']
        },

    // Utility functions

    getEmbedVideoURL(url) {
        // Utility method to validate/parse video URLs and return a valid embed
        // URL. Supports YouTube and Vimeo URLs.
        let id, m;
        let k, v;
        const domains = {
            'www.youtube.com': 'youtube',
            'youtu.be': 'youtube',
            'vimeo.com': 'vimeo',
            'player.vimeo.com': 'vimeo'
            };

        // Parse the URL into components
        const parser = rootContext().createElement('a');
        parser.href = url;

        const netloc = parser.hostname.toLowerCase();
        let path = parser.pathname;

        // Fix for paths in IE
        if ((path !== null) && (path.substr(0, 1) !== "/")) {
            path = "/" + path;
        }

        const params = {};
        const paramsStr = parser.search.slice(1);

        for (var kv of Array.from<any>(paramsStr.split('&'))) {
            kv = kv.split("=");
            if (kv[0]) {
                params[kv[0]] = kv[1];
            }
        }

        // Convert the URL to a valid embed URL
        switch (domains[netloc]) {
            case 'youtube':
                if (path.toLowerCase() === '/watch') {
                    if (!params['v']) {
                        return null;
                    }
                    id = params['v'];
                    delete params['v'];

                } else {
                    m = path.match(/\/([A-Za-z0-9_-]+)$/i);
                    if (!m) {
                        return null;
                    }
                    id = m[1];
                }

                url = `https://www.youtube.com/embed/${ id }`;

                // Add back any parameters for the URL
                var paramStr = ((() => {
                    const result = [];
                    for (k in params) {
                        v = params[k];
                        result.push(`${ k }=${ v }`);
                    }
                    return result;
                })()).join('&');
                if (paramStr) {
                    url += `?${ paramStr }`;
                }

                return url;
                break;

            case 'vimeo':
                m = path.match(/\/(\w+\/\w+\/){0,1}(\d+)/i);
                if (!m) {
                    return null;
                }

                url = `https://player.vimeo.com/video/${ m[2] }`;

                // Add back any parameters for the URL
                paramStr = ((() => {
                    const result1 = [];
                    for (k in params) {
                        v = params[k];
                        result1.push(`${ k }=${ v }`);
                    }
                    return result1;
                })()).join('&');
                if (paramStr) {
                    url += `?${ paramStr }`;
                }

                return url;
                break;
        }

        return null;
    },

    getHTMLCleaner() {
        // Return the HTML cleaner that will be
        return new ContentTools.HTMLCleaner();
    },

    getRestrictedAtributes(tagName) {
        // Return a list of restricted attributes for the given `tagName`. This
        // will include restricted attributes defined against all tags using '*'
        // as the tag name.
        let restricted = [];
        if (ContentTools.RESTRICTED_ATTRIBUTES[tagName]) {
            restricted = restricted.concat(
                ContentTools.RESTRICTED_ATTRIBUTES[tagName]
                );
        }

        if (ContentTools.RESTRICTED_ATTRIBUTES['*']) {
            restricted = restricted.concat(
                ContentTools.RESTRICTED_ATTRIBUTES['*']
                );
        }

        return restricted;
    },

    getScrollPosition() {
        // Return the current scroll position in a cross-browser compatible
        // way. The branching moved into the RootContext, alongside the rest
        // of the host-environment geometry.
        return rootContext().scrollPosition();
    }
} as unknown as ContentToolsNamespace;

export default ContentTools;
