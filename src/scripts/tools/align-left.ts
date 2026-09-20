import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.AlignLeft = class AlignLeft extends ContentTools.Tool {
    static declare className: any;
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Apply a class to left align the contents of the current text block.
    
        ContentTools.ToolShelf.stow(this, 'align-left');
    
        this.label = 'Align left';
        this.icon = 'align-left';
        this.className = 'text-left';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return element.content !== undefined;
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the current
        // element/selection.
        let needle;
        if (!this.canApply(element)) {
            return false;
        }

        // List items and table cells use child nodes to manage their content
        // which don't support classes, so we need to check the parent.
        if ((needle = element.type(), ['ListItemText', 'TableCellText'].includes(needle))) {
            element = element.parent();
        }

        return element.hasCSSClass(this.className);
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        let className, needle;
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // List items and table cells use child nodes to manage their content
        // which don't support classes, so we need to use the parent.
        if ((needle = element.type(), ['ListItemText', 'TableCellText'].includes(needle))) {
            element = element.parent();
        }

        // Remove any existing text alignment classes applied
        const alignmentClassNames = [
            ContentTools.Tools.AlignLeft.className,
            ContentTools.Tools.AlignCenter.className,
            ContentTools.Tools.AlignRight.className
            ];
        for (className of Array.from<any>(alignmentClassNames)) {
            if (element.hasCSSClass(className)) {
                element.removeCSSClass(className);

                // If we're removing the class associated with the tool then we
                // can return early (this allows the tool to be toggled on/off).
                if (className === this.className) {
                    return callback(true);
                }
            }
        }

        // Add the alignment class to the element
        element.addCSSClass(this.className);

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
