import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Undo = class Undo extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare requiresElement: any;

    static initClass() {
    
        // Undo an action.
    
        ContentTools.ToolShelf.stow(this, 'undo');
    
        this.label = 'Undo';
        this.icon = 'undo';
        this.requiresElement = false;
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        const app = ContentTools.EditorApp.get();
        return app.history && app.history.canUndo();
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

        const app = this.editor();

        // Revert the document to the previous state
        app.history.stopWatching();
        const snapshot = app.history.undo();
        app.revertToSnapshot(snapshot);
        app.history.watch();

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
