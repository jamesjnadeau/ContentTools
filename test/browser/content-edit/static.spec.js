/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Static

describe('`ContentEdit.Static()`', () => it('should return an instance of Static`', function() {

    const staticElm = new ContentEdit.Static('div', {}, '<div></div>');
    return expect(staticElm instanceof ContentEdit.Static).toBe(true);
}));


describe('`ContentEdit.Static.cssTypeName()`', () => it('should return \'static\'', function() {

    const staticElm = new ContentEdit.Static('div', {}, '<div></div>');
    return expect(staticElm.cssTypeName()).toBe('static');
}));


describe('`ContentEdit.Static.createDraggingDOMElement()`', () => it('should create a helper DOM element', function() {
    // Mount an image to a region
    const staticElm = new ContentEdit.Static('div', {}, 'foo <b>bar</b>');
    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(staticElm);

    // Get the helper DOM element
    const helper = staticElm.createDraggingDOMElement();

    expect(helper).not.toBe(null);
    expect(helper.tagName.toLowerCase()).toBe('div');
    return expect(helper.innerHTML).toBe('foo bar');
}));


describe('`ContentEdit.Static.type()`', () => it('should return \'Static\'', function() {
    const staticElm = new ContentEdit.Static('div', {}, '<div></div>');
    return expect(staticElm.type()).toBe('Static');
}));


describe('`ContentEdit.Static.typeName()`', () => it('should return \'Static\'', function() {

    const staticElm = new ContentEdit.Static('div', {}, '<div></div>');
    return expect(staticElm.typeName()).toBe('Static');
}));


describe('ContentEdit.Static.html()', () => it('should return a HTML string for the static element', function() {
    const staticElm = new ContentEdit.Static(
        'div',
        {'class': 'foo'},
        '<div><b>foo</b></div>'
        );
    return expect(staticElm.html()).toBe(
        '<div class="foo"><div><b>foo</b></div></div>'
        );
}));


describe('ContentEdit.Static.mount()', function() {

    let region = null;
    let staticElm = null;

    beforeEach(function() {
        staticElm = new ContentEdit.Static(
            'div',
            {'class': 'foo'},
            '<div><b>foo</b></div>'
            );

        // Mount the static element
        region = new ContentEdit.Region(document.createElement('div'));
        region.attach(staticElm);
        return staticElm.unmount();
    });

    it('should mount the static element to the DOM', function() {
        staticElm.mount();
        expect(staticElm.isMounted()).toBe(true);
        return expect(staticElm.domElement().innerHTML).toBe('<div><b>foo</b></div>');
    });

    return it('should trigger the `mount` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the mount event
        const root = ContentEdit.Root.get();
        root.bind('mount', foo.handleFoo);

        // Mount the static element
        staticElm.mount();
        return expect(foo.handleFoo).toHaveBeenCalledWith(staticElm);
    });
});


describe('`ContentEdit.Static.fromDOMElement()`', () => it('should convert a DOM element into an static element', function() {

    const region = new ContentEdit.Region(document.createElement('div'));
    const domElement = document.createElement('div');
    domElement.innerHTML = '<div><b>foo</b></div>';
    const staticElm = ContentEdit.Static.fromDOMElement(domElement);
    region.attach(staticElm);

    return expect(staticElm.domElement().innerHTML).toBe('<div><b>foo</b></div>');
}));


// Droppers

describe(`\`ContentEdit.Static\` drop interactions if \`data-ce-moveable\` is \
set`, function() {

    let staticElm = null;
    let region = null;

    beforeEach(function() {
        region = new ContentEdit.Region(document.createElement('div'));
        staticElm = new ContentEdit.Static(
            'div',
            {'data-ce-moveable': ''},
            'foo'
            );
        return region.attach(staticElm);
    });

    return it('should support dropping on Text', function() {
        const otherStaticElm = new ContentEdit.Static(
            'div',
            {'data-ce-moveable': ''},
            'bar'
            );
        region.attach(otherStaticElm);

        // Check the initial order
        expect(staticElm.nextSibling()).toBe(otherStaticElm);

        // Check the order after dropping the element after
        staticElm.drop(otherStaticElm, ['below', 'center']);
        expect(otherStaticElm.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element before
        staticElm.drop(otherStaticElm, ['above', 'center']);
        return expect(staticElm.nextSibling()).toBe(otherStaticElm);
    });
});