import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.AlignRight = class AlignRight extends ContentTools.Tools.AlignLeft {
    static declare className: any;
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Apply a class to right align the contents of the current text block.
    
        ContentTools.ToolShelf.stow(this, 'align-right');
    
        this.label = 'Align right';
        this.icon = 'align-right';
        this.className = 'text-right';
    }
});
Cls$tools.initClass();
