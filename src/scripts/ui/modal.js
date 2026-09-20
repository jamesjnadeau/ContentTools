import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';
import {rootContext} from '../../core/root-context.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.ModalUI = class ModalUI extends ContentTools.WidgetUI {

    // The modal UI component provides an element over the page. The modal layer
    // prevents the user from interacting with the page whilst allowing them to
    // interact with UI components above the layer, for example a dialog.

    constructor(transparent, allowScrolling) {
        super();

        // If true the modal we be displayed completely transparently. This can
        // be useful when displaying an UI component above the page that is
        // close if the user clicks away from it, for example the add link
        // (caption) dialog.
        this._transparent = transparent;

        // If true then scrolling the page whilst the modal is open is not
        // disabled (the default behavior is to disable scrolling when a modal is
        // overlayed over the page content).
        this._allowScrolling =  allowScrolling;
    }

    // Methods

    mount() {
        // Mount the widget to the DOM

        // Modal
        this._domElement = this.constructor.createDiv([
            'ct-widget',
            'ct-modal'
            ]);
        this.parent().domElement().appendChild(this._domElement);

        // If set to transparent add the modifier
        if (this._transparent) {
            this.addCSSClass('ct-modal--transparent');
        }

        // Unless scrolling is set as allowed disable page scrolling
        if (!this._allowScrolling) {
            rootContext().setGlobalState('no-scroll', true);
        }

        // Add interaction handlers
        return this._addDOMEventListeners();
    }

    unmount() {
        // Unmount the widget from the DOM

        // Allow the page to be scrolled again
        if (!this._allowScrolling) {
            rootContext().setGlobalState('no-scroll', false);
        }

        return super.unmount();
    }

    // Private methods

    _addDOMEventListeners() {
        // Add DOM event listeners for the widget

        // Trigger a custom event for clicks on the modal
        return this._domElement.addEventListener('click', ev => {
            return this.dispatchEvent(this.createEvent('click'));
        });
    }
};
