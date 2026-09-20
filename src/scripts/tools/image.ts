import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Image = class Image extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Insert an image.
    
        ContentTools.ToolShelf.stow(this, 'image');
    
        this.label = 'Image';
        this.icon = 'image';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        if (element.isFixed()) {
            if (element.type() !== 'ImageFixture') {
                return false;
            }
        }
        return true;
    }

    static apply(element, selection, callback) {

        // Dispatch `apply` event
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // If supported allow store the state for restoring once the dialog is
        // cancelled.
        if (element.storeState) {
            element.storeState();
        }

        // Set-up the dialog
        const app = ContentTools.EditorApp.get();

        // Modal
        const modal = new ContentTools.ModalUI();

        // Dialog
        const dialog = new ContentTools.ImageDialog();

        // Support cancelling the dialog
        dialog.addEventListener('cancel', () => {

            modal.hide();
            dialog.hide();

            if (element.restoreState) {
                element.restoreState();
            }

            return callback(false);
        });

        // Support saving the dialog
        dialog.addEventListener('save', ev => {
            const detail = ev.detail();
            const {
                imageURL
            } = detail;
            const {
                imageSize
            } = detail;
            let {
                imageAttrs
            } = detail;

            if (!imageAttrs) {
                imageAttrs = {};
            }

            imageAttrs.height = imageSize[1];
            imageAttrs.src = imageURL;
            imageAttrs.width = imageSize[0];

            if (element.type() === 'ImageFixture') {
                // Configure the image source against the fixture
                element.src(imageURL);

            } else {
                // Create the new image
                const image = new ContentEdit.Image(imageAttrs);

                // Find insert position
                const [node, index] = Array.from<any>(this._insertAt(element));
                node.parent().attach(image, index);

                // Focus the new image
                image.focus();
            }

            modal.hide();
            dialog.hide();

            callback(true);

            // Dispatch `applied` event
            return this.dispatchEditorEvent('tool-applied', toolDetail);
        });

        // Show the dialog
        app.attach(modal);
        app.attach(dialog);
        modal.show();
        return dialog.show();
    }
});
Cls$tools.initClass();
