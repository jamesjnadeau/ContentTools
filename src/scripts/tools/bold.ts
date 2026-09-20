import HTMLString from '../../../vendor-src/html-string/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Bold = class Bold extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Make the current selection of text (non)bold (e.g <b>foo</b>).
    
        ContentTools.ToolShelf.stow(this, 'bold');
    
        this.label = 'Bold';
        this.icon = 'bold';
        this.tagName = 'b';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        if (!element.content) {
            return false;
        }

        return selection && !selection.isCollapsed();
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the current
        // element/selection.
        if ((element.content === undefined) || !element.content.length()) {
            return false;
        }

        let [from, to] = Array.from<any>(selection.get());
        if (from === to) {
            to += 1;
        }

        return element.content.slice(from, to).hasTags(this.tagName, true);
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

        element.storeState();

        const [from, to] = Array.from<any>(selection.get());

        if (this.isApplied(element, selection)) {
            element.content = element.content.unformat(
                from,
                to,
                new HTMLString.Tag(this.tagName)
                );
        } else {
            element.content = element.content.format(
                from,
                to,
                new HTMLString.Tag(this.tagName)
                );
        }

        element.content.optimize();
        element.updateInnerHTML();
        element.taint();

        element.restoreState();

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
