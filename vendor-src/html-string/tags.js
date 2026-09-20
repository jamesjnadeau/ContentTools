import HTMLString from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const Cls$tags = (HTMLString.Tag = class Tag {
    static initClass() {
    
        // Constants
    
        // A list of tags that must self close
        this.SELF_CLOSING = {
            'area': true,
            'base': true,
            'br': true,
            'hr': true,
            'img': true,
            'input': true,
            'link meta': true,
            'wbr': true
            };
    }

    // A HTML tag

    constructor(name, attributes) {
        this._name = name.toLowerCase();
        this._selfClosing = HTMLString.Tag.SELF_CLOSING[this._name] === true;
        this._head = null;

        // Copy the attributes
        this._attributes = {};
        for (var k in attributes) {
            var v = attributes[k];
            this._attributes[k] = v;
        }
    }

    // Read only properties

    head() {
        // Return the head <tag> of the tag

        // For performance we cache the head part of the tag
        if (!this._head) {
            const components = [];

            for (var k in this._attributes) {
                var v = this._attributes[k];
                if (v) {
                    components.push(`${ k }=\"${ v }\"`);
                } else {
                    components.push(`${ k }`);
                }
            }
            components.sort();

            components.unshift(this._name);

            this._head = `<${ components.join(' ') }>`;
        }

        return this._head;
    }

    name() {
        // Return the tag's name
        return this._name;
    }

    selfClosing() {
        // Return true if the tag is self closing
        return this._selfClosing;
    }

    tail() {
        // Return the tail </tag> of the tag
        if (this._selfClosing) {
            return '';
        }
        return `</${ this._name }>`;
    }

    // Methods

    attr(name, value) {
        // Get/Set the value of an attribute

        if (value === undefined) {
            return this._attributes[name];
        }

        // Set the attribute
        this._attributes[name] = value;

        // Clear the head cache
        return this._head = null;
    }

    removeAttr(name) {
        // Remove an attribute from the tag

        if (this._attributes[name] === undefined) {
            return;
        }

        // Remove the attribute
        delete this._attributes[name];

        // Clear the head cache
        return this._head = null;
    }

    copy() {
        // Return a copy of the tag
        return new HTMLString.Tag(this._name, this._attributes);
    }
});
Cls$tags.initClass();
