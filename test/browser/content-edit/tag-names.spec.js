/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// TagNames

describe('`ContentEdit.TagNames.get()`', () => it('should return a singleton instance of TagNames`', function() {
    const tagNames = new ContentEdit.TagNames.get();

    // Check the instance returned is a singleton
    return expect(tagNames).toBe(ContentEdit.TagNames.get());
}));


describe('`ContentEdit.TagNames.register()`', () => it('should register a class with one or more tag names', function() {
    const tagNames = new ContentEdit.TagNames.get();

    // Register some classes to tag names
    tagNames.register(ContentEdit.Node, 'foo');
    tagNames.register(ContentEdit.Element, 'bar', 'zee');

    expect(tagNames.match('foo')).toBe(ContentEdit.Node);
    expect(tagNames.match('bar')).toBe(ContentEdit.Element);
    return expect(tagNames.match('zee')).toBe(ContentEdit.Element);
}));


describe('`ContentEdit.TagNames.match()`', function() {

    const tagNames = new ContentEdit.TagNames.get();

    it('should return a class registered for the specifed tag name', () => expect(tagNames.match('img')).toBe(ContentEdit.Image));

    return it(`should return \`ContentEdit.Static\` if no match is found for the tag \
name`, () => expect(tagNames.match('bom')).toBe(ContentEdit.Static));
});