/* The bar, and the two things it has to survive: a page written by
   somebody else, and eight answers it must not confuse. */

import {
    BAR_TAG, buildBar, describe as describeState, describeElement
} from '../../../src/edit/chrome.js';

/** What the two controls were asked to do. */
let pressed;

/** A bar on the real document, cleaned up after each test. */
function onPage(handlers = {}) {
    const bar = buildBar(document, {
        submit: () => pressed.push('submit'),
        showFields: open => pressed.push(`fields:${open}`),
        ...handlers
    });
    document.body.appendChild(bar.node);
    return bar;
}

const entry = {collection: 'blog', slug: 'hello'};

/** Nothing has happened yet: no submit, no pull request, no refusal. */
const QUIET = {busy: false, note: '', refused: false, pull: null, conflict: null};

/** A form with one field in it. */
function form(fields = [{name: 'title', label: 'Title', widget: 'string'}]) {
    return {key: 'blog/hello', fields, data: {title: 'Hello'}, refusal: null};
}

/** The editing state, with everything quiet unless a test says otherwise. */
function editing(over = {}) {
    const body = document.createElement('article');
    body.className = 'post';
    return {
        kind: 'editing', entry, selector: 'article.post', body,
        fields: form(), fieldsOpen: false, save: QUIET, ...over
    };
}

beforeEach(function() {
    pressed = [];
});

afterEach(function() {
    for (const node of [...document.querySelectorAll(BAR_TAG)]) {
        node.remove();
    }
    document.body.style.textTransform = '';
    document.body.style.fontFamily = '';
});

describe('describeState', function() {

    it('names the config, not the page, when the config is broken', function() {
        const said = describeState({kind: 'broken', hint: 'collections[0].body: x'});

        expect(said.title).toBe('The CMS config could not be read');
        // Verbatim: the path is the whole value of this message.
        expect(said.hint).toBe('collections[0].body: x');
    });

    it('says an ordinary page is an ordinary page', function() {
        const said = describeState({kind: 'not-an-entry', hint: 'why'});

        expect(said.title).toBe('Not an editable page');
        expect(said.hint).toBe('why');
    });

    it('names the entry when there is one, in the spelling cms:entry uses',
       function() {
        /* `blog/hello`, not "hello in blog" -- it is the string an
           operator would paste into a `<meta name="cms:entry">`. */
        expect(describeState({kind: 'no-body', entry, hint: 'no body'}).title)
            .toBe('blog/hello');
        expect(describeState({
            kind: 'ready', entry, selector: 'main',
            body: document.createElement('main')
        }).title).toBe('blog/hello');
    });

    it('carries the hint for a body it could not find', function() {
        expect(describeState({kind: 'no-body', entry, hint: 'no body'}).hint)
            .toBe('no body');
    });

    it('names the ELEMENT it found, not only the selector', function() {
        /* The point of the ready state. The editor replaces that
           element's children, so `main.layout` where the operator meant
           `article.post` is the difference between editing a post and
           replacing the site's layout with one -- and it is readable
           here, before anybody presses anything. */
        const body = document.createElement('main');
        body.className = 'layout';

        const said = describeState({kind: 'ready', entry, selector: 'main', body});

        expect(said.hint).toBe('Editing main.layout, matched by main.');
    });

    it('names the element while it is editing, in the same words', function() {
        /* The same sentence as `ready`, deliberately: the bar never
           stops at a decision, it reports where the decision LED, and
           somebody reading it a minute later should not have to work
           out which of two spellings means the editor is up. */
        const body = document.createElement('article');
        body.className = 'post';

        const said = describeState({
            kind: 'editing', entry, selector: 'article.post', body
        });

        expect(said.title).toBe('blog/hello');
        expect(said.hint).toBe('Editing article.post, matched by article.post.');
    });

    it('names the element for somebody who is not signed in', function() {
        /* Said in TWO states rather than one, and this is the reason:
           checking a `body` selector is a deployment job, and making
           somebody obtain a token before they can see whether they
           pointed it at the right element makes the check cost an
           afternoon instead of a page load. */
        const body = document.createElement('article');
        body.className = 'post';

        const said = describeState({
            kind: 'signed-out', entry, selector: '.post', body
        });

        expect(said.title).toBe('blog/hello');
        expect(said.hint).toContain('Found article.post, matched by .post.');
        /* And where to go. A credential field on a published page is
           the thing every phishing guide warns about, so the answer is
           a sentence pointing at the admin screens rather than an
           input. */
        expect(said.hint).toContain('admin');
    });

    it('says which version it is reading, while it reads', function() {
        /* "the branch", not "the repository": the surprising part is
           that the words about to replace what is on screen are the
           ones under review rather than the ones this page was built
           from. */
        const said = describeState({
            kind: 'loading', entry, selector: 'article',
            body: document.createElement('article')
        });

        expect(said.title).toBe('blog/hello');
        expect(said.hint).toBe('Reading the version on the branch...');
    });

    it('carries the hint for a read that failed, and still names the entry',
       function() {
        const said = describeState({
            kind: 'failed', entry, selector: 'article',
            body: document.createElement('article'), hint: 'the network said no'
        });

        expect(said.title).toBe('blog/hello');
        expect(said.hint).toBe('the network said no');
    });
});

describe('describeElement', function() {

    it('is selector-shaped, so it is also the answer to the next question',
       function() {
        const el = document.createElement('article');
        el.id = 'post-3';
        el.className = 'prose wide';

        expect(describeElement(el)).toBe('article#post-3.prose.wide');
    });

    it('leaves out what is not there', function() {
        expect(describeElement(document.createElement('main'))).toBe('main');
    });

    it('says the id when there are no classes', function() {
        const el = document.createElement('div');
        el.id = 'content';

        expect(describeElement(el)).toBe('div#content');
    });
});

describe('buildBar', function() {

    it('is a hyphenated tag nobody styles by accident', function() {
        /* The bar's only real defence against the site's own CSS: rules
           in the outer tree beat `:host` rules whatever the specificity,
           so the tag name is what keeps `div {}` and `body > * {}` off
           it. */
        expect(onPage().node.tagName.toLowerCase()).toBe(BAR_TAG);
        expect(BAR_TAG).toContain('-');
    });

    it('puts its chrome in an OPEN shadow root', function() {
        const bar = onPage();

        expect(bar.node.shadowRoot).not.toBe(null);
        expect(bar.node.shadowRoot.querySelector('.ct-edit')).not.toBe(null);
    });

    it('writes nothing into the page it is standing on', function() {
        /* A script that leaves nodes in somebody else's document is a
           script that shows up in their own DOM assertions. */
        const bar = onPage();
        bar.update({kind: 'not-an-entry', hint: 'no'});

        expect(bar.node.childNodes.length).toBe(0);
    });

    it('says nothing about the page until it is told what to say', function() {
        /* Built empty and filled once the config has been fetched, which
           is why the panel is a live region below. The controls are
           built too and carry their own labels -- they are hidden
           rather than wordless, which is asserted where they are. */
        const root = onPage().node.shadowRoot;

        expect(root.querySelector('.ct-edit__title').textContent).toBe('');
        expect(root.querySelector('.ct-edit__hint').textContent).toBe('');
    });

    it('announces itself, because it fills in after the page has settled',
       function() {
        const panel = onPage().node.shadowRoot.querySelector('.ct-edit');

        expect(panel.getAttribute('role')).toBe('status');
    });

    it('puts the state on the panel as a class, and replaces it', function() {
        const bar = onPage();
        const panel = bar.node.shadowRoot.querySelector('.ct-edit');

        bar.update({kind: 'broken', hint: 'x'});
        expect(panel.className).toBe('ct-edit ct-edit--broken');

        /* Replaced, not added: a bar that is both broken and ready is a
           bar reading two rules at once. */
        bar.update({kind: 'not-an-entry', hint: 'y'});
        expect(panel.className).toBe('ct-edit ct-edit--not-an-entry');
    });

    it('shows the title and the hint', function() {
        const bar = onPage();
        bar.update({kind: 'not-an-entry', hint: 'nothing here'});
        const root = bar.node.shadowRoot;

        expect(root.querySelector('.ct-edit__title').textContent)
            .toBe('Not an editable page');
        expect(root.querySelector('.ct-edit__hint').textContent)
            .toBe('nothing here');
    });

    it('keeps its nodes across an update', function() {
        /* The same objects, not equal ones. Rebuilding the panel each
           time would take the live region with it, and an assistive
           technology announces a region it has just been handed rather
           than the change inside one it already had. */
        const bar = onPage();
        const before = bar.node.shadowRoot.querySelector('.ct-edit__title');

        bar.update({kind: 'broken', hint: 'x'});
        bar.update({kind: 'not-an-entry', hint: 'y'});

        expect(bar.node.shadowRoot.querySelector('.ct-edit__title')).toBe(before);
    });

    it('adopts its stylesheet, so the bar is not a run of bare text', function() {
        const bar = onPage();
        const panel = bar.node.shadowRoot.querySelector('.ct-edit');

        expect(bar.node.shadowRoot.adoptedStyleSheets.length).toBe(1);
        expect(getComputedStyle(panel).fontFamily).toContain('arial');
    });

    it('colours a failure as a failure, and a signed-out page not', function() {
        /* Three states need somebody to go and change something and say
           so in the colour this project already uses for a refusal.
           `signed-out` deliberately does not: arriving at a page without
           a token is a thing that simply happens, and colouring the
           ordinary answer as a fault teaches an author to ignore the
           colour. Computed, because the class name alone cannot see
           whether any rule acts on it. */
        const bar = onPage();
        const title = bar.node.shadowRoot.querySelector('.ct-edit__title');
        const body = document.createElement('article');
        const located = {entry, selector: 'article', body};

        bar.update({kind: 'failed', ...located, hint: 'x'});
        const failed = getComputedStyle(title).color;

        bar.update({kind: 'signed-out', ...located});
        expect(getComputedStyle(title).color).not.toBe(failed);
    });

    it('says a read is in flight without animating anything', function() {
        /* Not a spinner: an animation inside a shadow root on somebody's
           published page is motion nobody asked for, and the bar is one
           line that changes twice. */
        const bar = onPage();
        const hint = bar.node.shadowRoot.querySelector('.ct-edit__hint');
        const body = document.createElement('article');

        bar.update({kind: 'loading', entry, selector: 'article', body});

        expect(getComputedStyle(hint).fontStyle).toBe('italic');
        expect(getComputedStyle(hint).animationName).toBe('none');
    });

    it('is pinned to the viewport rather than laid out in the page', function() {
        /* It arrives after the page has rendered. A bar in the flow
           would reflow somebody's site the moment an author loaded it. */
        expect(getComputedStyle(onPage().node).position).toBe('fixed');
    });

    it('is bounded by the viewport, and scrolls rather than running off it',
       function() {
        /* `position: fixed` with no bound is a panel that grows past
           the bottom of the screen: a nine-field form on a 320px bar
           puts its own Submit button somewhere nobody can reach, on a
           page whose scrollbar moves the SITE rather than the bar. */
        const panel = onPage().node.shadowRoot.querySelector('.ct-edit');
        const shown = getComputedStyle(panel);

        expect(shown.maxHeight).not.toBe('none');
        expect(shown.overflowY).toBe('auto');
    });

    it('inherits nothing from the site it is standing on', function() {
        /* Inheritance crosses the shadow boundary through the host, so
           without the reset a site with `text-transform: uppercase` on
           its body shouts every word of this bar -- and a site is not
           wrong to have written that. `text-transform` rather than
           `font-family`, which the panel sets anyway and so would pass
           with the reset gone. */
        document.body.style.textTransform = 'uppercase';
        const panel = onPage().node.shadowRoot.querySelector('.ct-edit');

        expect(getComputedStyle(panel).textTransform).toBe('none');
    });
});

describe('the bar\u2019s editing controls', function() {

    /** The one control each test reaches for. */
    function part(bar, name) {
        return bar.node.shadowRoot.querySelector(`.ct-edit__${name}`);
    }

    it('shows no controls at all until an editor is up', function() {
        /* The bar is on every page of the site. A Submit button on a
           page nobody can edit is a button that either does nothing or
           does something surprising, and `hidden` is checked by its
           computed display because an author `display: flex` outranks
           the UA stylesheet at any specificity -- which cost a whole
           sub-phase under /admin. */
        const bar = onPage();
        bar.update({kind: 'not-an-entry', hint: 'no'});

        expect(getComputedStyle(part(bar, 'actions')).display).toBe('none');
    });

    it('shows them once it is, laid out as a row', function() {
        const bar = onPage();
        bar.update(editing());

        expect(getComputedStyle(part(bar, 'actions')).display).toBe('flex');
    });

    it('still reaches its handler when Details is pressed before a mount',
       function() {
        /* Built with the rest of the bar and hidden, and `hidden` does
           not stop a click reaching a button -- so the press lands on
           a handler that `surface.ts` has nothing to point at yet.
           That is what its holder's `?.` is for: a no-op, rather than
           a TypeError in the console of somebody else's published
           page.

           Submit cannot be pressed here at all, which is the whole
           difference between the two and why only one of them has a
           live guard. */
        const bar = onPage();
        bar.update({kind: 'not-an-entry', hint: 'no'});

        expect(part(bar, 'submit').disabled).toBe(true);
        part(bar, 'submit').click();
        part(bar, 'details').click();

        expect(pressed).toEqual(['fields:true']);
    });

    it('submits when Submit is pressed', function() {
        const bar = onPage();
        bar.update(editing());

        part(bar, 'submit').click();

        expect(pressed).toEqual(['submit']);
    });

    it('refuses a second press while one is in flight', function() {
        /* A second commit built on the same parent IS the conflict, so
           the button would generate the error the panel below it then
           explains. */
        const bar = onPage();
        bar.update(editing({save: {...QUIET, busy: true}}));

        expect(part(bar, 'submit').disabled).toBe(true);
    });

    it('says so on the button itself, not only in the note below it',
       function() {
        /* The button is what somebody is looking at when they wonder
           whether the press registered. */
        const bar = onPage();
        bar.update(editing());
        const before = part(bar, 'submit').textContent;

        bar.update(editing({save: {...QUIET, busy: true}}));
        expect(part(bar, 'submit').textContent).toBe('Submitting\u2026');

        bar.update(editing());
        expect(part(bar, 'submit').textContent).toBe(before);
    });

    it('asks to be shown the form, and to be shown it no longer', function() {
        const bar = onPage();
        bar.update(editing());

        part(bar, 'details').click();
        expect(pressed).toEqual(['fields:true']);

        /* The toggle reads what it is SHOWING, not what the attribute
           says: `getAttribute('aria-expanded') === 'true'` is the same
           answer spelled so a typo makes it silently always-open. */
        bar.update(editing({fieldsOpen: true}));
        part(bar, 'details').click();
        expect(pressed).toEqual(['fields:true', 'fields:false']);
    });

    it('tells a screen reader what the button controls, and its state',
       function() {
        /* The form is below the fold of a bar somebody may have
           scrolled past, so the state on the control is the only thing
           saying that pressing it did anything. */
        const bar = onPage();
        const root = bar.node.shadowRoot;
        bar.update(editing());
        const details = part(bar, 'details');

        expect(details.getAttribute('aria-expanded')).toBe('false');
        expect(root.getElementById(details.getAttribute('aria-controls')))
            .toBe(root.querySelector('.ct-fields'));

        bar.update(editing({fieldsOpen: true}));
        expect(details.getAttribute('aria-expanded')).toBe('true');
    });

    it('opens the form closed, and shows it when asked', function() {
        /* Closed to start with, unlike the shell's: this panel floats
           over somebody's published page, and one that opens itself to
           the height of a nine-field form covers the words the author
           came to read. */
        const bar = onPage();
        const fields = bar.node.shadowRoot.querySelector('.ct-fields');

        bar.update(editing());
        expect(getComputedStyle(fields).display).toBe('none');

        bar.update(editing({fieldsOpen: true}));
        expect(getComputedStyle(fields).display).toBe('block');
    });

    it('offers no Details button for a collection with no fields', function() {
        /* And the form is not merely empty -- `buildFields` hides
           itself for one, which is the ONE answer the bar reads back
           rather than computing a second time. */
        const bar = onPage();
        bar.update(editing({fields: form([]), fieldsOpen: true}));

        expect(getComputedStyle(part(bar, 'details')).display).toBe('none');
        expect(getComputedStyle(bar.node.shadowRoot.querySelector('.ct-fields'))
            .display).toBe('none');
    });

    it('still offers it for a form that refuses, because the refusal is why',
       function() {
        /* A block the parser could not read has no fields to show and
           still has something to say. Hiding it would leave somebody
           saving an entry with no idea their frontmatter is not being
           merged. */
        const bar = onPage();
        bar.update(editing({
            fields: {...form([]), refusal: 'not YAML'}, fieldsOpen: true
        }));

        expect(getComputedStyle(part(bar, 'details')).display).not.toBe('none');
        expect(bar.node.shadowRoot.querySelector('.ct-fields__note').textContent)
            .toBe('not YAML');
    });

    it('does not say Details twice', function() {
        /* The form's own heading, which the shell shows above a pane
           with no button on it. Here the button one line up says the
           same word and is what a screen reader is told the state of,
           so the heading is the label repeated in eight lines of
           chrome. Computed, because the node is built either way. */
        const bar = onPage();
        bar.update(editing({fieldsOpen: true}));

        expect(bar.node.shadowRoot.querySelector('.ct-fields__heading')
            .textContent).toBe('Details');
        expect(getComputedStyle(bar.node.shadowRoot
            .querySelector('.ct-fields__heading')).display).toBe('none');
    });

    it('leaves no gap above the fields while the form has nothing to say',
       function() {
        /* The refusal's line, which is empty for every form that works
           -- and an empty <p> still carries the UA's margin above and
           below, so every usable form would open with a blank row
           where a complaint would have gone. Same rule as the note
           under Submit, one sheet apart. */
        const bar = onPage();
        bar.update(editing({fieldsOpen: true}));
        const note = bar.node.shadowRoot.querySelector('.ct-fields__note');

        expect(note.textContent).toBe('');
        expect(getComputedStyle(note).display).toBe('none');
    });

    it('reports what the form holds, and its complaints', function() {
        /* The ONLY copy of those answers: there is no state object
           behind these widgets, which is why the bar is built once and
           updated rather than rebuilt. */
        const bar = onPage();
        bar.update(editing({
            fields: form([{name: 'title', label: 'Title', widget: 'string',
                           required: true}])
        }));

        expect(bar.values()).toEqual({title: 'Hello'});
        expect(bar.errors()).toEqual([]);

        bar.node.shadowRoot.querySelector('.ct-field__input').value = '';
        expect(bar.errors().length).toBe(1);
    });

    it('shows a keyboard where it is, in its own colour', function() {
        /* This bar is the only thing on the page a keyboard can reach
           that the site's author did not put there, and its controls
           sit on a panel of its own colours -- so the ring is drawn in
           the colour this bar already uses for an action rather than
           left to whatever the UA paints, which is a system colour
           chosen against a page it knows nothing about.

           Read off the pull link rather than written as a hex: one
           value, named once in the sheet. */
        const bar = onPage();
        bar.update(editing({
            fieldsOpen: true,
            save: {...QUIET, pull: {number: 7, url: 'https://example.test/7'}}
        }));
        const action = getComputedStyle(part(bar, 'pull')).color;

        for (const control of [part(bar, 'submit'), part(bar, 'details'),
                               bar.node.shadowRoot
                                   .querySelector('.ct-field__input')]) {
            control.focus();
            const ring = getComputedStyle(control);

            expect(ring.outlineStyle).toBe('solid');
            expect(ring.outlineWidth).toBe('2px');
            expect(ring.outlineColor).toBe(action);
        }
    });

    it('links the pull request, in a tab that gets no handle back', function() {
        /* A link out of somebody else's published page. The page it
           opens must not get a handle back to a document the author is
           still editing in. */
        const bar = onPage();
        bar.update(editing({
            save: {...QUIET, pull: {number: 7, url: 'https://example.test/pr/7'}}
        }));
        const pull = part(bar, 'pull');

        expect(pull.textContent).toBe('Pull request #7');
        expect(pull.getAttribute('href')).toBe('https://example.test/pr/7');
        expect(pull.getAttribute('target')).toBe('_blank');
        expect(pull.getAttribute('rel')).toContain('noopener');
    });

    it('has no href at all when there is no pull request', function() {
        /* `<a href="">` is a link to the current page, so a hidden
           empty one reloads the site for anybody who tabs onto it --
           and the text is emptied rather than left behind `hidden`,
           because a hidden node's text is still what an assertion
           reads. */
        const bar = onPage();
        bar.update(editing({
            save: {...QUIET, pull: {number: 7, url: 'https://example.test/pr/7'}}
        }));
        bar.update(editing());
        const pull = part(bar, 'pull');

        expect(pull.hasAttribute('href')).toBe(false);
        expect(pull.textContent).toBe('');
        expect(getComputedStyle(pull).display).toBe('none');
    });

    it('colours a refusal as one, and an ordinary answer not', function() {
        /* "Nothing to save" and "somebody else changed this" are both
           answers to pressing Submit, and colouring the ordinary one as
           a fault teaches an author to read past the colour. Computed,
           because the class name alone cannot see whether any rule acts
           on it. */
        const bar = onPage();
        const note = part(bar, 'note');

        bar.update(editing({save: {...QUIET, note: 'Nothing to save.'}}));
        const ordinary = getComputedStyle(note).color;
        expect(note.textContent).toBe('Nothing to save.');

        bar.update(editing({
            save: {...QUIET, note: 'GitHub said no.', refused: true}
        }));
        expect(getComputedStyle(note).color).not.toBe(ordinary);
    });

    it('takes up no room while there is nothing to report', function() {
        /* An empty <p> still carries the UA's margin above and below,
           so a bar that has said something once would keep the gap for
           ever. */
        const bar = onPage();
        bar.update(editing());

        expect(getComputedStyle(part(bar, 'note')).display).toBe('none');
    });

    it('shows the markdown a refused submit would have written', function() {
        /* A conflict is the one failure where the person's work is
           still in hand and the only way forward throws it away.
           Selectable and read-only: it is there to be copied out of. */
        const bar = onPage();
        bar.update(editing({
            save: {...QUIET, refused: true, conflict: '# Hello\n'}
        }));
        const conflict = part(bar, 'conflict');

        expect(conflict.value).toBe('# Hello\n');
        expect(conflict.readOnly).toBe(true);
        expect(getComputedStyle(conflict).display).not.toBe('none');
    });

    it('takes it away once there is nothing unwritten', function() {
        const bar = onPage();
        bar.update(editing({save: {...QUIET, conflict: '# Hello\n'}}));
        bar.update(editing());
        const conflict = part(bar, 'conflict');

        expect(conflict.value).toBe('');
        expect(getComputedStyle(conflict).display).toBe('none');
    });

    it('does not keep somebody\u2019s markdown after the editor goes away',
       function() {
        /* A state with no save at all is not the same as one whose
           save has nothing unwritten, and the box must be empty for
           both: a hidden textarea still holding a post is that post
           left in the DOM of a published page after the bar said it
           was finished with it. */
        const bar = onPage();
        bar.update(editing({save: {...QUIET, conflict: '# Hello\n'}}));
        bar.update({kind: 'not-an-entry', hint: 'no'});

        expect(part(bar, 'conflict').value).toBe('');
    });
});
