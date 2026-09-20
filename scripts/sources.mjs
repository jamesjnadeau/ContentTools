/* The build order of every source unit.
 *
 * Each "unit" compiles to one IIFE, mirroring how these libraries were
 * originally built and concatenated. Order is load-bearing twice over: within
 * a unit because CoffeeScript's `join` puts every file in one shared closure
 * and base classes must precede subclasses; between units because each library
 * reads the previous one's global.
 *
 * Recorded from the upstream Gruntfiles -- see vendor-src/UPSTREAM.md.
 */

/** Already-compiled JS prepended verbatim; it has no CoffeeScript source. */
export const PREAMBLE = ['vendor-src/html-string/fsm.js'];

export const UNITS = [
    {
        name: 'html-string',
        dir: 'vendor-src/html-string',
        files: ['namespace', 'strings', 'tags', 'characters']
    },
    {
        name: 'content-select',
        dir: 'vendor-src/content-select',
        files: ['content-select']
    },
    {
        name: 'content-edit',
        dir: 'vendor-src/content-edit/scripts',
        files: ['namespace', 'tag-names', 'bases', 'regions', 'fixtures', 'root',
                'static', 'text', 'images', 'videos', 'lists', 'tables']
    },
    {
        name: 'content-tools',
        dir: 'src/scripts',
        files: [
            'namespace',
            // UI
            'ui/ui', 'ui/events', 'ui/flashes', 'ui/ignition', 'ui/inspector',
            'ui/modal', 'ui/toolbox',
            // UI - Dialogs
            'ui/dialogs/dialogs', 'ui/dialogs/image', 'ui/dialogs/link',
            'ui/dialogs/properties', 'ui/dialogs/table', 'ui/dialogs/video',
            // Other
            'clean-html', 'editor', 'history', 'styles', 'tools'
        ]
    }
];
