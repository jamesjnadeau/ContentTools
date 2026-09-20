import HTMLString from '../../html-string/namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
var ContentEdit = {

    // Global settings

    // The CSS class names used when an element is drag aligned to the left or
    // right of another element.
    ALIGNMENT_CLASS_NAMES: {
        'left': 'align-left',
        'right': 'align-right'
    },

    // The default min/max constraints (in pixels) for element that can be
    // resized (`ContentEdit.ResizableElement`). The default values are used when
    // a min/max width has not been set using the custom attributes
    // `data-ce-max-width` and `data-ce-min-width`.
    DEFAULT_MAX_ELEMENT_WIDTH: 800,
    DEFAULT_MIN_ELEMENT_WIDTH: 80,

    // Some elements such as images are dragged simply by clicking on them and
    // moving the mouse. Others like text handle click events differently (for
    // example focusing the element so text can be edited), these element support
    // dragging behaviour when a user clicks and holds (without moving the
    // mouse). The duration of the hold is determined in milliseconds.
    DRAG_HOLD_DURATION: 500,

    // The size (in pixels) of the edges used to switch horizontal placement
    // (e.g drop left/right) when dragging an element over another (for
    // example an image being dragged to the right edge of a text element).
    DROP_EDGE_SIZE: 50,

    // Set this to true to allow elements to be cloned when dragged them with
    // the alt key depressed.
    ENABLE_DRAG_CLONING: false,

    // The maximum number of characters to insert into a helper (for example the
    // helper tool that appears when dragging elements).
    HELPER_CHAR_LIMIT: 250,

    // String to use for a single indent. For example if you wanted html to
    // return HTML indented using tabs instead of spaces you could set this to
    // `\t`.
    INDENT: '    ',

    // The current language. Must be a a 2 digit ISO_639-1 code.
    LANGUAGE: 'en',

    // String used for  line endings when formatting the HTML output of editable
    // elements.
    LINE_ENDINGS: '\n',

    // By default a new paragraph `<p>` is created when the enter/return key is
    // pressed, to insert a line-break `<br>` the shift key can be held down when
    // pressing enter. This behaviour can be reversed by setting the preference
    // to be for line-breaks.
    PREFER_LINE_BREAKS: false,

    // The size (in pixels) of the corner region used to detect a resize event
    // against an element. To resize an element (for example an image or video)
    // the user must click in a corner region of an element. The size is
    // automatically reduced for small elements where the corner size represents
    // more than a 1/4 of the total size.
    RESIZE_CORNER_SIZE: 15,

    // If true then whitespace will be stripped from the start and end of
    // editable elements with text content, if false then &nbsp; and <br> tags
    // will be preserved.
    TRIM_WHITESPACE: true,

    // Translation - the ContentEdit library provides basic translation support
    // which is used both by the library itself and the associated ContentTools
    // library.
    _translations: {},

    _(s) {
        // Look for a translation of the given string and return it, or if no
        // translation is found return the string unchanged.
        const lang = ContentEdit.LANGUAGE;
        if (ContentEdit._translations[lang] &&
                ContentEdit._translations[lang][s]) {

            return ContentEdit._translations[lang][s];
        }
        return s;
    },

    addTranslations(language, translations) {
        // Add translations where `language` is a 2 digit ISO_639-1 code and
        // `translations` is an object containing a map of English strings and
        // their translated counterparts e.g {'Hello': 'Bonjour'}.
        return ContentEdit._translations[language] = translations;
    },

    // Utility functions

    addCSSClass(domElement, className) {
        // Add a CSS class to a DOM element

        // Add the class using classList if possible
        if (domElement.classList) {
            domElement.classList.add(className);
            return;
        }

        // As there isn't universal support for the classList attribute, fallback
        // to a more manual process if necessary.
        const classAttr = domElement.getAttribute('class');
        if (classAttr) {
            // Convert class attribute to a list of class names
            const classNames = (Array.from(classAttr.split(' ')));

            // If the class name isn't in the list add it
            if (classNames.indexOf(className) === -1) {
                return domElement.setAttribute(
                    'class',
                    `${ classAttr } ${ className }`
                    );
            }

        } else {
            return domElement.setAttribute('class', className);
        }
    },

    attributesToString(attributes) {
        // Convert a dictionary of attributes into a string (e.g key="value")
        let name;
        if (!attributes) {
            return '';
        }

        // Sort the attributes alphabetically
        const names = ((() => {
            const result = [];
            for (name in attributes) {
                result.push(name);
            }
            return result;
        })());
        names.sort();

        // Convert each key, value into an attribute string
        const attributeStrings = [];
        for (name of Array.from(names)) {
            var value = attributes[name];
            if (value === '') {
                attributeStrings.push(name);
            } else {
                // Escape the contents of the attribute
                value = HTMLString.String.encode(value);

                // We also need to escape quotes (") as the value will
                // sit within quotes.
                value = value.replace(/"/g, '&quot;');

                attributeStrings.push(`${ name }=\"${ value }\"`);
            }
        }

        return attributeStrings.join(' ');
    },

    removeCSSClass(domElement, className) {
        // Remove a CSS class from a DOM element

        // Remove the class using classList if possible
        if (domElement.classList) {
            domElement.classList.remove(className);

            if (domElement.classList.length === 0) {
                domElement.removeAttribute('class');
            }

            return;
        }

        // As there isn't universal support for the classList attribute, fallback
        // to a more manual process if necessary.
        const classAttr = domElement.getAttribute('class');

        if (classAttr) {
            // Convert class attribute to a list of class names
            const classNames = (Array.from(classAttr.split(' ')));

            // If the class name is in the list remove it
            const classNameIndex = classNames.indexOf(className);
            if (classNameIndex > -1) {
                classNames.splice(classNameIndex, 1);

                if (classNames.length) {
                    return domElement.setAttribute(
                        'class',
                        classNames.join(' ')
                        );
                } else {
                    return domElement.removeAttribute('class');
                }
            }
        }
    }
};

export default ContentEdit;
