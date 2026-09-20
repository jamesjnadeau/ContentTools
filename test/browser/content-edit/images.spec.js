/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Image

describe('`ContentEdit.Image()`', () => it('should return an instance of Image`', function() {

    // Wihtout a link
    let image = new ContentEdit.Image({'src': '/foo.jpg'});
    expect(image instanceof ContentEdit.Image).toBe(true);

    // With a link
    image = new ContentEdit.Image({'src': '/foo.jpg'}, {'href': 'bar'});
    return expect(image instanceof ContentEdit.Image).toBe(true);
}));


describe('`ContentEdit.Image.cssTypeName()`', () => it('should return \'image\'', function() {
    const image = new ContentEdit.Image({'src': '/foo.jpg'});
    return expect(image.cssTypeName()).toBe('image');
}));


describe('`ContentEdit.Image.type()`', () => it('should return \'Image\'', function() {
    const image = new ContentEdit.Image({'src': '/foo.jpg'});
    return expect(image.type()).toBe('Image');
}));


describe('`ContentEdit.Image.typeName()`', () => it('should return \'Image\'', function() {
    const image = new ContentEdit.Image({'src': '/foo.jpg'});
    return expect(image.typeName()).toBe('Image');
}));


describe('`ContentEdit.Image.createDraggingDOMElement()`', () => it('should create a helper DOM element', function() {
    // Mount an image to a region
    const image = new ContentEdit.Image({'src': 'http://getme.co.uk/foo.jpg'});
    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(image);

    // Get the helper DOM element
    const helper = image.createDraggingDOMElement();

    expect(helper).not.toBe(null);
    expect(helper.tagName.toLowerCase()).toBe('div');
    return expect(
        helper.style.backgroundImage.replace(/"/g, '')
        ).toBe('url(http://getme.co.uk/foo.jpg)');
}));


describe('`ContentEdit.Image.html()`', () => it('should return a HTML string for the image', function() {

    // Without a link
    let image = new ContentEdit.Image({'src': '/foo.jpg'});
    expect(image.html()).toBe('<img src="/foo.jpg">');

    // With a link
    image = new ContentEdit.Image({'src': '/foo.jpg'}, {'href': 'bar'});
    return expect(image.html()).toBe(
        '<a href="bar" data-ce-tag="img">\n' +
            `${ ContentEdit.INDENT }<img src=\"/foo.jpg\">\n` +
        '</a>'
        );
}));

describe('`ContentEdit.Image.mount()`', function() {

    let imageA = null;
    let imageB = null;
    let region = null;

    beforeEach(function() {
        imageA = new ContentEdit.Image({'src': '/foo.jpg'});
        imageB = new ContentEdit.Image({'src': '/foo.jpg'}, {'href': 'bar'});

        // Mount the images
        region = new ContentEdit.Region(document.createElement('div'));
        region.attach(imageA);
        region.attach(imageB);
        imageA.unmount();
        return imageB.unmount();
    });

    it('should mount the image to the DOM', function() {
        imageA.mount();
        imageB.mount();
        expect(imageA.isMounted()).toBe(true);
        return expect(imageB.isMounted()).toBe(true);
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

        // Mount the image
        imageA.mount();
        return expect(foo.handleFoo).toHaveBeenCalledWith(imageA);
    });
});


describe('`ContentEdit.Image.fromDOMElement()`', function() {

    it('should convert a <img> DOM element into an image element', function() {
        // Create <img> DOM element
        const domImg = document.createElement('img');
        domImg.setAttribute('src', '/foo.jpg');
        domImg.setAttribute('width', '400');
        domImg.setAttribute('height', '300');

        // Convert the DOM element into an image element
        const img = ContentEdit.Image.fromDOMElement(domImg);

        return expect(img.html()).toBe('<img height="300" src="/foo.jpg" width="400">');
    });

    it(`should read the natural width of the image if not supplied as an \
attribute`, function() {

        // Create <img> DOM element (with inline source so we can test querying
        // the size of the image, inline images are loaded as soon as the source
        // is set).
        const domImg = document.createElement('img');
        domImg.setAttribute(
            'src',
            'data:image/gif;' +
            'base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
            );

        // Convert the DOM element into an image element
        const img = ContentEdit.Image.fromDOMElement(domImg);

        return expect(img.size()).toEqual([1, 1]);
    });

    return it(`should convert a wrapped <a><img></a> DOM element into an image \
element`, function() {

        // Create <a> DOM element
        const domA = document.createElement('a');
        domA.setAttribute('href', 'test');

        // Create <img> DOM element
        const domImg = document.createElement('img');
        domImg.setAttribute('src', '/foo.jpg');
        domImg.setAttribute('width', '400');
        domImg.setAttribute('height', '300');
        domA.appendChild(domImg);

        // Convert the DOM element into an image element
        const img = ContentEdit.Image.fromDOMElement(domA);

        return expect(img.html()).toBe(
            '<a href="test" data-ce-tag="img">\n' +
                `${ ContentEdit.INDENT }` +
                '<img height="300" src="/foo.jpg" width="400">\n' +
            '</a>'
            );
    });
});


// Droppers

describe('`ContentEdit.Image` drop interactions', function() {

    let image = null;
    let region = null;

    beforeEach(function() {
        region = new ContentEdit.Region(document.createElement('div'));
        image = new ContentEdit.Image({'src': '/foo.jpg'});
        return region.attach(image);
    });

    it('should support dropping on Image', function() {
        const otherImage = new ContentEdit.Image({'src': '/bar.jpg'});
        region.attach(otherImage);

        // Check the initial order
        expect(image.nextSibling()).toBe(otherImage);

        // Check the order and class above dropping the element left
        image.drop(otherImage, ['above', 'left']);
        expect(image.hasCSSClass('align-left')).toBe(true);
        expect(image.nextSibling()).toBe(otherImage);

        // Check the order and class above dropping the element right
        image.drop(otherImage, ['above', 'right']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(true);
        expect(image.nextSibling()).toBe(otherImage);

        // Check the order after dropping the element below
        image.drop(otherImage, ['below', 'center']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(false);
        expect(otherImage.nextSibling()).toBe(image);

        // Check the order after dropping the element above
        image.drop(otherImage, ['above', 'center']);
        return expect(image.nextSibling()).toBe(otherImage);
    });

    it('should support dropping on PreText', function() {
        const preText = new ContentEdit.PreText('pre', {}, '');
        region.attach(preText);

        // Check the initial order
        expect(image.nextSibling()).toBe(preText);

        // Check the order and class above dropping the element left
        image.drop(preText, ['above', 'left']);
        expect(image.hasCSSClass('align-left')).toBe(true);
        expect(image.nextSibling()).toBe(preText);

        // Check the order and class above dropping the element right
        image.drop(preText, ['above', 'right']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(true);
        expect(image.nextSibling()).toBe(preText);

        // Check the order after dropping the element below
        image.drop(preText, ['below', 'center']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(false);
        expect(preText.nextSibling()).toBe(image);

        // Check the order after dropping the element above
        image.drop(preText, ['above', 'center']);
        return expect(image.nextSibling()).toBe(preText);
    });

    it('should support being dropped on by PreText', function() {
        const preText = new ContentEdit.PreText('pre', {}, '');
        region.attach(preText, 0);

        // Check the initial order
        expect(preText.nextSibling()).toBe(image);

        // Check the order after dropping the element below
        preText.drop(image, ['below', 'center']);
        expect(image.nextSibling()).toBe(preText);

        // Check the order after dropping the element above
        preText.drop(image, ['above', 'center']);
        return expect(preText.nextSibling()).toBe(image);
    });

    it('should support dropping on Static', function() {
        const staticElm = ContentEdit.Static.fromDOMElement(
            document.createElement('div')
            );
        region.attach(staticElm);

        // Check the initial order
        expect(image.nextSibling()).toBe(staticElm);

        // Check the order and class above dropping the element left
        image.drop(staticElm, ['above', 'left']);
        expect(image.hasCSSClass('align-left')).toBe(true);
        expect(image.nextSibling()).toBe(staticElm);

        // Check the order and class above dropping the element right
        image.drop(staticElm, ['above', 'right']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(true);
        expect(image.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element below
        image.drop(staticElm, ['below', 'center']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(false);
        expect(staticElm.nextSibling()).toBe(image);

        // Check the order after dropping the element above
        image.drop(staticElm, ['above', 'center']);
        return expect(image.nextSibling()).toBe(staticElm);
    });

    it('should support being dropped on by `moveable` Static', function() {
        const staticElm = new ContentEdit.Static('div', {'data-ce-moveable': 'data-ce-moveable'}, 'foo');
        region.attach(staticElm, 0);

        // Check the initial order
        expect(staticElm.nextSibling()).toBe(image);

        // Check the order after dropping the element below
        staticElm.drop(image, ['below', 'center']);
        expect(image.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element above
        staticElm.drop(image, ['above', 'center']);
        return expect(staticElm.nextSibling()).toBe(image);
    });

    it('should support dropping on Text', function() {
        const text = new ContentEdit.Text('p');
        region.attach(text);

        // Check the initial order
        expect(image.nextSibling()).toBe(text);

        // Check the order and class above dropping the element left
        image.drop(text, ['above', 'left']);
        expect(image.hasCSSClass('align-left')).toBe(true);
        expect(image.nextSibling()).toBe(text);

        // Check the order and class above dropping the element right
        image.drop(text, ['above', 'right']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(true);
        expect(image.nextSibling()).toBe(text);

        // Check the order after dropping the element below
        image.drop(text, ['below', 'center']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(false);
        expect(text.nextSibling()).toBe(image);

        // Check the order after dropping the element above
        image.drop(text, ['above', 'center']);
        return expect(image.nextSibling()).toBe(text);
    });

    return it('should support being dropped on by Text', function() {
        const text = new ContentEdit.Text('p');
        region.attach(text, 0);

        // Check the initial order
        expect(text.nextSibling()).toBe(image);

        // Check the order after dropping the element below
        text.drop(image, ['below', 'center']);
        expect(image.nextSibling()).toBe(text);

        // Check the order after dropping the element above
        text.drop(image, ['above', 'center']);
        return expect(text.nextSibling()).toBe(image);
    });
});
