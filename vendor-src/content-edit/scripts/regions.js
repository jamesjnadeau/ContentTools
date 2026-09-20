import ContentEdit from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentEdit.Region = class Region extends ContentEdit.NodeCollection {

    // Regions take a DOM element and convert the child DOM elements to other
    // editable elements. Regions acts as a root collection of the editable
    // elements.

    constructor(domElement) {
        super();

        // The DOM element associated with this region of editable content
        this._domElement = domElement;

        // Set the content for the region to match the DOM element
        this.setContent(domElement);
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
        return 'Region';
    }

    // Methods

    html(indent) {
        // Return a HTML string for the node
        if (indent == null) { indent = ''; }
        const le = ContentEdit.LINE_ENDINGS;
        return (Array.from(this.children).map((c) => c.html(indent))).join(le).trim();
    }

    setContent(domElementOrHTML) {
        // Set the contents of the region using a DOM element or HTML string
        let domElement = domElementOrHTML;
        if (domElementOrHTML.childNodes === undefined) {

            // Convert the HTML string to DOM elements we can pass
            const wrapper = document.createElement('div');
            wrapper.innerHTML = domElementOrHTML;
            domElement = wrapper;
        }

        // Unattach any existing elements
        for (var child of Array.from(this.children.slice())) {
            this.detach(child);
        }

        // Build and attach new content

        // Convert the existing contents of the DOM element to editable elements
        const tagNames = ContentEdit.TagNames.get();

        // Create a list if child nodes we can safely remove whilst iterating
        // through them.
        const childNodes = (Array.from(domElement.childNodes));

        for (var childNode of Array.from(childNodes)) {

            // Filter out non-elements
            var cls;
            if (childNode.nodeType !== 1) { // ELEMENT_NODE
                continue;
            }

            // Find the class associated with this node's tag name
            if (childNode.getAttribute('data-ce-tag')) {
                cls = tagNames.match(childNode.getAttribute('data-ce-tag'));
            } else {
                cls = tagNames.match(childNode.tagName);
            }

            // Convert the node to a ContentEdit.Element
            var element = cls.fromDOMElement(childNode);

            // Remove the node from the DOM
            domElement.removeChild(childNode);

            // Attach the element to the region
            if (element) {
                this.attach(element);
            }
        }

        // Trigger a ready event for the region
        return ContentEdit.Root.get().trigger('ready', this);
    }
};
