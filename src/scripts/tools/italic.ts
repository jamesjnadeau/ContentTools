import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Italic = class Italic extends ContentTools.Tools.Bold {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Make the current selection of text (non)italic (e.g <i>foo</i>).
    
        ContentTools.ToolShelf.stow(this, 'italic');
    
        this.label = 'Italic';
        this.icon = 'italic';
        this.tagName = 'i';
    }
});
Cls$tools.initClass();
