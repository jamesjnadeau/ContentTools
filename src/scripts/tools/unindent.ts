import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Unindent = class Unindent extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Unindent a list item.
    
        ContentTools.ToolShelf.stow(this, 'unindent');
    
        this.label = 'Unindent';
        this.icon = 'unindent';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return element.parent().type() === 'ListItem';
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // Indent the list item
        element.parent().unindent();

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
