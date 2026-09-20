import ContentTools from '../namespace.js';

let Cls$tools: any = (ContentTools.ToolShelf = class ToolShelf {
    static declare _tools: any;

    static initClass() {
    
        // The `ToolShelf` class allows tools to be stored using a name (string) as a
        // reference. Using a tools name makes is cleaner when defining a set of
        // tools to populate the `ToolboxUI` widget.
    
        this._tools = {};
    }

    static stow(cls, name) {
        // Stow a tool on the shelf

        return this._tools[name] = cls;
    }

    static fetch(name) {
        // Fetch a tool from the shelf by it's name
        if (!this._tools[name]) {
            throw new Error(`\`${name}\` has not been stowed on the tool shelf`);
        }

        return this._tools[name];
    }
});
Cls$tools.initClass();
