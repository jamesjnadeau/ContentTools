import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Remove = class Remove extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Remove the current element.
    
        ContentTools.ToolShelf.stow(this, 'remove');
    
        this.label = 'Remove';
        this.icon = 'remove';
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

        // Apply the tool to the current element
        const app = this.editor();

        // Blur the element before it's removed otherwise it will retain focus
        // even when detached.
        element.blur();

        // Focus on the next element
        if (element.nextContent()) {
            element.nextContent().focus();
        } else if (element.previousContent()) {
            element.previousContent().focus();
        }

        // Check the element is still mounted (some elements may automatically
        // remove themselves when they lose focus, for example empty text
        // elements.
        if (!element.isMounted()) {
            callback(true);

            // Dispatch `applied` event
            this.dispatchEditorEvent('tool-applied', toolDetail);

            return;
        }

        // Remove the element
        switch (element.type()) {
            case 'ListItemText':
                // Delete the associated list or list item
                if (app.ctrlDown()) {
                    const list = element.closest(node => node.parent().type() === 'Region');
                    list.parent().detach(list);
                } else {
                    element.parent().parent().detach(element.parent());
                }
                break;
            case 'TableCellText':
                // Delete the associated table or table row
                if (app.ctrlDown()) {
                    const table = element.closest(node => node.type() === 'Table');
                    table.parent().detach(table);
                } else {
                    const row = element.parent().parent();
                    row.parent().detach(row);
                }
                break;
            default:
                element.parent().detach(element);
                break;
        }

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
