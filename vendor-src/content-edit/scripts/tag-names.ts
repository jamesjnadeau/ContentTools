import ContentEdit from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class _TagNames {
    declare _tagNames: any;


    // The `_TagNames` class allows DOM element tag names to be associated with
    // `ContentEdit.Element` classes. When a region is initialized it uses this
    // association to determine how best to handle each DOM element child.
    //
    // DOM element tag names are associated with element classes through the
    // `register()` method. To handle cases where the same tag name is used for
    // more than one element class the `data-ce-tag` attribute can be used to
    // specify a tag name. This is also useful when you want to specify a tag
    // name that isn't valid in HTML (e.g <foo>...</foo> could be specified as
    // <p data-ce-tag="foo">...</p>).

    constructor() {
        // Map of tag names and their associated element classes
        this._tagNames = {};
    }

    register(cls, ...tagNames) {
        // Register an element class with one or more tag names
        return Array.from<any>(tagNames).map((tagName) =>
            (this._tagNames[tagName.toLowerCase()] = cls));
    }

    match(tagName) {
        // Return an element class for the specified tag name (case insensitive),
        // if we can't find an associated class return `ContentEdit.Static`.
        tagName = tagName.toLowerCase();
        if (this._tagNames[tagName]) {
            return this._tagNames[tagName];
        }

        return ContentEdit.Static;
    }
}


(function() {
    let instance = undefined;
    const Cls$tag_names = (ContentEdit.TagNames = class TagNames {


        static initClass() {
    
            // The `ContentEdit.TagNames` class is a singleton, this code provides access
            // to the singleton instance of the protected `_TagNames` class which is
            // initialized the first time the class method `get` is called.
    
            instance = null;
        }

        static get() {
            return instance != null ? instance : (instance = new _TagNames());
        }
    });
    Cls$tag_names.initClass();
    return Cls$tag_names;
})();
