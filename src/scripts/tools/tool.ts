import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tool = class Tool {
    static declare icon: any;
    static declare label: any;
    static declare requiresElement: any;

    static initClass() {
    
        // The `Tool` class defines a common API for editor tools. All tools should
        // inherit from the `Tool` class.
        //
        // Tools classes are designed to be used direct not as instances of the
        // class, every property and method for a tool is held against the class.
        //
        // A tool is effectively a collection of functions (class methods) with a set
        // of configuration settings (class properties). For this reason they are
        // defined using static classes.
    
        this.label = 'Tool';
        this.icon = 'tool';
    
        // Most tools require an element that they can be applied to, but there are
        // exceptions (such as undo/redo). In these cases you can set the
        // `requiresElement` flag to false so that the toolbox will not automatically
        // disable the tool because there is not element focused.
        this.requiresElement = true;
    }

    // Class methods

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the specified
        // element and selection.
        return false;
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the specified
        // element and selection.
        return false;
    }

    static apply(element, selection, callback) {
        // Apply the tool to the specified element and selection
        throw new Error('Not implemented');
    }

    static editor() {
        // Return an instance of the ContentTools.EditorApp
        return ContentTools.EditorApp.get();
    }

    static dispatchEditorEvent(name, detail) {
        // Dispatch an event against the editor
        return this.editor().dispatchEvent(this.editor().createEvent(name, detail));
    }

    // Private class methods

    static _insertAt(element) {
        // Find insert node and index for inserting an element after the
        // specified element.

        let insertNode = element;
        if (insertNode.parent().type() !== 'Region') {
            insertNode = element.closest(node => node.parent().type() === 'Region');
        }

        const insertIndex = insertNode.parent().children.indexOf(insertNode) + 1;

        return [insertNode, insertIndex];
    }
});
Cls$tools.initClass();


// Common tools
