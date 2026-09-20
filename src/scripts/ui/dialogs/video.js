/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.VideoDialog = class VideoDialog extends ContentTools.DialogUI {

    // A dialog to support inserting a video

    constructor(){
        super('Insert video');
    }

    clearPreview() {
        // Clear the current video preview
        if (this._domPreview) {
            this._domPreview.parentNode.removeChild(this._domPreview);
            return this._domPreview = undefined;
        }
    }

    mount() {
        // Mount the widget
        super.mount();

        // Update dialog class
        ContentEdit.addCSSClass(this._domElement, 'ct-video-dialog');

        // Update view class
        ContentEdit.addCSSClass(this._domView, 'ct-video-dialog__preview');

        // Add controls
        const domControlGroup = this.constructor.createDiv(['ct-control-group']);
        this._domControls.appendChild(domControlGroup);

        // Input
        this._domInput = document.createElement('input');
        this._domInput.setAttribute('class', 'ct-video-dialog__input');
        this._domInput.setAttribute('name', 'url');
        this._domInput.setAttribute(
            'placeholder',
            ContentEdit._('Paste YouTube or Vimeo URL') + '...'
            );
        this._domInput.setAttribute('type', 'text');
        domControlGroup.appendChild(this._domInput);

        // Insert button
        this._domButton = this.constructor.createDiv([
            'ct-control',
            'ct-control--text',
            'ct-control--insert',
            'ct-control--muted'
            ]);
        this._domButton.textContent = ContentEdit._('Insert');
        domControlGroup.appendChild(this._domButton);

        // Add interaction handlers
        return this._addDOMEventListeners();
    }

    preview(url) {
        // Preview the specified URL

        // Remove any existing preview
        this.clearPreview();

        // Insert the preview iframe
        this._domPreview = document.createElement('iframe');
        this._domPreview.setAttribute('frameborder', '0');
        this._domPreview.setAttribute('height', '100%');
        this._domPreview.setAttribute('src', url);
        this._domPreview.setAttribute('width', '100%');
        return this._domView.appendChild(this._domPreview);
    }

    save() {
        // Save the video. This method triggers the save method against the
        // dialog allowing the calling code to listen for the `save` event and
        // manage the outcome.

        // Attempt to parse a video embed URL
        const videoURL = this._domInput.value.trim();
        const embedURL = ContentTools.getEmbedVideoURL(videoURL);
        if (embedURL) {
            return this.dispatchEvent(this.createEvent('save', {'url': embedURL}));
        } else {
            // If we can't generate an embed URL trust that the user's knows what
            // they are doing and save with the supplied URL.
            return this.dispatchEvent(this.createEvent('save', {'url': videoURL}));
        }
    }

    show() {
        // Show the widget
        super.show();

        // Once visible automatically give focus to the link input
        return this._domInput.focus();
    }

    unmount() {
        // Unmount the component from the DOM

        // Unselect any content
        if (this.isMounted()) {
            this._domInput.blur();
        }

        super.unmount();

        this._domButton = null;
        this._domInput = null;
        return this._domPreview = null;
    }

    // Private methods

    _addDOMEventListeners() {
        // Add event listeners for the widget
        super._addDOMEventListeners();

        // Provide a preview of the video whenever a valid URL is inserted into
        // the input.
        this._domInput.addEventListener('input', ev => {

            // If the input field is empty we disable the insert button
           if (ev.target.value) {
                ContentEdit.removeCSSClass(this._domButton, 'ct-control--muted');
            } else {
                ContentEdit.addCSSClass(this._domButton, 'ct-control--muted');
            }

            // We give the user half a second to make additional changes before
            // updating the preview video otherwise changes to the text input can
            // appear to stutter as the browser updates the preview on every
            // change.

           if (this._updatePreviewTimeout) {
                clearTimeout(this._updatePreviewTimeout);
            }

           const updatePreview = () => {
                const videoURL = this._domInput.value.trim();
                const embedURL = ContentTools.getEmbedVideoURL(videoURL);
                if (embedURL) {
                    return this.preview(embedURL);
                } else {
                    return this.clearPreview();
                }
            };

           return this._updatePreviewTimeout = setTimeout(updatePreview, 500);
        });

        // Add support for saving the video whenever the `return` key is pressed
        // or the button is selected.

        // Input
        this._domInput.addEventListener('keypress', ev => {
            if (ev.keyCode === 13) {
                return this.save();
            }
        });

        // Button
        return this._domButton.addEventListener('click', ev => {
            ev.preventDefault();

            // Check the button isn't muted, if it is then the video URL fields
            // isn't populated.
            const cssClass = this._domButton.getAttribute('class');
            if (cssClass.indexOf('ct-control--muted') === -1) {
                return this.save();
            }
        });
    }
};