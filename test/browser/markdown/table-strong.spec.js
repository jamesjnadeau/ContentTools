/* Reproduction: `&#xNAN;` in front of bold table cells.
 *
 * vermont-football-officials PR #31 was opened by the in-page editor and
 * rewrote both tables in content/information/becoming-an-official.md,
 * putting `&#xNAN;` before every cell that opens with `**$...`. The
 * fixture here is that file exactly as it was before the save.
 *
 * The chain: `region.html()` pretty-prints a table cell as
 * `<td>\n    <strong>$97.50</strong>\n</td>`; `from-dom.ts` normalises the
 * leading whitespace to '' but keeps the empty text node; and
 * mdast-util-to-markdown, seeing a strong run that opens on punctuation,
 * asks for the character before it to be encoded -- the last character of
 * that empty string, `charCodeAt(-1)`, which is NaN. The mismatch also
 * makes `sameBlock()` call the untouched table changed, so a save that
 * never went near the table still rewrites it.
 */

import {MarkdownDocument} from '../../../src/markdown/document.js';
import {MARKDOWN_PROFILE, HTML_PROFILE} from '../../../src/core/profile.js';

import SOURCE from '../../markdown/regressions/becoming-an-official.md?raw';

let div = null;
let editor = null;

function boot(html) {
    teardown();
    div = document.createElement('div');
    div.setAttribute('class', 'md-editable');
    div.innerHTML = html;
    document.body.appendChild(div);

    editor = ContentTools.EditorApp.get();
    editor.profile(MARKDOWN_PROFILE);
    editor.init('.md-editable');
    editor.start();
    return editor.regions()['0'];
}

function teardown() {
    if (editor) {
        editor.stop(true);
        editor.destroy();
        editor.profile(HTML_PROFILE);
        editor = null;
    }
    if (div && div.parentNode) {
        div.parentNode.removeChild(div);
    }
    div = null;
}

afterEach(teardown);

describe('a bold table cell that opens with punctuation', function() {

    it('survives a save with no edits byte-identical', function() {
        const doc = MarkdownDocument.parse(SOURCE);
        const region = boot(doc.toHTML());
        return expect(doc.update(region.html())).toBe(SOURCE);
    });

    it('is never written as a malformed character reference', function() {
        const doc = MarkdownDocument.parse(SOURCE);
        const region = boot(doc.toHTML());
        return expect(doc.update(region.html())).not.toMatch(/&#(?!\d+;|x[0-9a-f]+;)/i);
    });

    it('stays clean in a minimal table, too', function() {
        const source = '| Game | Fee |\n| --- | --- |\n| Varsity | **$97.50** |\n';
        const doc = MarkdownDocument.parse(source);
        const region = boot(doc.toHTML());
        return expect(doc.update(region.html())).not.toContain('&#xNAN;');
    });
});
