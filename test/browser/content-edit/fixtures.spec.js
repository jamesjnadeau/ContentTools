/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Fixture

describe('`ContentEdit.Fixture()`', () => it('should return an instance of Fixture`', function() {

    const div = document.createElement('div');
    const p = document.createElement('p');
    p.innerHTML = 'foo <b>bar</b>';
    div.appendChild(p);
    const fixture = new ContentEdit.Fixture(p);
    expect(fixture instanceof ContentEdit.Fixture).toBe(true);

    // Check the child element has been correctly modified
    const child = fixture.children[0];

    // The child element should state that it is fixed
    expect(child.isFixed()).toBe(true);

    // Th behaviour of the child element should be restricted
    expect(child.can('drag')).toBe(false);
    expect(child.can('drop')).toBe(false);
    expect(child.can('merge')).toBe(false);
    expect(child.can('remove')).toBe(false);
    expect(child.can('resize')).toBe(false);
    return expect(child.can('spawn')).toBe(false);
}));


describe('`ContentEdit.Fixture.domElement()`', () => it('should return the DOM element of the child `Element` it wraps', function() {
    const div = document.createElement('div');
    const p = document.createElement('p');
    p.innerHTML = 'foo <b>bar</b>';
    div.appendChild(p);
    const fixture = new ContentEdit.Fixture(p);
    return expect(fixture.domElement()).toBe(fixture.children[0].domElement());
}));


describe('`ContentEdit.Fixture.isMounted()`', () => it('should always return true', function() {
    const div = document.createElement('div');
    const p = document.createElement('p');
    p.innerHTML = 'foo <b>bar</b>';
    div.appendChild(p);
    const fixture = new ContentEdit.Fixture(p);
    return expect(fixture.isMounted()).toBe(true);
}));


describe('`ContentEdit.Fixture.html()`', () => it('should return a HTML string for the fixture', function() {
    // The HTML output for a fixture should typically be the same as the
    // inner HTML of the `Element` it wraps (though there will be exceptions,
    // e.g `Image`s when they are available).

    // Test output for `Text` element
    const div = document.createElement('div');
    const p = document.createElement('p');
    p.innerHTML = 'foo <b>bar</b>';
    div.appendChild(p);
    const fixture = new ContentEdit.Fixture(p);
    return expect(fixture.html()).toBe(
        `<p>\n${ ContentEdit.INDENT }foo <b>bar</b>\n</p>`
    );
}));


// Test specific to fixtures containing text elements

describe('`ContentEdit.Fixture` text behaviour', () => it(`should return trigger next/previous-region event when tab key is \
pressed`, function() {

    const root = ContentEdit.Root.get();

    const div = document.createElement('div');
    const p = document.createElement('p');
    p.innerHTML = 'foo <b>bar</b>';
    div.appendChild(p);
    const fixture = new ContentEdit.Fixture(p);
    const child = fixture.children[0];

    // Create event handlers
    const handlers = {
        nextRegion() {
        },

        previousRegion() {
        }
    };

    // Spy on the event handlers
    spyOn(handlers, 'nextRegion');
    spyOn(handlers, 'previousRegion');

    // Bind the event handlers to the root for the events of interest
    root.bind('next-region', handlers.nextRegion);
    root.bind('previous-region', handlers.previousRegion);

    // Simulate tab key being pressed
    child._keyTab({
        preventDefault() {}
        });
    expect(handlers.nextRegion).toHaveBeenCalledWith(fixture);

    // Simulate tab and shift key being pressed
    child._keyTab({
        preventDefault() {},
        shiftKey: true
        });
    return expect(handlers.previousRegion).toHaveBeenCalledWith(fixture);
}));