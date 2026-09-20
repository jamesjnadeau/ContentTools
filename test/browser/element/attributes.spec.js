import {create, mount, unmount, assertNoResidue, FIXTURE} from './helpers.js';

/* Attributes in, and what a change to one does after boot.
 *
 * Three of them are read once, inside `init()`, so changing them means
 * rebooting; the rest are live. Which is which is the contract. */

describe('defaults', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    it('matches the documented markup without any attributes', () => {
        el = mount();
        expect(el.regions).toBe('[data-editable], [data-fixture]');
        // `data-name`, not `id`: the imperative default is `id` only for
        // compatibility with integrations that predate the option.
        expect(el.namingProp).toBe('data-name');
        expect(el.contentScope).toBe('light');
        expect(el.ignition).toBe(false);
        expect(el.uiLang).toBe(null);
    });

    it('names regions by the naming prop', () => {
        el = mount();
        el.start();
        expect(Object.keys(el.editorApp.regions()).sort())
            .toEqual(['aside', 'body', 'title']);
        el.stop(true);
    });
});

describe('live attributes', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    it('re-scans when regions changes', () => {
        el = mount();
        expect(el.editorApp.domRegions()).toHaveLength(3);
        el.setAttribute('regions', '[data-fixture]');
        expect(el.editorApp.domRegions()).toHaveLength(1);
    });

    it('re-scans WHILE EDITING, without rebooting', () => {
        /* This is what makes regions live rather than one of the reboot
           attributes: syncRegions() mounts and unmounts region trees in
           place, so the edit session survives. A reboot would silently
           refuse here, and the new region would never appear. */
        el = mount();
        el.start();
        expect(Object.keys(el.editorApp.regions())).toHaveLength(3);

        const extra = document.createElement('div');
        extra.setAttribute('data-editable', '');
        extra.setAttribute('data-name', 'extra');
        extra.innerHTML = '<p>extra</p>';
        el.appendChild(extra);
        el.setAttribute('regions', '[data-editable]');

        expect(el.editorApp.isEditing()).toBe(true);
        expect(Object.keys(el.editorApp.regions()).sort())
            .toEqual(['aside', 'body', 'extra']);
        el.stop(true);
    });

    it('adds and replaces the content-styles link', () => {
        el = mount({'content-styles': '/a.css'});
        const links = () => el.shadowRoot.querySelectorAll('link[rel="stylesheet"]');
        expect(links()).toHaveLength(1);
        expect(links()[0].getAttribute('href')).toBe('/a.css');

        el.setAttribute('content-styles', '/b.css');
        expect(links()).toHaveLength(1);
        expect(links()[0].getAttribute('href')).toBe('/b.css');

        el.removeAttribute('content-styles');
        expect(links()).toHaveLength(0);
    });

    it('sets the UI language and puts it back on teardown', async () => {
        const before = ContentEdit.LANGUAGE;
        el = mount({'ui-lang': 'fr'});
        expect(ContentEdit.LANGUAGE).toBe('fr');

        el.setAttribute('ui-lang', 'de');
        expect(ContentEdit.LANGUAGE).toBe('de');

        await unmount(el);
        el = null;
        expect(ContentEdit.LANGUAGE).toBe(before);
    });

    it('falls back to lang when ui-lang is absent', () => {
        /* `lang` is a global HTML attribute that also tells the browser
           what language the CONTENT is in -- spellcheck, hyphenation,
           :lang(), screen-reader pronunciation -- so it cannot be the way
           to set the chrome's language. It is honoured as a fallback
           because an element with only `lang` set almost certainly means
           both. */
        el = mount({lang: 'es'});
        expect(el.uiLang).toBe('es');
        expect(ContentEdit.LANGUAGE).toBe('es');
    });

    it('prefers ui-lang over lang', () => {
        el = mount({lang: 'es', 'ui-lang': 'fr'});
        expect(el.uiLang).toBe('fr');
        expect(ContentEdit.LANGUAGE).toBe('fr');
    });

    it('fetches nothing', () => {
        // Milestone 1 keeps network out of the element, and an auto-fetch
        // of a translation file would race start(). Consumers call
        // ContentEdit.addTranslations() themselves.
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
            throw new Error('the element must not fetch');
        });
        el = mount({'ui-lang': 'fr'});
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('attributes that force a reboot', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    it('re-reads naming-prop', () => {
        // init() records the naming property once, so a change is only
        // visible after a fresh init.
        el = mount({'naming-prop': 'id',
                    regions: '[data-editable]'},
                   '<div data-editable id="alpha"><p>a</p></div>');
        el.start();
        expect(Object.keys(el.editorApp.regions())).toEqual(['alpha']);
        el.stop(true);

        el.setAttribute('naming-prop', 'data-name');
        el.setAttribute('regions', '[data-editable]');
        el.querySelector('[data-editable]').setAttribute('data-name', 'beta');
        el.refresh();
        el.start();
        expect(Object.keys(el.editorApp.regions())).toEqual(['beta']);
        el.stop(true);
    });

    it('re-reads ignition', () => {
        el = mount();
        expect(el.editorApp.ignition()).toBe(null);
        el.setAttribute('ignition', '');
        expect(el.editorApp.ignition()).not.toBe(null);
        // One editor, not two: the reboot must have torn the first down.
        expect(el.shadowRoot.querySelectorAll('.ct-app')).toHaveLength(1);
        expect(el.shadowRoot.querySelectorAll('.ct-app-host')).toHaveLength(1);
    });

    it('refuses while editing, rather than reparenting a live region tree', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        el = mount();
        el.start();
        el.setAttribute('content-scope', 'shadow');

        expect(warn).toHaveBeenCalled();
        expect(el.editorApp.isEditing()).toBe(true);
        expect(el.rootContext.contentScopeMode()).toBe('light');
        el.stop(true);
    });
});

describe('Mode B (content-scope="shadow")', () => {

    let el;
    afterEach(async () => { if (el) await unmount(el); el = null; assertNoResidue(); });

    it('parks the light children inside the shadow root', () => {
        el = mount({'content-scope': 'shadow'});
        expect(el.children).toHaveLength(0);
        const wrapper = el.shadowRoot.querySelector('.ct-content');
        expect(wrapper).not.toBe(null);
        expect(wrapper.querySelectorAll('[data-editable]')).toHaveLength(2);
        expect(el.rootContext.contentScope()).toBe(el.shadowRoot);
        expect(el.editorApp.domRegions()).toHaveLength(3);
    });

    it('gives the content back on teardown', async () => {
        el = mount({'content-scope': 'shadow'});
        await unmount(el);
        // Mode B borrows the consumer's DOM; it does not keep it.
        expect(el.children).toHaveLength(3);
        expect(el.shadowRoot.querySelector('.ct-content')).toBe(null);
        el = null;
    });

    it('switches back to light without losing the content', () => {
        el = mount({'content-scope': 'shadow'});
        el.setAttribute('content-scope', 'light');
        expect(el.children).toHaveLength(3);
        expect(el.shadowRoot.querySelector('.ct-content')).toBe(null);
        expect(el.rootContext.contentScope()).toBe(el);
        expect(el.editorApp.domRegions()).toHaveLength(3);
    });
});
