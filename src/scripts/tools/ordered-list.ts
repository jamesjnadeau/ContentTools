import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.OrderedList = class OrderedList extends ContentTools.Tools.UnorderedList {
    static declare icon: any;
    static declare label: any;
    static declare listTag: any;

    static initClass() {
    
        // Set an element as an ordered list.
    
        ContentTools.ToolShelf.stow(this, 'ordered-list');
    
        this.label = 'Numbers list';
        this.icon = 'ordered-list';
        this.listTag = 'ol';
    }
});
Cls$tools.initClass();
