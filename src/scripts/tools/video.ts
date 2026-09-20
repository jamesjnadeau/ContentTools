import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Video = class Video extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Insert a video.
    
        ContentTools.ToolShelf.stow(this, 'video');
    
        this.label = 'Video';
        this.icon = 'video';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return !element.isFixed();
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
        const dialog = new ContentTools.VideoDialog();

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
            const {
                url
            } = ev.detail();

            if (url) {
                // Create the new video
                const video = new ContentEdit.Video(
                    'iframe', {
                        'frameborder': 0,
                        'height': ContentTools.DEFAULT_VIDEO_HEIGHT,
                        'src': url,
                        'width': ContentTools.DEFAULT_VIDEO_WIDTH
                        });

                // Find insert position
                const [node, index] = Array.from<any>(this._insertAt(element));
                node.parent().attach(video, index);

                // Focus the new video
                video.focus();

            } else {
                // Nothing to do restore state
                if (element.restoreState) {
                    element.restoreState();
                }
            }

            modal.hide();
            dialog.hide();

            const applied = url !== '';
            callback(applied);

            // Dispatch `applied` event
            if (applied) {
                return this.dispatchEditorEvent('tool-applied', toolDetail);
            }
        });

        // Show the dialog
        app.attach(modal);
        app.attach(dialog);
        modal.show();
        return dialog.show();
    }
});
Cls$tools.initClass();
