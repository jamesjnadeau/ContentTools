/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class ImageUploader {
    static initClass() {
        // A dummy image uploader to allow the image dialog to be tested in the
        // sandbox environment.
    
        this.imagePath = 'image.png';
        this.imageSize = [600, 174];
    }

    constructor(dialog) {
        // Initialize the dialog to support image uploads

        this._dialog = dialog;

        // Listen to key events from the dialog and assign handlers to each
        this._dialog.addEventListener('cancel', () => {
            return this._onCancel();
        });

        this._dialog.addEventListener('imageuploader.cancelupload', () => {
            return this._onCancelUpload();
        });

        this._dialog.addEventListener('imageuploader.clear', () => {
            return this._onClear();
        });

        this._dialog.addEventListener('imageuploader.fileready', ev => {
            return this._onFileReady(ev.detail().file);
        });

        this._dialog.addEventListener('imageuploader.mount', () => {
            return this._onMount();
        });

        this._dialog.addEventListener('imageuploader.rotateccw', () => {
            return this._onRotateCCW();
        });

        this._dialog.addEventListener('imageuploader.rotatecw', () => {
            return this._onRotateCW();
        });

        this._dialog.addEventListener('imageuploader.save', () => {
            return this._onSave();
        });

        this._dialog.addEventListener('imageuploader.unmount', () => {
            return this._onUnmount();
        });
    }

    // Event handlers

    _onCancel() {}
        // Handle the user cancelling the dialog

    _onCancelUpload() {
        // Handle an upload being cancelled

        // Stop the upload
        clearTimeout(this._uploadingTimeout);

        // Set the dialog to empty
        return this._dialog.state('empty');
    }

    _onClear() {
        // Handle the current image being cleared
        return this._dialog.clear();
    }

    _onFileReady(file) {
        // Handle a file being selected by the user
        console.log(file);

        // Set the dialog state to uploading
        this._dialog.progress(0);
        this._dialog.state('uploading');

        // Simulate uploading the specified file
        var upload = () => {
            let progress = this._dialog.progress();
            progress += 1;

            if (progress <= 100) {
                this._dialog.progress(progress);
                return this._uploadingTimeout = setTimeout(upload, 25);
            } else {
                return this._dialog.populate(
                    ImageUploader.imagePath,
                    ImageUploader.imageSize
                    );
            }
        };

        return this._uploadingTimeout = setTimeout(upload, 25);
    }

    _onMount() {}
        // Handle the dialog being mounted on the UI

    _onRotateCCW() {
        // Handle a request by the user to rotate the image counter-clockwise

        // Simulate rotating the image
        this._dialog.busy(true);
        const clearBusy = () => {
            return this._dialog.busy(false);
        };
        return setTimeout(clearBusy, 1500);
    }

    _onRotateCW() {
        // Handle a request by the user to rotate the image clockwise

        // Simulate rotating the image
        this._dialog.busy(true);
        const clearBusy = () => {
            return this._dialog.busy(false);
        };
        return setTimeout(clearBusy, 1500);
    }

    _onSave() {
        // Handle the user saving the image

        // Simulate processing the image
        this._dialog.busy(true);
        const clearBusy = () => {
            this._dialog.busy(false);
            return this._dialog.save(
                ImageUploader.imagePath,
                ImageUploader.imageSize,
                {alt: 'Example of bad variable names'}
                );
        };

        return setTimeout(clearBusy, 1500);
    }

    _onUnmount() {}
        // Handle the dialog being unmounted from the UI

    // Class methods

    static createImageUploader(dialog) {
        return new ImageUploader(dialog);
    }
}
ImageUploader.initClass();

window.ImageUploader = ImageUploader;