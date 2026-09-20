import ContentTools from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const Cls$styles = (ContentTools.StylePalette = class StylePalette {
    static initClass() {
    
        // The `StylesPalette` class stores a list of styles available to the content
        // editor application. A list of styles is usually defined and added to the
        // palette as part of initializing the application.
    
        this._styles = [];
    }

    // Class methods

    static add(styles) {
        // Add a list of styles to the palette
        return this._styles = this._styles.concat(styles);
    }

    static styles(element) {
        // If no element is specified return a copy of the stlyes list
        if (element === undefined) {
            return this._styles.slice();
        }

        // Return the styles (optional only those applicable for the specified
        // tag name).
        const tagName = element.tagName();

        // Filter the styles
        return this._styles.filter(function(style) {
            if (!style._applicableTo) {
                return true;
            }

            return style._applicableTo.indexOf(tagName) !== -1;
        });
    }
});
Cls$styles.initClass();


ContentTools.Style = class Style {

    // The `Style` class is used to define styles (CSS classes) for use in the
    // editor.

    constructor(name, cssClass, applicableTo) {

        // A user friendly name
        this._name = name;

        // The CSS class name
        this._cssClass = cssClass;

        // The `applicableTo` value by default will contain a list of class names
        // the style can be applied to however if the `StylePalette.styles`
        // method is overridden then the value of applicable to maybe any
        // construct required to support the overridden styles method.
        if (applicableTo) {
            this._applicableTo = applicableTo;
        } else {
            this._applicableTo = null;
        }
    }

    // Read-only properties

    applicableTo() {
        // Return the tag names this style is applicable to, no value means the
        // style is applicable to any tag.
        return this._applicableTo;
    }

    cssClass() {
        // Return the CSS class name for the style
        return this._cssClass;
    }

    name() {
        // Return the name of the style
        return this._name;
    }
};
