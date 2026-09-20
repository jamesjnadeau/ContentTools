import {test, expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

/* The stylesheet split, asserted as a partition.
 *
 * One Sass source produces three sheets. content-tools.css is the complete
 * one and must stay exactly what v1.6.16 shipped; content.css and chrome.scss
 * divide it for the custom element -- the rules that must reach the DOCUMENT
 * versus the ones that can live inside the shadow root.
 *
 * "Divide" is the contract worth testing. A rule that lands in neither sheet
 * silently stops applying for element users; a rule in both is a cascade
 * ambiguity waiting to surprise someone. Neither shows up in a screenshot of
 * the light-DOM build, so it is checked structurally here. */

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** Top-level rules as selector -> normalised declarations. */
function rules(css) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const out = new Map();
    let i = 0;
    while (i < css.length) {
        const open = css.indexOf('{', i);
        if (open === -1) break;
        // Walk to the balanced close so nested at-rules (@keyframes) stay whole.
        let depth = 1, j = open + 1;
        while (j < css.length && depth > 0) {
            if (css[j] === '{') depth++;
            else if (css[j] === '}') depth--;
            j++;
        }
        const selector = css.slice(i, open).trim().replace(/\s+/g, ' ');
        if (selector) {
            out.set(selector, css.slice(open + 1, j - 1).trim().replace(/\s+/g, ' '));
        }
        i = j;
    }
    return out;
}

const full = rules(readFileSync(resolve(ROOT, 'dist/content-tools.css'), 'utf8'));
const content = rules(readFileSync(resolve(ROOT, 'dist/content-tools-content.css'), 'utf8'));
/* chrome.scss has no dist artifact -- it ships inlined in the element bundle
   via ?inline -- so compile it here through the same Sass the build uses. */
const chrome = rules(execFileSync('npx', [
    'sass', '--no-source-map', '--quiet', '--style=expanded',
    'src/styles/chrome.scss'
], {cwd: ROOT, encoding: 'utf8'}));

test.describe('stylesheet split', () => {

    test('every rule lands in exactly one half', () => {
        const inBoth = [...content.keys()].filter(sel => chrome.has(sel));
        const inNeither = [...full.keys()]
            .filter(sel => !content.has(sel) && !chrome.has(sel));
        expect({inBoth, inNeither}).toEqual({inBoth: [], inNeither: []});
        expect(content.size + chrome.size).toBe(full.size);
    });

    test('neither half invents a rule the full sheet lacks', () => {
        const extra = [...content.keys(), ...chrome.keys()].filter(sel => !full.has(sel));
        expect(extra).toEqual([]);
    });

    test('declarations are carried across unchanged', () => {
        // Catches an asset path that resolves differently in the subset build,
        // which is the one way these could drift while the selectors match.
        const changed = [...full.entries()]
            .filter(([sel, decls]) => (content.get(sel) ?? chrome.get(sel)) !== decls)
            .map(([sel]) => sel);
        expect(changed).toEqual([]);
    });

    test('the shadow sheet carries no @font-face', () => {
        // @font-face inside a shadow root is ignored in Chromium and WebKit.
        // If it ever migrates here, every toolbox icon becomes a tofu box --
        // and the light-DOM build would still look perfect.
        expect([...chrome.keys()].filter(sel => sel.startsWith('@font-face'))).toEqual([]);
        expect([...content.keys()].filter(sel => sel.startsWith('@font-face'))).toHaveLength(1);
    });

    test('the shadow sheet references no assets', () => {
        // It is inlined as a string, so any url() would resolve against the
        // wrong base. All five assets belong to the document-level sheet.
        const decls = [...chrome.values()].join('\n');
        expect(decls).not.toContain('url(');
        const contentDecls = [...content.values()].join('\n');
        for (const asset of ['icons.woff', 'video.svg', 'drop-horz.svg',
                             'drop-vert-above.svg', 'drop-vert-below.svg']) {
            expect(contentDecls).toContain(asset);
        }
    });
});
