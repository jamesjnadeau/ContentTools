/* Back-compat surface test.
 *
 * The golden master checks behaviour; this checks that the public API still
 * EXISTS after bundling. Tree-shaking removes things silently, so the two
 * known traps are asserted directly rather than inferred.
 */
describe('published surface (IIFE build)', () => {

    it('registers exactly 21 tools', () => {
        // Tool registration is a side effect of evaluating tool class bodies.
        // A bundler that decides those classes are unused drops them with no
        // build error -- ToolShelf.fetch() then throws at runtime. This count
        // is the canary.
        const names = Object.keys(ContentTools.ToolShelf._tools).sort();
        expect(names).toHaveLength(21);
        expect(names).toEqual([
            'align-center', 'align-left', 'align-right', 'bold', 'heading',
            'image', 'indent', 'italic', 'line-break', 'link', 'ordered-list',
            'paragraph', 'preformatted', 'redo', 'remove', 'subheading',
            'table', 'undo', 'unindent', 'unordered-list', 'video'
        ]);
    });

    it('every default tool resolves through ToolShelf.fetch()', () => {
        for (const group of ContentTools.DEFAULT_TOOLS) {
            for (const name of group) {
                expect(() => ContentTools.ToolShelf.fetch(name)).not.toThrow();
            }
        }
    });

    it('config assigned by consumers is honoured', () => {
        // ContentTools is a plain object, so these are property writes rather
        // than ESM bindings -- which is exactly why they survive the module
        // conversion. Asserted so a future refactor to named exports cannot
        // break the contract quietly.
        const uploader = () => {};
        ContentTools.IMAGE_UPLOADER = uploader;
        expect(ContentTools.IMAGE_UPLOADER).toBe(uploader);
        ContentTools.IMAGE_UPLOADER = null;

        ContentTools.RESTRICTED_ATTRIBUTES['blockquote'] = ['cite'];
        expect(ContentTools.RESTRICTED_ATTRIBUTES['blockquote']).toEqual(['cite']);
        delete ContentTools.RESTRICTED_ATTRIBUTES['blockquote'];

        ContentTools.CANCEL_MESSAGE = 'custom';
        expect(ContentTools.CANCEL_MESSAGE).toBe('custom');
    });

    it('attaches the five browser globals', () => {
        for (const name of ['FSM', 'HTMLString', 'ContentSelect', 'ContentEdit', 'ContentTools']) {
            expect(window[name], name).toBeTruthy();
        }
    });

    it('exposes the documented integration contract', () => {
        const app = ContentTools.EditorApp.get();
        for (const m of ['init', 'start', 'stop', 'save', 'revert', 'busy',
                         'regions', 'orderedRegions', 'addEventListener', 'destroy']) {
            expect(typeof app[m], `EditorApp.${m}`).toBe('function');
        }
        for (const cls of ['FlashUI', 'StylePalette', 'Style', 'Event', 'History',
                           'HTMLCleaner', 'ToolShelf', 'Tool', 'EditorApp']) {
            expect(ContentTools[cls], cls).toBeTruthy();
        }
        expect(typeof ContentEdit.addTranslations).toBe('function');
        expect(typeof ContentEdit._).toBe('function');
    });
});
