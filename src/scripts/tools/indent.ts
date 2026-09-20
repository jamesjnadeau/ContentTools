import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Indent = class Indent extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Indent a list item.
    
        ContentTools.ToolShelf.stow(this, 'indent');
    
        this.label = 'Indent';
        this.icon = 'indent';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.

        return (element.parent().type() === 'ListItem') &&
                (element.parent().parent().children.indexOf(element.parent()) > 0);
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
        element.parent().indent();

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
