import ContentEdit from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let Cls$images = (ContentEdit.Image = class Image extends ContentEdit.ResizableElement {
    static initClass() {
    
        // Class properties
    
        this.droppers = {
            'Image': ContentEdit.Element._dropBoth,
            'PreText': ContentEdit.Element._dropBoth,
            'Static': ContentEdit.Element._dropBoth,
            'Text': ContentEdit.Element._dropBoth
        };
    
        // List of allowed drop placements for the class, supported values are:
        this.placements = ['above', 'below', 'left', 'right', 'center'];
    }

    // An editable image (e.g <image src="..." alt="foo" width="5" height="5">).
    // The `Image` element supports 2 special tags to allow the the size of the
    // image to be constrained (data-ce-min-width, data-ce--max-width).

    constructor(attributes, a) {
        super('img', attributes);

        // Optionally an <a> tag may be specified which will wrap the image. The
        // a tag should be specified as a dictionary of attributes.
        this.a = a ? a : null;

        // Set the aspect ratio for the image based on it's initial width/height
        const size = this.size();
        this._aspectRatio = size[1] / size[0];
    }

    // Read-only properties

    cssTypeName() {
        return 'image';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'Image';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'Image';
    }

    // Methods

    createDraggingDOMElement() {
        // Create a DOM element that visually aids the user in dragging the
        // element to a new location in the editiable tree structure.
        if (!this.isMounted()) {
            return;
        }

        const helper = super.createDraggingDOMElement();

        // Set the background image for the helper element
        helper.style.backgroundImage = `url('${ this._attributes['src'] }')`;

        return helper;
    }

    html(indent) {
        // Return a HTML string for the node
        if (indent == null) { indent = ''; }
        const img = `${ indent }<img${ this._attributesToString() }>`;
        if (this.a) {
            const le = ContentEdit.LINE_ENDINGS;
            let attributes = ContentEdit.attributesToString(this.a);
            attributes = `${ attributes } data-ce-tag=\"img\"`;
            return `${ indent }<a ${ attributes }>${ le }` +
                `${ ContentEdit.INDENT }${ img }${ le }` +
                `${ indent }</a>`;
        } else {
            return img;
        }
    }

    mount() {
        // Mount the element on to the DOM

        // Create the DOM element to mount
        this._domElement = document.createElement('div');

        // Set the classes for the image, we combine classes from both the outer
        // link tag (if there is one) and image element.
        let classes = '';
        if (this.a && this.a['class']) {
            classes += ' ' + this.a['class'];
        }

        if (this._attributes['class']) {
            classes += ' ' + this._attributes['class'];
        }

        this._domElement.setAttribute('class', classes);

        // Set the background image for the
        let style = this._attributes['style'] ? this._attributes['style'] : '';
        style += `background-image:url('${ this._attributes['src'] }');`;

        // Set the size using style
        if (this._attributes['width']) {
            style += `width:${ this._attributes['width'] }px;`;
        }

        if (this._attributes['height']) {
            style += `height:${ this._attributes['height'] }px;`;
        }

        this._domElement.setAttribute('style', style);

        return super.mount();
    }

    unmount() {
        // Unmount the element from the DOM

        if (this.isFixed()) {
            // Revert the DOM element to an image
            const wrapper = document.createElement('div');
            wrapper.innerHTML = this.html();
            const domElement = wrapper.querySelector('a, img');

            // Replace the current DOM element with the image
            this._domElement.parentNode.replaceChild(domElement, this._domElement);
            this._domElement = domElement;
        }

        return super.unmount();
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type

        // Is the image inside an <a> tag
        let a = null;
        if (domElement.tagName.toLowerCase() === 'a') {
            a = this.getDOMElementAttributes(domElement);

            // Switch the DOM element to the <img> tag inside it
            const childNodes = (Array.from(domElement.childNodes));

            // Filter out non-elements
            for (var childNode of Array.from(childNodes)) {
                if ((childNode.nodeType === 1) 
                        && (childNode.tagName.toLowerCase() === 'img')) {
                    domElement = childNode;
                    break;
                }
            }

            // If we didn't find an image create a blank image
            if (domElement.tagName.toLowerCase() === 'a') {
                domElement = document.createElement('img');
            }
        }

        // Convert the image
        const attributes = this.getDOMElementAttributes(domElement);

        // If the width and height of the image haven't been specified, we query
        // the DOM for these values.
        let width = attributes['width'];
        let height = attributes['height'];
        if (attributes['width'] === undefined) {
            if (attributes['height'] === undefined) {
                width = domElement.naturalWidth;
            } else {
                width = domElement.clientWidth;
            }
        }

        if (attributes['height'] === undefined) {
            if (attributes['width'] === undefined) {
                height = domElement.naturalHeight;
            } else {
                height = domElement.clientHeight;
            }
        }

        attributes['width'] = width;
        attributes['height'] = height;

        return new (this)(attributes, a);
    }
});
Cls$images.initClass();


// Register `ContentEdit.Image` the class with associated tag names
ContentEdit.TagNames.get().register(ContentEdit.Image, 'img');


Cls$images = (ContentEdit.ImageFixture = class ImageFixture extends ContentEdit.Element {
    static initClass() {
    
        // Class properties
    
        this.droppers = {
            'ImageFixture': ContentEdit.Element._dropVert,
            'Image': ContentEdit.Element._dropVert,
            'PreText': ContentEdit.Element._dropVert,
            'Text': ContentEdit.Element._dropVert
        };
    }

    // Image fixtures provide a mechanism for adding images as fixtures.
    //
    // The structure of an image fixture is slightly different than you might
    // at first expect, rather than using an image element alone image fixtures
    // use a image element within a (typically) block level element, for
    // example:
    //
    // <div
    //    data-ce-tag="img-fixed"
    //    style="background-url: url('some-image.jpg');"
    //    >
    //    <img src="some-image.jpg" alt="Some image">
    // </div>
    //
    // This structure provides makes it easy to use CSS to set how the image
    // covers the fixture (typically the inner image element is hidden).

    constructor(tagName, attributes, src) {
        super(tagName, attributes);

        // The source of the image
        this._src = src;
    }

    // Read-only properties

    cssTypeName() {
        return 'image-fixture';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'ImageFixture';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'ImageFixture';
    }

    // Methods

    html(indent) {
        // Return a HTML string for the node
        if (indent == null) { indent = ''; }
        const le = ContentEdit.LINE_ENDINGS;
        const attributes = this._attributesToString();
        let alt = '';
        if (this._attributes['alt'] !== undefined) {
            alt = `alt=\"${ this._attributes['alt'] }\"`;
        }
        const img = `${ indent }<img src=\"${ this.src() }\"${ alt }>`;
        return `${ indent }<${ this.tagName() } ${ attributes }>${ le }` +
            `${ ContentEdit.INDENT }${ img }${ le }` +
            `${ indent }</${ this.tagName() }>`;
    }

    mount() {
        // Mount the element on to the DOM

        // Create the DOM element to mount
        this._domElement = document.createElement(this.tagName());

        // Set the attributes
        for (var name in this._attributes) {
            var value = this._attributes[name];
            if ((name === 'alt') || (name === 'style')) {
                continue;
            }
            this._domElement.setAttribute(name, value);
        }

        // Set the classes for the image, we combine classes from both the outer
        // link tag (if there is one) and image element.
        let classes = '';
        if (this.a && this.a['class']) {
            classes += ' ' + this.a['class'];
        }

        if (this._attributes['class']) {
            classes += ' ' + this._attributes['class'];
        }

        this._domElement.setAttribute('class', classes);

        // Remove any existing background image from the style attribute
        let style = this._attributes['style'] ? this._attributes['style'] : '';
        const styleElm = document.createElement('div');
        styleElm.setAttribute('style', style.trim());
        styleElm.style.backgroundImage = null;
        style = styleElm.getAttribute('style');

        // Set the background image for the element
        style = [style.trim(), `background-image:url('${ this.src() }');`].join(' ');

        this._domElement.setAttribute('style', style.trim());

        return super.mount();
    }

    src(src) {
        // Get/Set the image src for the element

        // Get...
        if (src === undefined) {
            return this._src;
        }

        // ...or set the image source
        this._src = src;

        // Re-mount the element if mounted
        if (this.isMounted()) {
            this.unmount();
            this.mount();
        }

        // Mark as modified
        return this.taint();
    }

    unmount() {
        // Unmount the element from the DOM
        if (this.isFixed()) {
            // Build the DOM element
            const wrapper = document.createElement('div');
            wrapper.innerHTML = this.html();
            const domElement = wrapper.firstElementChild;

            // Replace the current DOM element
            this._domElement.parentNode.replaceChild(domElement, this._domElement);
            this._domElement = domElement;
            return this.parent()._domElement = this._domElement;

        } else {
            return super.unmount();
        }
    }

    // Private methods

    _attributesToString() {
        // Special case handling of the background image within styles
        if (this._attributes['style']) {
            // Remove any existing background image from the style attribute
            let style = this._attributes['style'] ? this._attributes['style'] : '';
            const styleElm = document.createElement('div');
            styleElm.setAttribute('style', style.trim());
            styleElm.style.backgroundImage = null;
            style = styleElm.getAttribute('style');

            // Set the background image for the element
            style = [
                style.trim(),
                `background-image:url('${ this.src() }');`
            ].join(' ');
            this._attributes['style'] = style.trim();
        } else {
            this._attributes['style'] = `background-image:url('${ this.src() }');`;
        }

        // Build the table of attributes to compile into the string
        const attributes = {};
        for (var k in this._attributes) {
            var v = this._attributes[k];
            if (k === 'alt') {
                continue;
            }
            attributes[k] = v;
        }

        // Compile and return the string
        return ' ' + ContentEdit.attributesToString(attributes);
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type

        // Get the outer fixture attributes
        const {
            tagName
        } = domElement;
        let attributes = this.getDOMElementAttributes(domElement);

        // Get the image attributes
        let src = '';
        let alt = '';
        const childNodes = (Array.from(domElement.childNodes));
        for (var childNode of Array.from(childNodes)) {
            if ((childNode.nodeType === 1) 
                    && (childNode.tagName.toLowerCase() === 'img')) {
                src = childNode.getAttribute('src') || '';
                alt = childNode.getAttribute('alt') || '';
                break;
            }
        }

        attributes = this.getDOMElementAttributes(domElement);
        attributes['alt'] = alt;

        return new (this)(domElement.tagName, attributes, src);
    }
});
Cls$images.initClass();


// Register `ContentEdit.ImageFixture` the class with associated tag names
ContentEdit.TagNames.get().register(ContentEdit.ImageFixture, 'img-fixture');
