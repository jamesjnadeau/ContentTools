import HTMLString from '../../../vendor-src/html-string/namespace.js';
import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Preformatted = class Preformatted extends ContentTools.Tools.Heading {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Convert the current text block to a preformatted block (e.g <pre>foo</pre)
    
        ContentTools.ToolShelf.stow(this, 'preformatted');
    
        this.label = 'Preformatted';
        this.icon = 'preformatted';
        this.tagName = 'pre';
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

        // If the element is already a PreText element then convert it to a
        // paragraph instead.
        if (element.type() === 'PreText') {
            ContentTools.Tools.Paragraph.apply(element, selection, callback);
            return;
        }

        // Escape the contents of the existing element
        const text = element.content.text();

        // Create a new pre-text element using the current elements content
        const preText = new ContentEdit.PreText(
            'pre', {},
            HTMLString.String.encode(text)
            );

        // Remove the current element from the region
        const parent = element.parent();
        const insertAt = parent.children.indexOf(element);
        parent.detach(element);
        parent.attach(preText, insertAt);

        // Restore selection
        element.blur();
        preText.focus();
        preText.selection(selection);

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
