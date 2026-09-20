import HTMLString from '../../html-string/namespace.js';
import ContentEdit from './namespace.js';
import {rootContext} from '../../../src/core/root-context.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const Cls$static = (ContentEdit.Static = class Static extends ContentEdit.Element {
    static initClass() {
    
        // NOTE: Static elements cannot receive focus.
        this.prototype.blur = undefined;
        this.prototype.focus = undefined;
    
        // Class properties
    
        this.droppers =
            {'Static': ContentEdit.Element._dropVert};
    }

    // A non-editable (static) HTML element.

    // REVIEW: The primary purpose of static elements is to provide a fallback
    // for when a DOM element in an editable region has not been mapped to an
    // editable `ContentEdit.Element` class.
    //
    // To keep the code small we don't preventively override all the various
    // `ContentEdit.Element` methods, but they can't safely be called and as it
    // stands `ContentEdit.Static` elements should not be interacted with.
    //
    // The only interaction currently supported is dropping other elements on to
    // a static element, without support for this interaction static elements
    // could make it impossible to move a static element from the start or end of
    // a region.
    //
    // A known problem with the content of static elements is that we rely on the
    // browser's interpretation of the content (because we use innerHTML), this
    // can lead to differences is the output as well as inconsistencies between
    // browsers.

    constructor(tagName, attributes, content) {
        super(tagName, attributes);

        // The associated DOM element
        this._content = content;
    }

    // Read-only properties

    cssTypeName() {
        return 'static';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'Static';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'Static';
    }

    // Methods

    createDraggingDOMElement() {
        // Create a DOM element that visually aids the user in dragging the
        // element to a new location in the editiable tree structure.
        if (!this.isMounted()) {
            return;
        }

        const helper = super.createDraggingDOMElement();

        // Use the body of the node to create the helper but limit the text to
        // something sensible.

        // HACK: This is really a best guess at displaying something appropriate
        // in the helper since we have no idea what's contained in a static
        // element.
        let text = this._domElement.textContent;
        if (text.length > ContentEdit.HELPER_CHAR_LIMIT) {
            text = text.substr(0, ContentEdit.HELPER_CHAR_LIMIT);
        }

        helper.innerHTML = text;

        return helper;
    }

    html(indent) {
        // Return a HTML string for the node

        // Check if element is a self closing tag
        if (indent == null) { indent = ''; }
        if (HTMLString.Tag.SELF_CLOSING[this._tagName]) {
            return `${ indent }<${ this._tagName }${ this._attributesToString() }>`;
        }

        return `${ indent }<${ this._tagName }${ this._attributesToString() }>` +
            `${ this._content }` +
            `${ indent }</${ this._tagName }>`;
    }

    mount() {
        // Mount the element on to the DOM

        // Create the DOM element to mount
        this._domElement = rootContext().createElement(this._tagName);

        // Set the attributes
        for (var name in this._attributes) {
            var value = this._attributes[name];
            this._domElement.setAttribute(name, value);
        }

        // Set the content in the document
        this._domElement.innerHTML = this._content;

        return super.mount();
    }

    // Event handlers

    _onMouseDown(ev) {
        // Give the element focus
        super._onMouseDown(ev);

        // If the static element has the moveable flag set then allow it to be
        // dragged to a new position.
        if (this.attr('data-ce-moveable') !== undefined) {

            // We add a small delay to prevent drag engaging instantly
            clearTimeout(this._dragTimeout);
            return this._dragTimeout = setTimeout(
                () => {
                    return this.drag(ev.pageX, ev.pageY);
                },
                150
                );
        }
    }

    _onMouseOver(ev) {
        super._onMouseOver(ev);

        // Don't highlight that we're over the element
        return this._removeCSSClass('ce-element--over');
    }

    _onMouseUp(ev) {
        super._onMouseUp(ev);

        // If we're waiting to see if the user wants to drag the element, stop
        // waiting they don't.
        if (this._dragTimeout) {
            return clearTimeout(this._dragTimeout);
        }
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type
        return new (this)(
            domElement.tagName,
            this.getDOMElementAttributes(domElement),
            domElement.innerHTML
            );
    }
});
Cls$static.initClass();


// Register `ContentEdit.Static` the class with associated tag names
ContentEdit.TagNames.get().register(ContentEdit.Static, 'static');
