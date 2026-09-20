/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentEdit.Fixture = class Fixture extends ContentEdit.NodeCollection {

    // Fixtures take a DOM element and convert it to a single editable element,
    // this allows the creation of field like regions within a page.

    constructor(domElement) {
        let cls;
        super();

        // The DOM element associated with this region of editable content
        this._domElement = domElement;

        // Convert the existing contents of the DOM element to editable elements
        const tagNames = ContentEdit.TagNames.get();

        // Find the class associated with this fixtures tag name
        if (this._domElement.getAttribute("data-ce-tag")) {
            cls = tagNames.match(this._domElement.getAttribute("data-ce-tag"));
        } else {
            cls = tagNames.match(this._domElement.tagName);
        }

        // Convert the node to a ContentEdit.Element
        const element = cls.fromDOMElement(this._domElement);

        // Modify the mount method for the element
        this.children = [element];

        element._parent = this;
        element.mount();

        // Trigger a ready event for the region
        ContentEdit.Root.get().trigger('ready', this);
    }

    // Read-only properties

    domElement() {
        // Return the DOM element associated with the region.
        return this._domElement;
    }

    isMounted() {
        // Return true if the node is mounted in the DOM.
        return true;
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'Fixture';
    }

    // Methods

    html(indent) {
        // Return a HTML string for the node
        if (indent == null) { indent = ''; }
        const le = ContentEdit.LINE_ENDINGS;
        return (Array.from(this.children).map((c) => c.html(indent))).join(le).trim();
    }
};