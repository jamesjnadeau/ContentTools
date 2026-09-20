/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// StylePalette

describe('ContentTools.StylePalette.add()', function() {

    afterEach(() => ContentTools.StylePalette._styles = []);

    return it('should return a `ContentTools.Style` instance', function() {
        const style = new ContentTools.Style('test', 'test', ['p']);
        ContentTools.StylePalette.add(style);
        const p = new ContentEdit.Text('p', {}, 'foo');
        return expect(ContentTools.StylePalette.styles(p)).toEqual([style]);
});
});


describe('ContentTools.StylePalette.styles()', function() {

    afterEach(() => ContentTools.StylePalette._styles = []);

    return it(`should return a list of \`ContentTools.Style\` instances by tag \
name`, function() {

        // Add a set of styles for by different tags
        const test1 = new ContentTools.Style('Test 1', 'test-1', ['p']);
        const test2 = new ContentTools.Style('Test 2', 'test-2', ['h1', 'p']);
        const test3 = new ContentTools.Style('Test 3', 'test-3', ['h1', 'h2']);
        ContentTools.StylePalette.add(test1);
        ContentTools.StylePalette.add(test2);
        ContentTools.StylePalette.add(test3);

        const p = new ContentEdit.Text('p', {}, 'foo');
        const h1 = new ContentEdit.Text('h1', {}, 'foo');
        const h2 = new ContentEdit.Text('h2', {}, 'foo');

        expect(ContentTools.StylePalette.styles(p)).toEqual([test1, test2]);
        expect(ContentTools.StylePalette.styles(h1)).toEqual([test2, test3]);
        return expect(ContentTools.StylePalette.styles(h2)).toEqual([test3]);
        });
});


// Styles

describe('ContentTools.Style()', () => it('should create `ContentTools.Style` instance', function() {
    const style = new ContentTools.Style('Test', 'test', ['p']);
    return expect(style instanceof ContentTools.Style).toBe(true);
}));


describe('ContentTools.Style.applicableTo()', () => it('should return a list of tag names the style is applicable to', function() {
    const tagNames = ['p', 'img', 'table'];
    const style = new ContentTools.Style('Test', 'test', tagNames);
    return expect(style.applicableTo()).toBe(tagNames);
}));


describe('ContentTools.Style.cssClass()', () => it('should return the CSS class name for the style', function() {
    const cssClassName = 'test';
    const style = new ContentTools.Style('Test', cssClassName, 'p');
    return expect(style.cssClass()).toBe(cssClassName);
}));


describe('ContentTools.Style.name()', () => it('should return the name of the style', function() {
    const name = 'Test';
    const style = new ContentTools.Style(name, 'test', 'p');
    return expect(style.name()).toBe(name);
}));