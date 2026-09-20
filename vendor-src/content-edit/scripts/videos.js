import ContentEdit from './namespace.js';
import {rootContext} from '../../../src/core/root-context.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const Cls$videos = (ContentEdit.Video = class Video extends ContentEdit.ResizableElement {
    static initClass() {
    
        // Class properties
    
        this.droppers = {
            'Image': ContentEdit.Element._dropBoth,
            'PreText': ContentEdit.Element._dropBoth,
            'Static': ContentEdit.Element._dropBoth,
            'Text': ContentEdit.Element._dropBoth,
            'Video': ContentEdit.Element._dropBoth
        };
    
        // List of allowed drop placements for the class, supported values are:
        this.placements = ['above', 'below', 'left', 'right', 'center'];
    }

    // An editable video (e.g <video><source src="..." type="..."></video>).
    // The `Video` element supports 2 special tags to allow the the size of the
    // image to be constrained (data-ce-min-width, data-ce-max-width).
    //
    // NOTE: YouTube and Vimeo provide support for embedding videos using the
    // <iframe> tag. For this reason we support both video and iframe tags.
    //
    // `sources` should be specified or set against the element as a list of
    // dictionaries containing `src` and `type` key values.

    constructor(tagName, attributes, sources) {
        if (sources == null) { sources = []; }
        super(tagName, attributes);

        // List of sources for <video> elements
        this.sources = sources;

        // Set the aspect ratio for the image based on it's initial width/height
        const size = this.size();
        this._aspectRatio = size[1] / size[0];
    }

    // Read-only properties

    cssTypeName() {
        return 'video';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'Video';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'Video';
    }

    _title() {
        // Return a title (based on the source) for the video. This is intended
        // for internal use only.
        let src = '';
        if (this.attr('src')) {
            src = this.attr('src');
        } else {
            if (this.sources.length) {
                src = this.sources[0]['src'];
            }
        }
        if (!src) {
            src = 'No video source set';
        }

        // Limit the length to something sensible
        if (src.length > 80) {
            src = src.substr(0, 80) + '...';
        }

        return src;
    }

    // Methods

    createDraggingDOMElement() {
        // Create a DOM element that visually aids the user in dragging the
        // element to a new location in the editiable tree structure.
        if (!this.isMounted()) {
            return;
        }

        const helper = super.createDraggingDOMElement();
        helper.innerHTML = this._title();
        return helper;
    }

    html(indent) {
        // Return a HTML string for the node
        if (indent == null) { indent = ''; }
        const le = ContentEdit.LINE_ENDINGS;
        if (this.tagName() === 'video') {
            const sourceStrings = [];
            for (var source of Array.from(this.sources)) {
                var attributes = ContentEdit.attributesToString(source);
                sourceStrings.push(
                    `${ indent }${ ContentEdit.INDENT }<source ${ attributes }>`
                    );
            }
            return `${ indent }<video${ this._attributesToString() }>${ le }` +
                sourceStrings.join(le) +
                `${ le }${ indent }</video>`;
        } else {
            return `${ indent }<${ this._tagName }${ this._attributesToString() }>` +
                `</${ this._tagName }>`;
        }
    }

    mount() {
        // Mount the element on to the DOM

        // Create the DOM element to mount
        this._domElement = rootContext().createElement('div');

        // Set the classes for the video, we use the wrapping <a> tag's class if
        // it exists, else we use the class applied to the image.
        if (this.a && this.a['class']) {
            this._domElement.setAttribute('class', this.a['class']);

        } else if (this._attributes['class']) {
            this._domElement.setAttribute('class', this._attributes['class']);
        }

        // Set any styles for the element
        let style = this._attributes['style'] ? this._attributes['style'] : '';

        // Set the size using style
        if (this._attributes['width']) {
            style += `width:${ this._attributes['width'] }px;`;
        }

        if (this._attributes['height']) {
            style += `height:${ this._attributes['height'] }px;`;
        }

        this._domElement.setAttribute('style', style);

        // Set the title of the element (for mouse over)
        this._domElement.setAttribute('data-ce-title', this._title());

        return super.mount();
    }

    unmount() {
        // Unmount the element from the DOM

        if (this.isFixed()) {
            // Revert the DOM element to an iframe
            const wrapper = rootContext().createElement('div');
            wrapper.innerHTML = this.html();
            const domElement = wrapper.querySelector('iframe');

            // Replace the current DOM element with the iframe
            this._domElement.parentNode.replaceChild(domElement, this._domElement);
            this._domElement = domElement;
        }

        return super.unmount();
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type

        // Check for source elements
        const childNodes = (Array.from(domElement.childNodes));
        const sources = [];
        for (var childNode of Array.from(childNodes)) {
            if ((childNode.nodeType === 1) 
                    && (childNode.tagName.toLowerCase() === 'source')) {
                sources.push(this.getDOMElementAttributes(childNode));
            }
        }

        return new (this)(
            domElement.tagName,
            this.getDOMElementAttributes(domElement),
            sources
            );
    }
});
Cls$videos.initClass();


// Register `ContentEdit.Video` the class with associated tag names
ContentEdit.TagNames.get().register(ContentEdit.Video, 'iframe', 'video');
