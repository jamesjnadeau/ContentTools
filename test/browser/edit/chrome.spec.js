/* The bar, and the two things it has to survive: a page written by
   somebody else, and eight answers it must not confuse. */

import {
    BAR_TAG, buildBar, describe as describeState, describeElement
} from '../../../src/edit/chrome.js';

/** A bar on the real document, cleaned up after each test. */
function onPage() {
    const bar = buildBar(document);
    document.body.appendChild(bar.node);
    return bar;
}

const entry = {collection: 'blog', slug: 'hello'};

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

    it('says nothing until it is told what to say', function() {
        /* Built empty and filled once the config has been fetched, which
           is why the panel is a live region below. */
        expect(onPage().node.shadowRoot.textContent).toBe('');
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
