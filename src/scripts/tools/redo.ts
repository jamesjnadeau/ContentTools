import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Redo = class Redo extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare requiresElement: any;

    static initClass() {
    
        // Redo an action.
    
        ContentTools.ToolShelf.stow(this, 'redo');
    
        this.label = 'Redo';
        this.icon = 'redo';
        this.requiresElement = false;
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        const app = ContentTools.EditorApp.get();
        return app.history && app.history.canRedo();
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

        const app = ContentTools.EditorApp.get();

        // Revert the document to the next state
        app.history.stopWatching();
        const snapshot = app.history.redo();
        app.revertToSnapshot(snapshot);
        app.history.watch();

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
