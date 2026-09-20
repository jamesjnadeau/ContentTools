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
// TagNames

describe('`ContentEdit.TagNames.get()`', () => it('should return a singleton instance of TagNames`', function() {
    const tagNames = ContentEdit.TagNames.get();

    // Check the instance returned is a singleton
    return expect(tagNames).toBe(ContentEdit.TagNames.get());
}));


describe('`ContentEdit.TagNames.register()`', () => it('should register a class with one or more tag names', function() {
    const tagNames = ContentEdit.TagNames.get();

    // Register some classes to tag names
    tagNames.register(ContentEdit.Node, 'foo');
    tagNames.register(ContentEdit.Element, 'bar', 'zee');

    expect(tagNames.match('foo')).toBe(ContentEdit.Node);
    expect(tagNames.match('bar')).toBe(ContentEdit.Element);
    return expect(tagNames.match('zee')).toBe(ContentEdit.Element);
}));


describe('`ContentEdit.TagNames.match()`', function() {

    const tagNames = ContentEdit.TagNames.get();

    it('should return a class registered for the specifed tag name', () => expect(tagNames.match('img')).toBe(ContentEdit.Image));

    return it(`should return \`ContentEdit.Static\` if no match is found for the tag \
name`, () => expect(tagNames.match('bom')).toBe(ContentEdit.Static));
});