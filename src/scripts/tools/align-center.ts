import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.AlignCenter = class AlignCenter extends ContentTools.Tools.AlignLeft {
    static declare className: any;
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Apply a class to center align the contents of the current text block.
    
        ContentTools.ToolShelf.stow(this, 'align-center');
    
        this.label = 'Align center';
        this.icon = 'align-center';
        this.className = 'text-center';
    }
});
Cls$tools.initClass();
