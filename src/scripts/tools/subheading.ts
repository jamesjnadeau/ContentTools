import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Subheading = class Subheading extends ContentTools.Tools.Heading {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Convert the current text block to a subheading (e.g <h2>foo</h2>)
    
        ContentTools.ToolShelf.stow(this, 'subheading');
    
        this.label = 'Subheading';
        this.icon = 'subheading';
        this.tagName = 'h2';
    }
});
Cls$tools.initClass();
