import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.UnorderedList = class UnorderedList extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare listTag: any;

    static initClass() {
    
        // Set an element as an unordered list.
    
        ContentTools.ToolShelf.stow(this, 'unordered-list');
    
        this.label = 'Bullet list';
        this.icon = 'unordered-list';
        this.listTag = 'ul';
    }

    static canApply(element, selection?) {

        let needle;
        if (element.isFixed()) {
            return false;
        }

        // Return true if the tool can be applied to the current
        // element/selection.
        return (element.content !== undefined) &&
                (needle = element.parent().type(), ['Region', 'ListItem'].includes(needle));
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        let list;
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        if (element.parent().type() === 'ListItem') {

            // Find the parent list and change it to an unordered list
            element.storeState();
            list = element.closest(node => node.type() === 'List');
            list.tagName(this.listTag);
            element.restoreState();

        } else {
            // Convert the element to a list

            // Create a new list using the current elements content
            const listItemText = new ContentEdit.ListItemText(element.content.copy());
            const listItem = new ContentEdit.ListItem();
            listItem.attach(listItemText);
            list = new ContentEdit.List(this.listTag, {});
            list.attach(listItem);

            // Remove the current element from the region
            const parent = element.parent();
            const insertAt = parent.children.indexOf(element);
            parent.detach(element);
            parent.attach(list, insertAt);

            // Restore selection
            listItemText.focus();
            listItemText.selection(selection);
        }

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
