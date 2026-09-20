import ContentSelect from '../../content-select/content-select.js';
import ContentEdit from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class _Root extends ContentEdit.Node {

    // The root node manages state and listens for events for all nodes. However
    // it is not the root of the tree, individual editable regions within the
    // HTML each have their own tree structure that is rooted to a
    // `ContentEdit.Region` instance.
    //
    // The root node actually has no specific knowledge of any other node and in
    // this respect it is perhaps more useful to visualise it as a floating node
    // that all other nodes talk to (and through).

    constructor() {
        super();

        this._onDrag = this._onDrag.bind(this);
        this._onStopDragging = this._onStopDragging.bind(this);
        this._onResize = this._onResize.bind(this);
        this._onStopResizing = this._onStopResizing.bind(this);

        // The currently focused element
        this._focused = null;

        // The currently dragging and dropping elements
        this._dragging = null;
        this._dropTarget = null;

        // A helper DOM element used when dragging an element
        this._draggingDOMElement = null;

        // The currently resizing element
        this._resizing = null;
        this._resizingInit = null;
    }

    // Read-only properties

    dragging() {
        // Return the element that currently is being dragged (if any)
        return this._dragging;
    }

    dropTarget() {
        // Return the element that is the dragging element is currently over
        return this._dropTarget;
    }

    focused() {
        // Return the element that currently has focus (if any)
        return this._focused;
    }

    resizing() {
        // Return the element that currently is being resized (if any)
        return this._resizing;
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'Root';
    }

    // Dragging methods

    cancelDragging() {
        // Cancel the current dragging interaction

        // Check there's a dragging interaction to cancel
        if (!this._dragging) {
            return;
        }

        // Remove dragging helper
        document.body.removeChild(this._draggingDOMElement);

        // Remove dragging behaviour
        document.removeEventListener('mousemove', this._onDrag);
        document.removeEventListener('mouseup', this._onStopDragging);

        // Mark the element as no longer being dragged
        this._dragging._removeCSSClass('ce-element--dragging');
        this._dragging = null;
        this._dropTarget = null;

        // Remove dragging class from body
        return ContentEdit.removeCSSClass(document.body, 'ce--dragging');
    }

    startDragging(element, x, y) {
        // Set an element as dragging (only one element can be dragged at any one
        // time).
        if (this._dragging) {
            return;
        }

        // Set this element as dragging
        this._dragging = element;

        // Mark the elment as being dragged
        this._dragging._addCSSClass('ce-element--dragging');

        // Add a helper class for the element
        this._draggingDOMElement = this._dragging.createDraggingDOMElement();
        document.body.appendChild(this._draggingDOMElement);

        // Position the drag helper at the mouse cursor
        this._draggingDOMElement.style.left = `${ x }px`;
        this._draggingDOMElement.style.top = `${ y }px`;

        // Setup dragging behaviour for the element
        document.addEventListener('mousemove', this._onDrag);
        document.addEventListener('mouseup', this._onStopDragging);

        // Add dragging class to body
        return ContentEdit.addCSSClass(document.body, 'ce--dragging');
    }

    _getDropPlacement(x, y) {
        // Return the vertical and horizonal placement of a dragged element over
        // the current drop target element.
        if (!this._dropTarget) {
            return null;
        }

        // Calculate the cursors position relative to the drop target
        const rect = this._dropTarget.domElement().getBoundingClientRect();
        [x, y] = Array.from([x - rect.left, y - rect.top]);

        // Determine the placement of the element
        let horz = 'center';
        if (x < ContentEdit.DROP_EDGE_SIZE) {
            horz = 'left';
        } else if (x > (rect.width - ContentEdit.DROP_EDGE_SIZE)) {
            horz = 'right';
        }

        let vert = 'above';
        if (y > (rect.height / 2)) {
            vert = 'below';
        }

        return [vert, horz];
    }

    _onDrag(ev) {
        // Prevent content selection while dragging elements
        ContentSelect.Range.unselectAll();

        // Position the drag helper at the mouse cursor
        this._draggingDOMElement.style.left = `${ ev.pageX }px`;
        this._draggingDOMElement.style.top = `${ ev.pageY }px`;

        // Set classes
        if (this._dropTarget) {
            const placement = this._getDropPlacement(ev.clientX, ev.clientY);

            // Clear existing placement classes
            this._dropTarget._removeCSSClass('ce-element--drop-above');
            this._dropTarget._removeCSSClass('ce-element--drop-below');
            this._dropTarget._removeCSSClass('ce-element--drop-center');
            this._dropTarget._removeCSSClass('ce-element--drop-left');
            this._dropTarget._removeCSSClass('ce-element--drop-right');

            // Set current placement classes
            if (Array.from(this._dragging.constructor.placements).includes(placement[0])) {
                this._dropTarget._addCSSClass(`ce-element--drop-${ placement[0] }`);
            }

            if (Array.from(this._dragging.constructor.placements).includes(placement[1])) {
                return this._dropTarget._addCSSClass(`ce-element--drop-${ placement[1] }`);
            }
        }
    }

    _onStopDragging(ev) {
        // Looking into how we can detect the region the cursor is in for the
        // element.
        const placement = this._getDropPlacement(ev.clientX, ev.clientY);

        // Drop the dragging element
        this._dragging.drop(this._dropTarget, placement);

        // Reset the dragging interactions
        return this.cancelDragging();
    }

    // Resizing methods

    startResizing(element, corner, x, y, fixed) {
        // Set an element as resizing (only one element can be resized at any one
        // time).
        if (this._resizing) {
            return;
        }

        // Set this element as resizing
        this._resizing = element;

        // Remember the initial starting point and the elements size at the point
        // the user started to resize it.
        this._resizingInit = {
            corner,
            fixed,
            origin: [x, y],
            size: element.size()
            };

        // Mark the elment as being dragged
        this._resizing._addCSSClass('ce-element--resizing');

        // Measure the width of the parent element we're resizing within so we
        // can constrain the resize to fit.
        const parentDom = this._resizing.parent().domElement();

        // To measure the parent's width exluding padding we add a block element
        // and measure it's width before removing.
        const measureDom = document.createElement('div');
        measureDom.setAttribute('class', 'ce-measure');
        parentDom.appendChild(measureDom);
        this._resizingParentWidth = measureDom.getBoundingClientRect().width;
        parentDom.removeChild(measureDom);

        // Setup dragging behaviour for the element
        document.addEventListener('mousemove', this._onResize);
        document.addEventListener('mouseup', this._onStopResizing);

        // Add resizing class to body
        return ContentEdit.addCSSClass(document.body, 'ce--resizing');
    }

    _onResize(ev) {
        // Prevent content selection while resizing elements
        let height;
        ContentSelect.Range.unselectAll();

        // Calculate the 'x' size change that needs to be applied
        let x = this._resizingInit.origin[0] - ev.clientX;

        // Use the anchor to determine which direction increases/decreases the
        // 'x' size.
        if (this._resizingInit.corner[1] === 'right') {
            x = -x;
        }

        // Calculate the width and height
        let width = this._resizingInit.size[0] + x;

        // The width cannot be greater that the parent containers width
        width = Math.min(width, this._resizingParentWidth);

        // If the aspect ratio is fixed use the width to generate the height...
        if (this._resizingInit.fixed) {
            height = width * this._resizing.aspectRatio();

        // ...else adjust the height based on the y distance.
        } else {

            // Calculate the 'y' size change that needs to be applied
            let y = this._resizingInit.origin[1] - ev.clientY;

            // Use the anchor to determine which direction increases/decreases
            // the 'y' size.
            if (this._resizingInit.corner[0] === 'bottom') {
                y = -y;
            }

            height = this._resizingInit.size[1] + y;
        }

        // Set the new size for the element
        return this._resizing.size([width, height]);
    }

    _onStopResizing(ev) {
        // Reset the resizing interactions

        // Remove resizing behaviour
        document.removeEventListener('mousemove', this._onResize);
        document.removeEventListener('mouseup', this._onStopResizing);

        // Mark the element as no longer being resized
        // Mark the elment as being dragged
        this._resizing._removeCSSClass('ce-element--resizing');
        this._resizing = null;
        this._resizingInit = null;
        this._resizingParentWidth = null;

        // Remove resizing class from body
        return ContentEdit.removeCSSClass(document.body, 'ce--resizing');
    }
}


(function() {
    let instance = undefined;
    const Cls$root = (ContentEdit.Root = class Root {
        static initClass() {
    
            // The `ContentEdit.Root` class is a singleton, this code provides access to
            // the singleton instance of the protected `_Root` class which is initialized
            // the first time the class method `get` is called.
    
            instance = null;
        }

        static get() {
            return instance != null ? instance : (instance = new _Root());
        }
    });
    Cls$root.initClass();
    return Cls$root;
})();
