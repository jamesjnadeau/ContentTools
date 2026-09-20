/* NOTE: the CoffeeScript specs wrote `new ContentEdit.X.get()`. That worked
 * only because CoffeeScript compiled `get` to a plain function, and `new` on a
 * function returning an object yields that object -- so it was always just a
 * verbose way of writing `ContentEdit.X.get()`. As an ES static method `get`
 * is not constructible, so the redundant `new` is dropped. Same singleton,
 * same assertions.
 */
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Root

describe('`ContentEdit.Root.get()`', () => it('should return a singleton instance of Root`', function() {
    const root = ContentEdit.Root.get();

    // Check the instance returned is a singleton
    return expect(root).toBe(ContentEdit.Root.get());
}));


describe('`ContentEdit.Root.focused()`', () => it(`should return the currently focused element or null if no element has \
focus`, function() {

    // Create a region and mount an element
    const region = new ContentEdit.Region(document.createElement('div'));
    const element = new ContentEdit.Element('div');
    region.attach(element);

    // Clear any existing focused element
    const root = ContentEdit.Root.get();
    if (root.focused()) {
        root.focused().blur();
    }

    expect(root.focused()).toBe(null);

    // Give focus to the element
    element.focus();
    return expect(root.focused()).toBe(element);
}));


describe('`ContentEdit.Root.dragging()`', () => it(`should return the element currently being dragged or null if no element \
is being dragged`, function() {

    // Create a region and mount an element
    const region = new ContentEdit.Region(document.createElement('div'));
    const element = new ContentEdit.Element('div');
    region.attach(element);

    const root = ContentEdit.Root.get();

    // Start dragging the element
    element.drag(0, 0);
    expect(root.dragging()).toBe(element);

    // Cancel the drag (dragging element should return to null)
    root.cancelDragging();
    return expect(root.dragging()).toBe(null);
}));


describe('`ContentEdit.Root.dropTarget()`', () => it('should return the element the dragging element is currently over', function() {

    // Create a region and mount two text elements
    const region = new ContentEdit.Region(document.getElementById('test'));
    const elementA = new ContentEdit.Text('p');
    region.attach(elementA);

    const elementB = new ContentEdit.Text('p');
    region.attach(elementB);

    const root = ContentEdit.Root.get();

    // Start dragging element A
    elementA.drag(0, 0);

    // Fake a drag over element B
    elementB._onMouseOver({});

    expect(root.dropTarget()).toBe(elementB);

    // Cancel the drag (drop target should return to null)
    root.cancelDragging();
    expect(root.dropTarget()).toBe(null);

    // Clean up
    region.detach(elementA);
    return region.detach(elementB);
}));


describe('`ContentEdit.Root.type()`', () => it('should return \'Region\'', function() {
    const root = ContentEdit.Root.get();
    return expect(root.type()).toBe('Root');
}));


describe('`ContentEdit.Root.startDragging()`', () => it('should start a drag interaction', function() {

    // Create a region and mount an element
    const region = new ContentEdit.Region(document.getElementById('test'));
    const element = new ContentEdit.Text('p');
    region.attach(element);

    // Start dragging the element
    const root = ContentEdit.Root.get();
    root.startDragging(element, 0, 0);

    // Check the element has being marked as dragging
    expect(root.dragging()).toBe(element);
    let cssClasses = element.domElement().getAttribute('class').split(' ');
    expect(cssClasses.indexOf('ce-element--dragging') > -1).toBe(true);

    // Check the body has been marked
    cssClasses = document.body.getAttribute('class').split(' ');
    expect(cssClasses.indexOf('ce--dragging') > -1).toBe(true);

    // Check a helper element has been created
    expect(root._draggingDOMElement).not.toBe(null);

    // Clean up
    root.cancelDragging();
    return region.detach(element);
}));


describe('`ContentEdit.Root.cancelDragging()`', () => it('should cancel a drag interaction', function() {

    // Create a region and mount an element
    const region = new ContentEdit.Region(document.createElement('div'));
    const element = new ContentEdit.Element('div');
    region.attach(element);

    const root = ContentEdit.Root.get();
    if (root.dragging()) {
        root.cancelDragging();
    }

    // Start dragging the element
    element.drag(0, 0);
    expect(root.dragging()).toBe(element);

    // Cancel the drag
    root.cancelDragging();
    return expect(root.dragging()).toBe(null);
}));


describe('`ContentEdit.Root.resizing()`', () => it(`should return the element currently being resized or null if no element \
is being resized`, function() {

    // Create a region and mount an element
    const region = new ContentEdit.Region(document.createElement('div'));
    const element = new ContentEdit.ResizableElement('div');
    region.attach(element);

    // Start resizing the element
    const root = ContentEdit.Root.get();
    element.resize(['top', 'left'], 0, 0);
    expect(root.resizing()).toBe(element);

    // Clean up
    return root._onStopResizing();
}));


describe('`ContentEdit.Root.startResizing()`', () => it('should start a resize interaction', function() {

    // Create a region and mount an element
    const region = new ContentEdit.Region(document.getElementById('test'));
    const element = new ContentEdit.ResizableElement('div');
    region.attach(element);

    // Start dragging the element
    const root = ContentEdit.Root.get();
    root.startResizing(element, ['top', 'left'], 0, 0, true);

    // Check the element has being marked as
    expect(root.resizing()).toBe(element);
    let cssClasses = element.domElement().getAttribute('class').split(' ');
    expect(cssClasses.indexOf('ce-element--resizing') > -1).toBe(true);

    // Check the body has been marked
    cssClasses = document.body.getAttribute('class').split(' ');
    expect(cssClasses.indexOf('ce--resizing') > -1).toBe(true);

    // Clean up
    root._onStopResizing();
    return region.detach(element);
}));