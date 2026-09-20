import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Heading = class Heading extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Convert the current text block to a heading (e.g <h1>foo</h1>)
    
        ContentTools.ToolShelf.stow(this, 'heading');
    
        this.label = 'Heading';
        this.icon = 'heading';
        this.tagName = 'h1';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.

        if (element.isFixed()) {
            return false;
        }

        return (element.content !== undefined) &&
                (['Text', 'PreText'].indexOf(element.type()) !== -1);
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the current
        // element/selection.
        if (!element.content) {
            return false;
        }

        if (['Text', 'PreText'].indexOf(element.type()) === -1) {
            return false;
        }

        return element.tagName() === this.tagName;
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
        element.storeState();

        // If the tag is a PreText tag then we need to handle the convert the
        // element not just the tag name.
        if (element.type() === 'PreText') {
            // Convert the element to a Text element first
            const content = element.content.html().replace(/&nbsp;/g, ' ');
            const textElement = new ContentEdit.Text(this.tagName, {}, content);

            // Remove the current element from the region
            const parent = element.parent();
            const insertAt = parent.children.indexOf(element);
            parent.detach(element);
            parent.attach(textElement, insertAt);

            // Restore selection
            element.blur();
            textElement.focus();
            textElement.selection(selection);

        } else {
            // Change the text elements tag name

            // Remove any CSS classes from the element
            element.removeAttr('class');

            // If the element already has the same tag name as the tool will
            // apply revert the element to a paragraph.
            if (element.tagName() === this.tagName) {
                element.tagName('p');
            } else {
                element.tagName(this.tagName);
            }

            element.restoreState();
        }

        // Dispatch `applied` event
        this.dispatchEditorEvent('tool-applied', toolDetail);

        return callback(true);
    }
});
Cls$tools.initClass();
