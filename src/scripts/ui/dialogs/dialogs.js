import ContentEdit from '../../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../../namespace.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.AnchoredDialogUI = class AnchoredDialogUI extends ContentTools.WidgetUI {

    // Base class for creating anchored dialogs. An anchored dialog appears above
    // the page but is anchored to a set position within, they are typically used
    // for in page edits, such as setting a link within the page.

    constructor() {
        super();

        // The position of the dialog
        this._position = [0, 0];
    }

    // Public methods

    mount() {
        // Mount the widget to the DOM
        //
        // Note: This method doesn't call the `_addEventListeners` method which
        // is typical of other UI components, instead it expects the inheriting
        // class to override this method and call `_addEventListeners` at the
        // appropriate point.

        // Create the dialog
        this._domElement = this.constructor.createDiv([
            'ct-widget',
            'ct-anchored-dialog'
            ]);
        this.parent().domElement().appendChild(this._domElement);

        // Set the position of the dialog
        this._contain();
        this._domElement.style.top = `${ this._position[1] }px`;
        return this._domElement.style.left = `${ this._position[0] }px`;
    }

    position(newPosition) {
        // Get/Set the position of the dialog
        if (newPosition === undefined) {
            return this._position.slice();
        }

        this._position = newPosition.slice();

        if (this.isMounted()) {
            this._contain();
            this._domElement.style.top = `${ this._position[1] }px`;
            return this._domElement.style.left = `${ this._position[0] }px`;
        }
    }

    // Private methods

    _contain() {
        // Ensure the position doesn't place the dialog off the page.

        // The component must be mounted in the DOM, if not we can't determined
        // the width and height and therefore whether the position places the
        // dialog off the page or not.
        if (!this.isMounted()) {
            return;
        }
        // Calculate half the width of the anchored dialog (as anchored dialogs
        // are displayed centrally) and add a 5 pixel buffer so we don't bump
        // right up to the edge.
        const rect = this._domElement.getBoundingClientRect();
        const halfWidth = ((rect.width / 2) + 5);

        // Get the width of the document excluding the scroll bars
        const pageWidth = document.documentElement.clientWidth ||
            document.body.clientWidth;

        // Adjust the position to be contained (if necessary)
        if ((this._position[0] + halfWidth) > pageWidth) {
            this._position[0] = pageWidth - halfWidth;
        }

        if (this._position[0] < halfWidth) {
            this._position[0] = halfWidth;
        }

        // Make sure the dialog does't get placed above the page
        if ((this._position[1] + rect.top) < 5) {
             return this._position[1] = Math.abs(rect.top) + 5;
         }
    }
};


ContentTools.DialogUI = class DialogUI extends ContentTools.WidgetUI {

    // Base class for creating standard dialogs.

    constructor(caption) {
        if (caption == null) { caption = ''; }
        super();

        // A flag indicating that the dialog is currently busy
        this._busy = false;

        // The dialog's caption
        this._caption = caption;
    }

    // Methods

    busy(busy) {
        // Get/Set the dialog's busy status
        if (busy === undefined) {
            return this._busy;
        }

        // Check that we need to change the current state of the dialog
        if (this._busy === busy) {
            return;
        }

        // Modify the state
        this._busy = busy;

        // Add/Remove busy modifier class to the dialog
        if (!this.isMounted()) {
            return;
        }

        if (this._busy) {
            return ContentEdit.addCSSClass(this._domElement, 'ct-dialog--busy');
        } else {
            return ContentEdit.removeCSSClass(this._domElement, 'ct-dialog--busy');
        }
    }

    caption(caption) {
        // Get/Set the caption for the dialog
        if (caption === undefined) {
            return this._caption;
        }

        // Replace any existing caption
        this._caption = caption;
        return this._domCaption.textContent = ContentEdit._(caption);
    }

    mount() {
        // Mount the widget to the DOM
        //
        // Note: This method doesn't call the `_addEventListeners` method which
        // is typical of other UI components, instead it expects the inheriting
        // class to override this method an call `_addEventListeners` at the
        // appropriate point.

        // Blur the focused element to ensure that it's contents can be edited
        // once the dialog is open.
        if (document.activeElement) {
            document.activeElement.blur();

            // HACK: This is a work around for blurring the contenteditable
            // element in webkit, thanks to Marek Suscak's fiddle here:
            // http://jsfiddle.net/mareksuscak/oytdoxy8/
            //
            // ~ Anthony Blackshaw <ant@getme.co.uk>, 28th June 2016
            window.getSelection().removeAllRanges();
        }

        // Create the dialog
        const dialogCSSClasses = [
            'ct-widget',
            'ct-dialog'
            ];
        if (this._busy) {
            dialogCSSClasses.push('ct-dialog--busy');
        }
        this._domElement = this.constructor.createDiv(dialogCSSClasses);
        this.parent().domElement().appendChild(this._domElement);

        // Add the dialog header
        const domHeader = this.constructor.createDiv(['ct-dialog__header']);
        this._domElement.appendChild(domHeader);

        // Caption
        this._domCaption = this.constructor.createDiv(['ct-dialog__caption']);
        domHeader.appendChild(this._domCaption);
        this.caption(this._caption);

        // Close button
        this._domClose = this.constructor.createDiv(['ct-dialog__close']);
        domHeader.appendChild(this._domClose);

        // Body
        const domBody = this.constructor.createDiv(['ct-dialog__body']);
        this._domElement.appendChild(domBody);

        // View
        this._domView = this.constructor.createDiv(['ct-dialog__view']);
        domBody.appendChild(this._domView);

        // Controls
        this._domControls = this.constructor.createDiv(['ct-dialog__controls']);
        domBody.appendChild(this._domControls);

        // Busy
        this._domBusy = this.constructor.createDiv(['ct-dialog__busy']);
        return this._domElement.appendChild(this._domBusy);
    }

    unmount() {
        // Unmount the component from the DOM
        super.unmount();

        this._domBusy = null;
        this._domCaption = null;
        this._domClose = null;
        this._domControls = null;
        return this._domView = null;
    }

    // Private methods

    _addDOMEventListeners() {
        // Add event listeners for the widget

        // Cancelling the dialog

        // Using the escape key
        this._handleEscape = ev => {

            // Check the dialog isn't busy
            if (this._busy) {
                return;
            }

            if (ev.keyCode === 27) {
                return this.dispatchEvent(this.createEvent('cancel'));
            }
        };

        document.addEventListener('keyup', this._handleEscape);

        // Via the close button
        return this._domClose.addEventListener('click', ev => {
            ev.preventDefault();

            // Check the dialog isn't busy
            if (this._busy) {
                return;
            }

            return this.dispatchEvent(this.createEvent('cancel'));
        });
    }

    _removeDOMEventListeners() {

        return document.removeEventListener('keyup', this._handleEscape);
    }
};
