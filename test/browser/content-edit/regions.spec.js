/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Region

describe('`ContentEdit.Region()`', () => it('should return an instance of Region`', function() {
    const region = new ContentEdit.Region(document.createElement('div'));
    return expect(region instanceof ContentEdit.Region).toBe(true);
}));


describe('`ContentEdit.Region.domElement()`', () => it(`should return a clone of the DOM element the region was initialized with \
or a clone of`, function() {
    const domElement = document.createElement('div');
    const region = new ContentEdit.Region(domElement);
    return expect(region.domElement()).toEqual(domElement);
}));


describe('`ContentEdit.Region.isMounted()`', () => it('should always return true', function() {
    const region = new ContentEdit.Region(document.createElement('div'));
    return expect(region.isMounted()).toBe(true);
}));


describe('`ContentEdit.Region.type()`', () => it('should return \'Region\'', function() {
    const region = new ContentEdit.Region(document.createElement('div'));
    return expect(region.type()).toBe('Region');
}));


describe('`ContentEdit.Region.html()`', () => it('should return a HTML string for the region', function() {
    const region = new ContentEdit.Region(document.createElement('div'));

    // Add a set of elements to the region
    region.attach(new ContentEdit.Text('p', {}, 'one'));
    region.attach(new ContentEdit.Text('p', {}, 'two'));
    region.attach(new ContentEdit.Text('p', {}, 'three'));

    return expect(region.html()).toBe(
        '<p>\n' +
        `${ ContentEdit.INDENT }one\n` +
        '</p>\n' +
        '<p>\n' +
        `${ ContentEdit.INDENT }two\n` +
        '</p>\n' +
        '<p>\n' +
        `${ ContentEdit.INDENT }three\n` +
        '</p>'
        );
}));

describe('`ContentEdit.Region.setContent()`', () => it('should set content for the region', function() {
    const region = new ContentEdit.Region(document.createElement('div'));

    // Build the DOM content
    const domContent = document.createElement('div');
    domContent.innerHTML = '<h1>test with DOM</h1>';

    // Build the HTML Content
    const htmlContent = '<h2>test with HTML</h2>';

    // Set the content using a DOM element
    region.setContent(domContent);

    expect(region.html()).toBe(
        '<h1>\n' +
        `${ ContentEdit.INDENT }test with DOM\n` +
        '</h1>'
        );

    // Set the content using a HTML string
    region.setContent(htmlContent);

    return expect(region.html()).toBe(
        '<h2>\n' +
        `${ ContentEdit.INDENT }test with HTML\n` +
        '</h2>'
        );
}));