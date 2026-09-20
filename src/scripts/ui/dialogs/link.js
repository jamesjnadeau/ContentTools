import ContentEdit from '../../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../../namespace.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
(function() {
    let NEW_WINDOW_TARGET = undefined;
    const Cls$ui_dialogs_link = (ContentTools.LinkDialog = class LinkDialog extends ContentTools.AnchoredDialogUI {
        static initClass() {
    
            // An anchored dialog to support inserting/modifying a link
    
            // The target that will be set by the link tool if the open in new window
            // option is selected.
            NEW_WINDOW_TARGET = '_blank';
        }

        constructor(href, target) {
            if (href == null) { href = ''; }
            if (target == null) { target = ''; }
            super();

            // The initial value to set the href and target attribute
            // of the link as (e.g if we're editing a link).
            this._href = href;
            this._target = target;
        }

        mount() {
            // Mount the widget
            super.mount();

            // Create the input element for the link
            this._domInput = document.createElement('input');
            this._domInput.setAttribute('class', 'ct-anchored-dialog__input');
            this._domInput.setAttribute('name', 'href');
            this._domInput.setAttribute(
                'placeholder',
                ContentEdit._('Enter a link') + '...'
                );
            this._domInput.setAttribute('type', 'text');
            this._domInput.setAttribute('value', this._href);
            this._domElement.appendChild(this._domInput);

            // Create a toggle button to allow users to toogle between no target and
            // TARGET (open in a new window).
            this._domTargetButton = this.constructor.createDiv([
                'ct-anchored-dialog__target-button']);
            this._domElement.appendChild(this._domTargetButton);

            // Check if the new window target has already been set for the link
            if (this._target === NEW_WINDOW_TARGET) {
                ContentEdit.addCSSClass(
                    this._domTargetButton,
                    'ct-anchored-dialog__target-button--active'
                );
            }

            // Create the confirm button
            this._domButton = this.constructor.createDiv(['ct-anchored-dialog__button']);
            this._domElement.appendChild(this._domButton);

            // Add interaction handlers
            return this._addDOMEventListeners();
        }

        save() {
            // Save the link. This method triggers the save method against the dialog
            // allowing the calling code to listen for the `save` event and manage
            // the outcome.

            if (!this.isMounted()) {
                this.dispatchEvent(this.createEvent('save'));
                return;
            }

            const detail = {href: this._domInput.value.trim()};
            if (this._target) {
                detail.target = this._target;
            }

            return this.dispatchEvent(this.createEvent('save', detail));
        }

        show() {
            // Show the widget
            super.show();

            // Once visible automatically give focus to the link input
            this._domInput.focus();

            // If a there's an intially value then select it so it can be easily
            // replaced.
            if (this._href) {
                return this._domInput.select();
            }
        }

        unmount() {
            // Unmount the component from the DOM

            // Unselect any content
            if (this.isMounted()) {
                this._domInput.blur();
            }

            super.unmount();

            this._domButton = null;
            return this._domInput = null;
        }

        // Private methods

        _addDOMEventListeners() {
            // Add event listeners for the widget

            // Add support for saving the link whenever the `return` key is pressed
            // or the button is selected.

            // Input
            this._domInput.addEventListener('keypress', ev => {
                if (ev.keyCode === 13) {
                    return this.save();
                }
            });

            // Toggle the target attribute for the link ('' or TARGET)
            this._domTargetButton.addEventListener('click', ev => {
                ev.preventDefault();

                // No target
                if (this._target === NEW_WINDOW_TARGET) {
                    this._target = '';
                    return ContentEdit.removeCSSClass(
                        this._domTargetButton,
                        'ct-anchored-dialog__target-button--active'
                    );

                // Target TARGET
                } else {
                    this._target = NEW_WINDOW_TARGET;
                    return ContentEdit.addCSSClass(
                        this._domTargetButton,
                        'ct-anchored-dialog__target-button--active'
                    );
                }
            });

            // Button
            return this._domButton.addEventListener('click', ev => {
                ev.preventDefault();
                return this.save();
            });
        }
    });
    Cls$ui_dialogs_link.initClass();
    return Cls$ui_dialogs_link;
})();
