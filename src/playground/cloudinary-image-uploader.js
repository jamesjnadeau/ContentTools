/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class CloudinaryImageUploader {
    static initClass() {
        // An image uploader for the cloudinary image service (http://cloudinary.com)
    
        // The name of the cloud to upload images to
        this.CLOUD_NAME = '';
    
        // The dimensions of the image as a draft used for editing before insertion
        this.DRAFT_DIMENSIONS = [600, 600];
    
        // The default dimensions at which to insert the image at
        this.INSERT_DIMENSIONS = [400, 400];
    
        // The URL used to retreive images from the service
        this.RETRIEVE_URL = 'http://res.cloudinary.com/#CLOUD_NAME#/image/upload';
    
        // The preset code to uploaded to (required to support unsigned uploads)
        this.UPLOAD_PRESET = '';
    
        // The URL used to upload images to the service
        this.UPLOAD_URL = 'https://api.cloudinary.com/v1_1/#CLOUD_NAME#/image/upload';
    }

    constructor(dialog) {
        // Initialize the dialog to support image uploads
        this._dialog = dialog;

        // Add event handlers for the dialog
        this._dialog.addEventListener('imageuploader.cancelupload', () => {
            return this._onCancelUpload();
        });

        this._dialog.addEventListener('imageuploader.clear', () => {
            return this._onClear();
        });

        this._dialog.addEventListener('imageuploader.fileready', files => {
            return this._onFileReady(files);
        });

        this._dialog.addEventListener('imageuploader.rotateccw', () => {
            return this._onRotate(-90);
        });

        this._dialog.addEventListener('imageuploader.rotatecw', () => {
            return this._onRotate(90);
        });

        this._dialog.addEventListener('imageuploader.save', () => {
            return this._onSave();
        });
    }

    // Event handlers

    _onCancelUpload() {
        // Handle an upload being cancelled

        // Stop any upload
        if (this._xhr) {
            this._xhr.upload.removeEventListener('progress', this._xhrProgress);
            this._xhr.removeEventListener('readystatechange', this._xhrComplete);
            this._xhr.abort();
        }

        // Set the dialog to empty
        return this._dialog.state('empty');
    }

    _onClear() {
        // Handle the current image being cleared
        this._dialog.clear();
        return this._image = null;
    }

    _onFileReady(ev) {
        // Handle a file being selected by the user
        const {
            file
        } = ev.detail();

        // Set the dialog state to uploading
        this._dialog.progress(0);
        this._dialog.state('uploading');

        // Build the form data to post to the server
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', this.constructor.UPLOAD_PRESET);

        // Build a request to send the file
        this._xhr = new XMLHttpRequest();
        this._xhr.open('POST', this.constructor._getUploadURL(), true);

        // Handle progress
        this._xhrProgress = ev => {
            return this._dialog.progress((ev.loaded / ev.total) * 100);
        };

        // Handle completion
        this._xhrComplete = ev => {
            const {
                readyState
            } = ev.target;
            const text = ev.target.responseText;
            const {
                status
            } = ev.target;

            // Look for done response
            if (readyState !== 4) {
                return;
            }

            // Clear the XHR reference
            this._xhr = null;

            // Handle the result of the upload
            if (parseInt(status) === 200) {
                // Unpack the response (JSON)
                this._image = JSON.parse(text);

                // Store basic image attributes
                this._image.angle = 0;
                this._image.width = parseInt(this._image.width);
                this._image.height = parseInt(this._image.height);
                this._image.maxWidth = this._image.width;

                // Apply a draft size to the image for editing
                const filename = this.constructor.parseURL(this._image.url)[0];
                this._image.url = this.constructor.buildURL(
                    filename,
                    [this.constructor._getDraftTransform()]
                    );

                // Update the image in the dialog viewer
                return this._dialog.populate(this._image.url, [this._image.width, this._image.height]);

            } else {
                // Handle error response
                return new ContentTools.FlashUI('no');
            }
        };

        this._xhr.upload.addEventListener('progress', this._xhrProgress);
        this._xhr.addEventListener('readystatechange', this._xhrComplete);

        // Send the file
        return this._xhr.send(formData);
    }

    _onRotate(angle) {
        // Handle a request by the user to rotate the image

        // Update the angle of the image
        this._image.angle += angle;

        // Stay with the range 0-360
        if (this._image.angle < 0) {
            this._image.angle += 360;
        } else if (this._image.angle > 270) {
            this._image.angle -= 360;
        }

        // Whenever the image is rotated the dimensions are switched
        const w = this._image.width;
        const h = this._image.height;
        this._image.width = h;
        this._image.height = w;
        this._image.maxWidth = this._image.width;

        // Build the transform for the image
        const transforms = [this.constructor._getDraftTransform()];
        if (this._image.angle > 0) {
            transforms.unshift({a: this._image.angle});
        }

        // Apply the rotation
        const filename = this.constructor.parseURL(this._image.url)[0];
        this._image.url = this.constructor.buildURL(filename, transforms);

        // Update the image in the dialog viewer
        return this._dialog.populate(this._image.url, [this._image.width, this._image.height]);
    }

    _onSave() {
        // Handle the user saving the image

        // Build the transforms to apply to the inserted image
        const transforms = [];

        // Angle
        if (this._image.angle !== 0) {
            transforms.push({a: this._image.angle});
        }

        // Crop
        const cropRegion = this._dialog.cropRegion();
        if (!(cropRegion.toString() === [0, 0, 1, 1].toString())) {
            const cropTransform = {
                c: 'crop',
                x: parseInt(this._image.width * cropRegion[1]),
                y: parseInt(this._image.height * cropRegion[0]),
                w: parseInt(this._image.width * (cropRegion[3] - cropRegion[1])),
                h: parseInt(this._image.height * (cropRegion[2] - cropRegion[0]))
                };

            // Update the width based on the crop
            this._image.width = cropTransform.w;
            this._image.height = cropTransform.h;
            this._image.maxWidth = this._image.width;

            transforms.push(cropTransform);
        }

        // Resize for insertion
        if ((this._image.width > this.constructor.INSERT_DIMENSIONS[0]) ||
                (this._image.height > this.constructor.INSERT_DIMENSIONS[1])) {

            transforms.push({
                c: 'fit',
                w: this.constructor.INSERT_DIMENSIONS[0],
                h: this.constructor.INSERT_DIMENSIONS[1]
                });

            // Update the size of the image to fit the resize
            const widthScale = this.constructor.INSERT_DIMENSIONS[0] / this._image.width;
            const heightScale = this.constructor.INSERT_DIMENSIONS[1] / this._image.height;
            const ratio = Math.min(widthScale, heightScale);
            this._image.width = ratio * this._image.width;
            this._image.height = ratio * this._image.height;
        }

        // Build a URL for the image to insert
        const filename = this.constructor.parseURL(this._image.url)[0];
        this._image.url = this.constructor.buildURL(filename, transforms);

        // Build the attributes for the image
        const attrs = {
            'alt': '',
            'data-ce-max-width': this._image.maxWidth
        };

        // Insert the image
        return this._dialog.save(this._image.url, [this._image.width, this._image.height], attrs);
    }

    // Class methods

    static createImageUploader(dialog) {
        return new (this)(dialog);
    }

    // Cloudinary utilities

    static _getDraftTransform(){
        // Return a transform to resize the image to the draft dimensions
        return {w: this.DRAFT_DIMENSIONS[0], h: this.DRAFT_DIMENSIONS[1], c: 'fit'};
    }

    static _getRetrieveURL() {
        // Return the URL that images are retrieved from
        return this.RETRIEVE_URL.replace('#CLOUD_NAME#', this.CLOUD_NAME);
    }

    static _getUploadURL() {
        // Return the URL that images are uploaded to
        return this.UPLOAD_URL.replace('#CLOUD_NAME#', this.CLOUD_NAME);
    }

    static buildURL(filename, transforms) {
        // Build a URL from a filename and the transforms applied to the image

        // Build the transforms path
        const transformStrs = [];
        for (var transform of Array.from(transforms)) {
            var paramStrs = [];
            for (var name in transform) {
                var value = transform[name];
                paramStrs.push(`${ name }_${ value }`);
            }
            transformStrs.push(paramStrs.join(','));
        }

        // Build the URL
        const parts = [this._getRetrieveURL()];
        if (transformStrs.length > 0) {
            parts.push(transformStrs.join('/'));
        }
        parts.push(filename);

        return parts.join('/');
    }

    static parseURL(url) {
        // Parse a URL and return the filename and transformations

        // Strip the URL down to just the transformations, version (optional) and
        // filename.
        url = url.replace(new RegExp('^' + this._getRetrieveURL()), '');

        // Split the remaining path into parts
        const parts = url.split('/');
        parts.shift();

        // Extract the filename
        const filename = parts.pop();

        // If the URL contains a version remove it
        if (parts.length && parts[parts.length - 1].match(/v\d+/)) {
            parts.pop();
        }

        // Convert the remaining parts (transforms) into objects
        const transforms = [];
        for (var part of Array.from(parts)) {
            var transform = {};
            for (var pair of Array.from(part.split(','))) {
                var [name, value] = Array.from(pair.split('_'));
                transform[name] = value;
            }
            transforms.push(transform);
        }

        return [filename, transforms];
    }
}
CloudinaryImageUploader.initClass();

window.CloudinaryImageUploader = CloudinaryImageUploader;


// Capture resize events and update image URLs to cater
let _resizeTimeout = null;

ContentEdit.Root.get().bind('taint', function(element) {

    // We're only interested in images
    if (element.type() !== 'Image') {
        return;
    }

    // Give the user time to finish resizing before updating the URL
    if (_resizeTimeout) {
        clearTimeout(_resizeTimeout);
    }

    const resizeURL = function() {
        // Update the images URL to reflect it's new size
        const cls = CloudinaryImageUploader;

        // Parse the existing URL
        const [filename, transforms] = Array.from(cls.parseURL(element.attr('src')));

        // If we couldn't parse the image URL exit
        if (filename === undefined) {
            return;
        }

        // Switch out the size for the new size
        const newSize = element.size();

        // Remove any existing resize transform
        if ((transforms.length > 0) &&
                (transforms[transforms.length - 1]['c'] === 'fill')) {
            transforms.pop();
        }

        transforms.push({w: newSize[0], h: newSize[1], c: 'fill'});
        return element.attr('src', cls.buildURL(filename, transforms));
    };

    return _resizeTimeout = setTimeout(resizeURL, 500);
});