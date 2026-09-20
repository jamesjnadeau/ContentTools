import HTMLString from '../../../vendor-src/html-string/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.LineBreak = class LineBreak extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Insert a line break in to the current element at the specified selection.
    
        ContentTools.ToolShelf.stow(this, 'line-break');
    
        this.label = 'Line break';
        this.icon = 'line-break';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return element.content;
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

        // Insert a BR at the current in index
        const cursor = selection.get()[0] + 1;

        const tip = element.content.substring(0, selection.get()[0]);
        const tail = element.content.substring(selection.get()[1]);
        const br = new HTMLString.String('<br>', element.content.preserveWhitespace());
        element.content = tip.concat(br, tail);
        element.updateInnerHTML();
        element.taint();

        // Restore the selection
        selection.set(cursor, cursor);
        element.selection(selection);

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
