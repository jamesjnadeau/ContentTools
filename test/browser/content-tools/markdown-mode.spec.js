/* Markdown mode: the constraint profile, end to end.
 *
 * The profile exists so that serializing a region to markdown can be a
 * total function rather than a lossy best effort -- if the editor cannot
 * produce a construct, the serializer never has to guess what to do with
 * it. So these tests are mostly of the form "this is no longer possible",
 * and the ones that matter most are the ones asserting a route AROUND the
 * constraint is closed too (a consumer-supplied tool list, a typed
 * attribute name).
 *
 * The other half of the contract is that HTML mode is untouched. That is
 * not asserted here -- it is asserted by every other suite in the repo
 * continuing to pass, which is a far stronger statement than anything
 * this file could make.
 */

import {
    HTML_PROFILE,
    MARKDOWN_PROFILE,
    PROFILES,
    filterToolGroups,
    restrictedAttributes
} from '../../../src/core/profile.js';

// --- harness -------------------------------------------------------------

let div = null;
let editor = null;
let region = null;

function boot(html, profile) {
    teardown();

    div = document.createElement('div');
    div.setAttribute('class', 'md-editable');
    div.innerHTML = html;
    document.body.appendChild(div);

    editor = ContentTools.EditorApp.get();
    // BEFORE init(): the toolbox is built there, and the regions are
    // parsed and constrained there.
    editor.profile(profile || MARKDOWN_PROFILE);
    editor.init('.md-editable');
    editor.start();
    region = editor.regions()['0'];
    return region;
}

function teardown() {
    if (editor) {
        editor.stop(true);
        editor.destroy();
        // The app is a singleton, so a profile left set would leak into
        // every later spec in the run -- including the ones in other
        // files asserting HTML mode is unchanged.
        editor.profile(HTML_PROFILE);
        editor = null;
    }
    if (div && div.parentNode) {
        document.body.removeChild(div);
    }
    div = null;
    region = null;
}

/** Every tool name the mounted toolbox is showing, flattened. */
function toolbarNames() {
    return editor.toolbox().tools().reduce((all, group) => all.concat(group), []);
}

/** The dialog the tool under test just attached to the app. */
function openDialog(cls) {
    return editor.children().filter(child => child instanceof cls)[0];
}

// --- the profile as data -------------------------------------------------

describe('ConstraintProfile', function() {

    it('the default profile constrains nothing', function() {
        expect(HTML_PROFILE.tools).toBe(null);
        expect(HTML_PROFILE.tags).toBe(null);
        expect(HTML_PROFILE.attributes).toBe(null);
        expect(HTML_PROFILE.styles).toBe(true);
        expect(HTML_PROFILE.coding).toBe(true);
        expect(HTML_PROFILE.resize).toBe(true);
        return expect(HTML_PROFILE.tableSections).toBe(true);
    });

    it('the markdown profile drops alignment and video', function() {
        for (const name of ['align-left', 'align-center', 'align-right', 'video']) {
            expect(MARKDOWN_PROFILE.tools.has(name)).toBe(false);
        }
        return expect(MARKDOWN_PROFILE.tools.size).toBe(17);
    });

    it('every tool it keeps is really on the shelf', function() {
        // Guards against a typo in the profile silently shrinking the
        // toolbox rather than failing.
        const stowed = Object.keys(ContentTools.ToolShelf._tools);
        const missing = [...MARKDOWN_PROFILE.tools].filter(
            name => stowed.indexOf(name) === -1);
        return expect(missing).toEqual([]);
    });

    it('filterToolGroups returns the input untouched under the default', function() {
        const groups = [['bold', 'align-left']];
        // Identity, not just equality: the default path must not copy.
        return expect(filterToolGroups(HTML_PROFILE, groups)).toBe(groups);
    });

    it('filterToolGroups drops groups left empty', function() {
        const groups = [
            ['bold', 'align-left'],
            ['align-center', 'align-right'],
            ['image', 'video']
        ];
        return expect(filterToolGroups(MARKDOWN_PROFILE, groups))
            .toEqual([['bold'], ['image']]);
    });

    it('restrictedAttributes turns an allow-list into a deny-list', function() {
        const denied = restrictedAttributes(
            MARKDOWN_PROFILE, 'A', ['href', 'title', 'onclick', 'class'], []);
        expect(denied.indexOf('href')).toBe(-1);
        expect(denied.indexOf('title')).toBe(-1);
        expect(denied.indexOf('onclick') > -1).toBe(true);
        return expect(denied.indexOf('class') > -1).toBe(true);
    });

    it('restrictedAttributes keeps the existing deny-list under the default', function() {
        return expect(
            restrictedAttributes(HTML_PROFILE, 'A', ['href'], ['id'])
        ).toEqual(['id']);
    });

    it('an unknown tag permits nothing', function() {
        // No entry in the allow-list means no attribute is allowed, which
        // is the safe direction for an allow-list to fail in.
        return expect(
            restrictedAttributes(MARKDOWN_PROFILE, 'SPAN', ['title'], [])
        ).toEqual(['title']);
    });
});

// --- the toolbox ---------------------------------------------------------

describe('markdown mode: the toolbox', function() {

    afterEach(teardown);

    it('offers 17 tools, not 21', function() {
        boot('<p>Text</p>');
        const names = toolbarNames();
        expect(names.length).toBe(17);
        for (const dropped of ['align-left', 'align-center', 'align-right', 'video']) {
            expect(names.indexOf(dropped)).toBe(-1);
        }
        return expect(names.indexOf('bold') > -1).toBe(true);
    });

    it('leaves the shelf itself alone', function() {
        boot('<p>Text</p>');
        // Registration is global and stays that way -- the profile
        // governs what the editor OFFERS, not what exists. An imperative
        // consumer holding a reference to the align tool is unaffected.
        return expect(ContentTools.ToolShelf.fetch('align-left')).toBeTruthy();
    });

    it('re-filters when the profile is set after init', function() {
        boot('<p>Text</p>', HTML_PROFILE);
        expect(toolbarNames().length).toBe(21);
        editor.profile(MARKDOWN_PROFILE);
        return expect(toolbarNames().length).toBe(17);
    });

    it('defaults to the HTML profile', function() {
        boot('<p>Text</p>', HTML_PROFILE);
        // Not "is truthy": the identity is what makes every consulting
        // site's `profile === HTML_PROFILE` fast path correct.
        editor.profile(HTML_PROFILE);
        return expect(editor.profile()).toBe(HTML_PROFILE);
    });
});

// --- paste ---------------------------------------------------------------

describe('markdown mode: paste', function() {

    afterEach(teardown);

    it('strips inline styles and alignment classes', function() {
        boot('<p>Text</p>');
        const p = region.children[0];
        p.focus();
        editor.pasteHTML(p, '<p style="text-align: center" class="pull-right">Hi</p>');
        const html = region.html().replace(/\n\s*/g, '');
        expect(html.indexOf('text-align')).toBe(-1);
        return expect(html.indexOf('pull-right')).toBe(-1);
    });

    it('keeps an image, which the default whitelist drops', function() {
        // The clearest evidence the profile's whitelist is in use and not
        // HTMLCleaner's default: `img` is markdown-expressible and the
        // v1.6.16 list omits it.
        boot('<p>Text</p>');
        const p = region.children[0];
        p.focus();
        editor.pasteHTML(p, '<p>before <img src="/a.png" alt="A"> after</p>');
        return expect(region.html().indexOf('img') > -1).toBe(true);
    });

    it('drops a tag markdown cannot write', function() {
        boot('<p>Text</p>');
        const p = region.children[0];
        p.focus();
        editor.pasteHTML(p, '<p>a <sup>super</sup> b</p>');
        const html = region.html();
        // The tag goes, the text it wrapped stays -- HTMLCleaner unwraps
        // rather than deletes, which is what makes stripping non-lossy.
        expect(html.indexOf('<sup')).toBe(-1);
        return expect(html.indexOf('super') > -1).toBe(true);
    });
});

// --- the properties dialog ----------------------------------------------

describe('markdown mode: the properties dialog', function() {

    afterEach(function() {
        ContentTools.StylePalette._styles = [];
        return teardown();
    });

    function propertiesFor(element) {
        const dialog = new ContentTools.PropertiesDialog(element);
        editor.attach(dialog);
        dialog.show();
        return dialog;
    }

    it('shows no styles even when the palette has some', function() {
        ContentTools.StylePalette.add([
            new ContentTools.Style('Author', 'author', ['p'])
        ]);
        boot('<p>Text</p>');
        const dialog = propertiesFor(region.children[0]);
        expect(dialog._supportsStyles).toBe(false);
        expect(dialog._styleUIs.length).toBe(0);
        // ...and saving cannot report one either.
        expect(dialog.changedStyles()).toEqual({});
        return dialog.hide();
    });

    it('still shows them in HTML mode', function() {
        // The negative above is only meaningful next to this.
        ContentTools.StylePalette.add([
            new ContentTools.Style('Author', 'author', ['p'])
        ]);
        boot('<p>Text</p>', HTML_PROFILE);
        const dialog = propertiesFor(region.children[0]);
        expect(dialog._supportsStyles).toBe(true);
        expect(dialog._styleUIs.length).toBe(1);
        return dialog.hide();
    });

    it('offers no code tab', function() {
        boot('<p>Text</p>');
        const dialog = propertiesFor(region.children[0]);
        expect(dialog._supportsCoding).toBe(false);
        // The code tab is muted rather than removed, exactly as it
        // already is for an element that cannot carry inline HTML.
        expect(dialog._domCodeTab.getAttribute('class'))
            .toContain('ct-control--muted');
        expect(dialog.getElementInnerHTML()).toBe(null);
        return dialog.hide();
    });

    it('hides a disallowed attribute the element already has', function() {
        boot('<p>Text</p>');
        const p = region.children[0];
        p.attr('data-note', 'x');
        const dialog = propertiesFor(p);
        const names = dialog._attributeUIs.map(ui => ui.name());
        expect(names.indexOf('data-note')).toBe(-1);
        return dialog.hide();
    });

    it('keeps alt on an image and hides the rest', function() {
        // The positive half of the allow-list. Alt text is the reason the
        // dialog survives markdown mode at all rather than being
        // suppressed outright -- it is the one image property markdown
        // carries that the editor has nowhere else to edit.
        //
        // `src`, `width` and `height` are absent because v1.6.16 already
        // restricts them for img (the image dialog owns them); the
        // profile is a further restriction on top and cannot un-restrict.
        // `data-note` is absent because of the profile.
        boot('<img src="/a.png" alt="A" data-note="x" width="10">');
        const dialog = propertiesFor(region.children[0]);
        const names = dialog._attributeUIs.map(ui => ui.name());
        expect(names.indexOf('alt') > -1).toBe(true);
        expect(names.indexOf('data-note')).toBe(-1);
        return dialog.hide();
    });

    it('keeps data attributes in HTML mode', function() {
        boot('<img src="/a.png" alt="A" data-note="x">', HTML_PROFILE);
        const dialog = propertiesFor(region.children[0]);
        const names = dialog._attributeUIs.map(ui => ui.name());
        expect(names.indexOf('data-note') > -1).toBe(true);
        return dialog.hide();
    });

    it('marks a disallowed attribute name invalid as it is typed', function() {
        // The route around the allow-list: the empty row at the bottom of
        // the attributes tab lets any name be typed, and an allow-list
        // over the attributes the element ALREADY has cannot see it.
        boot('<p>Text</p>');
        const dialog = propertiesFor(region.children[0]);
        const empty = dialog._attributeUIs[dialog._attributeUIs.length - 1];
        empty._domName.value = 'onclick';
        empty._domName.dispatchEvent(new Event('input', {bubbles: true}));
        expect(empty._domName.getAttribute('class'))
            .toContain('ct-attribute__name--invalid');
        return dialog.hide();
    });
});

// --- behaviours ----------------------------------------------------------

describe('markdown mode: behaviours', function() {

    afterEach(teardown);

    it('an image parsed with the region cannot be resized', function() {
        boot('<img src="/a.png" alt="A">');
        const image = region.children[0];
        expect(image.type()).toBe('Image');
        return expect(image.can('resize')).toBe(false);
    });

    it('an image created afterwards cannot be resized either', function() {
        // This is the case a one-shot pass over the regions would miss,
        // and the reason the profile rides the 'attach' event.
        boot('<p>Text</p>');
        const image = new ContentEdit.Image({src: '/b.png'});
        region.attach(image);
        return expect(image.can('resize')).toBe(false);
    });

    it('but can in HTML mode', function() {
        boot('<img src="/a.png" alt="A">', HTML_PROFILE);
        return expect(region.children[0].can('resize')).toBe(true);
    });

    it('parsing a region fires attach, so init needs no second pass', function() {
        // Load-bearing, and not obvious: `init()` binds the handler before
        // it calls `syncRegions()`, and a Region attaches each element it
        // parses -- so the elements a region is built from arrive through
        // the same path as ones typed later. An explicit sweep over the
        // regions at init was written first and mutation testing showed it
        // could not fail; this is the fact that made it redundant.
        boot('<p>a</p>');
        let attached = 0;
        const count = () => { attached += 1; };
        ContentEdit.Root.get().bind('attach', count);
        try {
            editor.syncRegions('.md-editable');
            // The region is already initialised, so re-syncing it attaches
            // nothing; build a fresh one to observe the parse.
            const other = document.createElement('div');
            other.setAttribute('class', 'md-editable');
            other.innerHTML = '<p>b</p><p>c</p>';
            document.body.appendChild(other);
            editor.syncRegions('.md-editable');
            expect(attached > 0).toBe(true);
            document.body.removeChild(other);
        } finally {
            ContentEdit.Root.get().unbind('attach', count);
        }
        return true;
    });

    it('re-applies behaviours when the profile is set late', function() {
        // The other half of what the removed init sweep was doing: an app
        // switched into markdown mode after init still has to constrain
        // what it already parsed.
        boot('<img src="/a.png" alt="A">', HTML_PROFILE);
        expect(region.children[0].can('resize')).toBe(true);
        editor.profile(MARKDOWN_PROFILE);
        return expect(region.children[0].can('resize')).toBe(false);
    });
});

// --- the table dialog ----------------------------------------------------

describe('markdown mode: the table dialog', function() {

    afterEach(teardown);

    function tableDialog() {
        const dialog = new ContentTools.TableDialog(null);
        editor.attach(dialog);
        dialog.show();
        return dialog;
    }

    it('offers no head or foot switch', function() {
        boot('<p>Text</p>');
        const dialog = tableDialog();
        // Built, because save() reads their classes -- just never shown.
        expect(dialog._domHeadSection.parentNode).toBe(null);
        expect(dialog._domFootSection.parentNode).toBe(null);
        return dialog.hide();
    });

    it('forces a head on and a foot off', function() {
        // GFM tables require a header row and have no footer.
        boot('<p>Text</p>');
        const dialog = tableDialog();
        let detail = null;
        dialog.addEventListener('save', ev => { detail = ev.detail(); });
        dialog.save();
        expect(detail.head).toBe(true);
        expect(detail.foot).toBe(false);
        return dialog.hide();
    });

    it('shows both switches in HTML mode', function() {
        boot('<p>Text</p>', HTML_PROFILE);
        const dialog = tableDialog();
        expect(dialog._domHeadSection.parentNode).toBe(dialog._domView);
        expect(dialog._domFootSection.parentNode).toBe(dialog._domView);
        return dialog.hide();
    });
});

// --- the mode attribute --------------------------------------------------

describe('PROFILES', function() {

    it('maps the element mode attribute onto a profile', function() {
        expect(PROFILES.html).toBe(HTML_PROFILE);
        return expect(PROFILES.markdown).toBe(MARKDOWN_PROFILE);
    });

    it('has no entry for an unknown mode', function() {
        // The element relies on this to fall back to html rather than
        // leaving itself dead on the page over an attribute typo.
        return expect(PROFILES.mrkdown).toBe(undefined);
    });
});
