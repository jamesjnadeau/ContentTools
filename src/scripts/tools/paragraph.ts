import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Paragraph = class Paragraph extends ContentTools.Tools.Heading {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Convert the current text block to a paragraph (e.g <p>foo</p>)
    
        ContentTools.ToolShelf.stow(this, 'paragraph');
    
        this.label = 'Paragraph';
        this.icon = 'paragraph';
        this.tagName = 'p';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        if (element.isFixed()) {
            return false;
        }

        return element !== undefined;
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element
        const forceAdd = this.editor().ctrlDown();

        if (ContentTools.Tools.Heading.canApply(element) && !forceAdd) {
            // If the element is a top level text element and the user hasn't
            // indicated they want to force add a new paragraph convert it to a
            // paragraph in-place.
            return super.apply(element, selection, callback);
        } else {
            // Dispatch `apply` event
            const toolDetail = {
                'tool': this,
                'element': element,
                'selection': selection
                };
            if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
                return;
            }

            // If the element isn't a text element find the nearest top level
            // node and insert a new paragraph element after it.
            if (element.parent().type() !== 'Region') {
                element = element.closest(node => node.parent().type() === 'Region');
            }

            const region = element.parent();
            const paragraph = new ContentEdit.Text('p');
            region.attach(paragraph, region.children.indexOf(element) + 1);

            // Give the newely inserted paragraph focus
            paragraph.focus();

            callback(true);

            // Dispatch `applied` event
            return this.dispatchEditorEvent('tool-applied', toolDetail);
        }
    }
});
Cls$tools.initClass();
