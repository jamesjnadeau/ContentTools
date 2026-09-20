import HTMLString from '../../../../vendor-src/html-string/namespace.js';
import ContentEdit from '../../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../../namespace.js';

/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.PropertiesDialog = class PropertiesDialog extends ContentTools.DialogUI {

    // A dialog to support editing an elements properties

    constructor(element){
        super('Properties');

        let needle;
        this.element = element;

        // A list of AttributeUI instances representing the element's attributes
        this._attributeUIs = [];

        // The currently focused attribute
        this._focusedAttributeUI = null;

        // A list of StyleUI instances representing the element's styles
        this._styleUIs = [];

        // Check the element to determine if the dialog should provide a code
        // editor.
        this._supportsCoding = this.element.content;
        if ((needle = this.element.type(), ['ListItem', 'TableCell'].includes(needle))) {
            this._supportsCoding = true;
        }
    }

    // Methods

    caption(caption) {
        // Get/Set the caption for the dialog
        if (caption === undefined) {
            return this._caption;
        }

        // Replace any existing caption
        this._caption = caption;
        return this._domCaption.textContent = ContentEdit._(caption) +
            `: ${ this.element.tagName() }`;
    }

    changedAttributes() {
        // Return a map of attributes set in the dialog (only attributes that
        // have changed - e.g been added, modified or removed). Attributes that
        // have been removed are assigned null value.

        let name, value;
        const attributes = {};
        const changedAttributes = {};

        // Find new or modified attributes
        for (var attributeUI of Array.from(this._attributeUIs)) {
            name = attributeUI.name();
            value = attributeUI.value();

            // Ignore fields without a name (typically the last attribute)
            if (name === '') {
                continue;
            }

            attributes[name.toLowerCase()] = true;
            if (this.element.attr(name) !== value) {
                changedAttributes[name] = value;
            }
        }

        // Find removed attributes
        const restricted = ContentTools.getRestrictedAtributes(this.element.tagName());
        const object = this.element.attributes();
        for (name in object) {
            value = object[name];
            if (restricted && (restricted.indexOf(name.toLowerCase()) !== -1)) {
                continue;
            }

            if (attributes[name] === undefined) {
                changedAttributes[name] = null;
            }
        }

        return changedAttributes;
    }

    changedStyles() {
        // Return a map of styles where the value flags if the style has been set
        // to applied or not (only styles that have changed - e.g been added or
        // removed - are included).

        const styles = {};
        for (var styleUI of Array.from(this._styleUIs)) {

            // Only add the include styles that have changed
            var cssClass = styleUI.style.cssClass();
            if (this.element.hasCSSClass(cssClass) !== styleUI.applied()) {
                styles[cssClass] = styleUI.applied();
            }
        }

        return styles;
    }

    getElementInnerHTML() {
        // Return the inner HTML for the element
        if (!this._supportsCoding) {
            return null;
        }

        // Cater for the content being stored in a top-level text element or a
        // wrapper class for a list item or table cell.
        if (this.element.content) {
            return this.element.content.html();
        }
        return this.element.children[0].content.html();
    }

    mount() {
        // Mount the widget
        let name, value;
        super.mount();

        // Update dialog class
        ContentEdit.addCSSClass(this._domElement, 'ct-properties-dialog');

        // Update view class
        ContentEdit.addCSSClass(this._domView, 'ct-properties-dialog__view');

        // The properties dialog supports a tab between styles and attributes, by
        // default it is opened with styles tab showing.

        // Styles
        this._domStyles = this.constructor.createDiv(['ct-properties-dialog__styles']);
        this._domStyles.setAttribute(
            'data-ct-empty',
            ContentEdit._('No styles available for this tag')
            );
        this._domView.appendChild(this._domStyles);

        // Add the styles in the style palette for this element
        for (var style of Array.from(ContentTools.StylePalette.styles(this.element))) {
            var styleUI = new StyleUI(
                style,
                this.element.hasCSSClass(style.cssClass())
                );
            this._styleUIs.push(styleUI);
            styleUI.mount(this._domStyles);
        }

        // Attributes
        this._domAttributes = this.constructor.createDiv(
            ['ct-properties-dialog__attributes']);
        this._domView.appendChild(this._domAttributes);

        // Add the elements attributes
        const restricted = ContentTools.getRestrictedAtributes(this.element.tagName());
        const attributes = this.element.attributes();

        // Build a list of attribute names that we can sort alphabetically. We
        // sort the attributes on mounting the dialog but not when new attributes
        // are added (these are simply appended to the end of the list which is
        // less jarring for the user).
        const attributeNames = [];
        for (name in attributes) {
            // Check that attribute isn't restricted
            value = attributes[name];
            if (restricted && (restricted.indexOf(name.toLowerCase()) !== -1)) {
                continue;
            }

            attributeNames.push(name);
        }

        attributeNames.sort();

        // Create an assciated `attributeUI` instance for each attribute
        for (name of Array.from(attributeNames)) {
            value = attributes[name];

            this._addAttributeUI(name, value);
        }

        // Add an empty attribute to allow new attributes to be created
        this._addAttributeUI('', '');

        // Code
        this._domCode = this.constructor.createDiv(['ct-properties-dialog__code']);
        this._domView.appendChild(this._domCode);

        // Add a textarea in which the inner HTML can be edited
        this._domInnerHTML = document.createElement('textarea');
        this._domInnerHTML.setAttribute('class', 'ct-properties-dialog__inner-html');
        this._domInnerHTML.setAttribute('name', 'code');
        this._domInnerHTML.value = this.getElementInnerHTML();
        this._domCode.appendChild(this._domInnerHTML);

        // Controls

        // Tabs
        const domTabs = this.constructor.createDiv(
            ['ct-control-group', 'ct-control-group--left']);
        this._domControls.appendChild(domTabs);

        // Styles
        this._domStylesTab = this.constructor.createDiv([
            'ct-control',
            'ct-control--icon',
            'ct-control--styles'
            ]);
        this._domStylesTab.setAttribute('data-ct-tooltip', ContentEdit._('Styles'));
        domTabs.appendChild(this._domStylesTab);

        // Attributes
        this._domAttributesTab = this.constructor.createDiv([
            'ct-control',
            'ct-control--icon',
            'ct-control--attributes'
            ]);
        this._domAttributesTab.setAttribute(
            'data-ct-tooltip',
            ContentEdit._('Attributes')
            );
        domTabs.appendChild(this._domAttributesTab);

        // Code
        this._domCodeTab = this.constructor.createDiv([
            'ct-control',
            'ct-control--icon',
            'ct-control--code'
            ]);
        this._domCodeTab.setAttribute('data-ct-tooltip', ContentEdit._('Code'));
        domTabs.appendChild(this._domCodeTab);

        if (!this._supportsCoding) {
            ContentEdit.addCSSClass(this._domCodeTab, 'ct-control--muted');
        }

        // Remove attribute control
        this._domRemoveAttribute = this.constructor.createDiv([
            'ct-control',
            'ct-control--icon',
            'ct-control--remove',
            'ct-control--muted'
            ]);
        this._domRemoveAttribute.setAttribute(
            'data-ct-tooltip',
            ContentEdit._('Remove')
            );
        domTabs.appendChild(this._domRemoveAttribute);

        // Actions
        const domActions = this.constructor.createDiv(
            ['ct-control-group', 'ct-control-group--right']);
        this._domControls.appendChild(domActions);

        this._domApply = this.constructor.createDiv([
            'ct-control',
            'ct-control--text',
            'ct-control--apply'
            ]);
        this._domApply.textContent = ContentEdit._('Apply');
        domActions.appendChild(this._domApply);

        // Check to see which tab was last active and restore it (defaults to the
        // styles tab).
        const lastTab = window.localStorage.getItem('ct-properties-dialog-tab');
        if (lastTab === 'attributes') {
            ContentEdit.addCSSClass(this._domElement,
                'ct-properties-dialog--attributes');
            ContentEdit.addCSSClass(this._domAttributesTab, 'ct-control--active');
        } else if ((lastTab === 'code') && this._supportsCoding) {
            ContentEdit.addCSSClass(this._domElement,
                'ct-properties-dialog--code');
            ContentEdit.addCSSClass(this._domCodeTab, 'ct-control--active');
        } else {
            // Default to styles
            ContentEdit.addCSSClass(this._domElement,
                'ct-properties-dialog--styles');
            ContentEdit.addCSSClass(this._domStylesTab, 'ct-control--active');
        }

        // Add interaction handlers
        return this._addDOMEventListeners();
    }

    save() {
        // Save the properties. The event trigged by saving the properties
        // receives 3 values:
        //
        // - attributes (map of attributes and their values, attributes with null
        //   values have been removed).
        // - styles (map of styles that have changed and whether they are applied
        //   or not).
        // - innerHTML (the inner HTML for the element).

        let innerHTML = null;
        if (this._supportsCoding) {
            innerHTML = this._domInnerHTML.value;
        }

        const detail = {
            changedAttributes: this.changedAttributes(),
            changedStyles: this.changedStyles(),
            innerHTML
            };
        return this.dispatchEvent(this.createEvent('save', detail));
    }

    // Private methods

    _addAttributeUI(name, value) {
        // Add an AttributeUI widget to the attributes tab, this method also
        // binds the required events to each attribute.
        const dialog = this;

        // Create the attribute widget
        const attributeUI = new AttributeUI(name, value);
        this._attributeUIs.push(attributeUI);

        // Handle blur events
        attributeUI.addEventListener('blur', function(ev) {

            // Mark that no attribute currently has focus
            dialog._focusedAttributeUI = null;

            // Disable the remove attribute control
            ContentEdit.addCSSClass(
                dialog._domRemoveAttribute,
                'ct-control--muted'
                );

            // If the attribute has no name and isn't the last attribute remove
            // it.
            const index = dialog._attributeUIs.indexOf(this);
            const {
                length
            } = dialog._attributeUIs;
            if ((this.name() === '') && (index < (length - 1))) {
                this.unmount();
                dialog._attributeUIs.splice(index, 1);
            }

            // Check that the last attribute has no name or value, else we need
            // to create a new empty attribute.
            const lastAttributeUI = dialog._attributeUIs[length - 1];
            if (lastAttributeUI) {
                if (lastAttributeUI.name() && lastAttributeUI.value()) {
                    return dialog._addAttributeUI('', '');
                }
            }
        });

        // Handle focus events
        attributeUI.addEventListener('focus', function(ev) {
            // Mark that this is the attribute that currently has focus
            dialog._focusedAttributeUI = this;

            // Enable the remove attribute control
            return ContentEdit.removeCSSClass(
                dialog._domRemoveAttribute,
                'ct-control--muted'
                );
        });

        // Handle input events
        attributeUI.addEventListener('namechange', function(ev) {
            const {
                element
            } = dialog;
            name = this.name().toLowerCase();
            const restricted = ContentTools.getRestrictedAtributes(element.tagName());

            // Validate the name
            let valid = true;

            // Validate the name isn't restricted
            if (restricted && (restricted.indexOf(name) !== -1)) {
                valid = false;
            }

            // Validate the name isn't duplicated
            for (var otherAttributeUI of Array.from(dialog._attributeUIs)) {

                // Empty names don't count as duplicates
                if (name === '') {
                    continue;
                }

                if (otherAttributeUI === this) {
                    continue;
                }

                if (otherAttributeUI.name().toLowerCase() !== name) {
                    continue;
                }

                valid = false;
            }

            // Set the AttributeUI's valid status
            this.valid(valid);

            // Set the state of the apply control based on whether the attribute
            // is valid.
            if (valid) {
                return ContentEdit.removeCSSClass(
                    dialog._domApply,
                    'ct-control--muted'
                    );
            } else {
                return ContentEdit.addCSSClass(dialog._domApply, 'ct-control--muted');
            }
        });

        // Mount the attribute widget
        attributeUI.mount(this._domAttributes);

        return attributeUI;
    }

    _addDOMEventListeners() {
        // Add DOM event listeners for the widget
        super._addDOMEventListeners();

        // Add support for tabbing between styles and attributes

        const selectTab = selected => {
            // Select a tab from the interface
            const tabs = ['attributes', 'code', 'styles'];

            // Unselect existing tab
            for (var tab of Array.from(tabs)) {
                if (tab === selected) {
                    continue;
                }
                var tabCap = tab.charAt(0).toUpperCase() + tab.slice(1);
                ContentEdit.removeCSSClass(this._domElement,
                    `ct-properties-dialog--${ tab }`);
                ContentEdit.removeCSSClass(
                    this[`_dom${ tabCap }Tab`],
                    'ct-control--active'
                    );
            }

            // Select the tab
            const selectedCap = selected.charAt(0).toUpperCase() + selected.slice(1);
            ContentEdit.addCSSClass(this._domElement,
                `ct-properties-dialog--${ selected }`);
            ContentEdit.addCSSClass(
                this[`_dom${ selectedCap }Tab`],
                'ct-control--active'
                );

            // Remember this tab was last open
            return window.localStorage.setItem('ct-properties-dialog-tab', selected);
        };

        // Styles
        this._domStylesTab.addEventListener('mousedown', () => {
            return selectTab('styles');
        });

        // Attributes
        this._domAttributesTab.addEventListener('mousedown', () => {
            return selectTab('attributes');
        });

        // Code
        if (this._supportsCoding) {
            this._domCodeTab.addEventListener('mousedown', () => {
                return selectTab('code');
            });
        }

        // Remove attribute
        this._domRemoveAttribute.addEventListener('mousedown', ev => {
            ev.preventDefault();

            if (this._focusedAttributeUI) {

                // Determine if this is the last attribute in the list
                const index = this._attributeUIs.indexOf(this._focusedAttributeUI);
                const last = index === (this._attributeUIs.length - 1);

                // Remove the AttributeUI widget
                this._focusedAttributeUI.unmount();
                this._attributeUIs.splice(index, 1);

                // If this was the last item make sure we add a new empty one
                if (last) {
                    return this._addAttributeUI('', '');
                }
            }
        });

        // Real-time validate any inline code changes
        const validateCode = ev => {
            // Validate the content
            try {
                const content = new HTMLString.String(this._domInnerHTML.value);
                ContentEdit.removeCSSClass(
                    this._domInnerHTML,
                    'ct-properties-dialog__inner-html--invalid'
                    );
                return ContentEdit.removeCSSClass(this._domApply, 'ct-control--muted');
            } catch (error) {
                // If the content is invalid we change the style of the textarea
                // to reflect this state and disable the apply button.
                ContentEdit.addCSSClass(
                    this._domInnerHTML,
                    'ct-properties-dialog__inner-html--invalid'
                    );
                return ContentEdit.addCSSClass(this._domApply, 'ct-control--muted');
            }
        };

        this._domInnerHTML.addEventListener('input', validateCode);
        this._domInnerHTML.addEventListener('propertychange', validateCode);

        // Apply
        return this._domApply.addEventListener('click', ev => {
            ev.preventDefault();

            // Check the control isn't muted, if it is then one or more
            // attributes aren't valid.
            const cssClass = this._domApply.getAttribute('class');
            if (cssClass.indexOf('ct-control--muted') === -1) {
                return this.save();
            }
        });
    }
};


class StyleUI extends ContentTools.AnchoredComponentUI {

    // A switch representing a predefined style that can be applied to an
    // element with this tag name.

    constructor(style, applied) {
        super();

        this.style = style;

        this._applied = applied;
    }

    // Methods

    applied(applied) {
        // Get/Set the applied flag for the style
        if (applied === undefined) {
            return this._applied;
        }

        // If the value is the same there's nothing to do
        if (this._applied === applied) {
            return;
        }

        this._applied = applied;

        // Update the section class to reflect the applied value
        if (this._applied) {
            return ContentEdit.addCSSClass(this._domElement, 'ct-section--applied');
        } else {
            return ContentEdit.removeCSSClass(this._domElement, 'ct-section--applied');
        }
    }

    mount(domParent, before=null) {
        // Mount the component to the DOM

        // Section
        this._domElement = this.constructor.createDiv(['ct-section']);
        if (this._applied) {
            ContentEdit.addCSSClass(this._domElement, 'ct-section--applied');
        }

        // Label
        const label = this.constructor.createDiv(['ct-section__label']);
        label.textContent = this.style.name();
        this._domElement.appendChild(label);

        // Switch
        this._domElement.appendChild(this.constructor.createDiv(['ct-section__switch']));

        return super.mount(domParent, before);
    }

    _addDOMEventListeners() {
        // Add DOM event listeners for the widget

        const toggleSection = ev => {
            ev.preventDefault();
            if (this.applied()) {
                return this.applied(false);
            } else {
                return this.applied(true);
            }
        };

        return this._domElement.addEventListener('click', toggleSection);
    }
}


class AttributeUI extends ContentTools.AnchoredComponentUI {

    // An component that allows an attribute to be named and given a value given
    // or to be removed.

    constructor(name, value) {
        super();

        this._initialName = name;
        this._initialValue = value;
    }

    // Read-only properties

    name() {
        // Return the name value of the attribute
        return this._domName.value.trim();
    }

    value() {
        // Return the value of the attribute
        return this._domValue.value.trim();
    }

    // Methods

    mount(domParent, before=null) {
        // Mount the component to the DOM

        // Attribute
        this._domElement = this.constructor.createDiv(['ct-attribute']);

        // Name
        this._domName = document.createElement('input');
        this._domName.setAttribute('class', 'ct-attribute__name');
        this._domName.setAttribute('name', 'name');
        this._domName.setAttribute('placeholder', ContentEdit._('Name'));
        this._domName.setAttribute('type', 'text');
        this._domName.setAttribute('value', this._initialName);
        this._domElement.appendChild(this._domName);

        // Value
        this._domValue = document.createElement('input');
        this._domValue.setAttribute('class', 'ct-attribute__value');
        this._domValue.setAttribute('name', 'value');
        this._domValue.setAttribute('placeholder', ContentEdit._('Value'));
        this._domValue.setAttribute('type', 'text');
        this._domValue.setAttribute('value', this._initialValue);
        this._domElement.appendChild(this._domValue);

        return super.mount(domParent, before);
    }

    valid(valid) {
        // Set the state of the attributes name input to valid or invalid
        if (valid) {
            return ContentEdit.removeCSSClass(
                this._domName,
                'ct-attribute__name--invalid'
                );
        } else {
            return ContentEdit.addCSSClass(this._domName, 'ct-attribute__name--invalid');
        }
    }

    // Private methods

    _addDOMEventListeners() {
        // Add DOM event listeners for the widget

        // Name
        this._domName.addEventListener('blur', () => {
            // Find the next attribute so we can move the focus if the attribute
            // is removed when blurred.
            const name = this.name();
            const nextDomAttribute = this._domElement.nextSibling;

            this.dispatchEvent(this.createEvent('blur'));

            // Determine if the next DOM element is an attribute
            if ((name === '') && nextDomAttribute) {
                // Move focus to next attribute
                const nextNameDom = nextDomAttribute.querySelector(
                    '.ct-attribute__name');
                return nextNameDom.focus();
            }
        });

        this._domName.addEventListener('focus', () => {
            return this.dispatchEvent(this.createEvent('focus'));
        });

        this._domName.addEventListener('input', () => {
            return this.dispatchEvent(this.createEvent('namechange'));
        });

        this._domName.addEventListener('keydown', ev => {
            if (ev.keyCode === 13) {
                return this._domValue.focus();
            }
        });

        // Value
        this._domValue.addEventListener('blur', () => {
            return this.dispatchEvent(this.createEvent('blur'));
        });

        this._domValue.addEventListener('focus', () => {
            return this.dispatchEvent(this.createEvent('focus'));
        });

        return this._domValue.addEventListener('keydown', ev => {
            if ((ev.keyCode !== 13) && ((ev.keyCode !== 9) || ev.shiftKey)) {
                return;
            }

            // Prevent the default shift of focus on the tab key
            ev.preventDefault();

            // Determine if the next DOM element is an attribute
            let nextDomAttribute = this._domElement.nextSibling;
            if (!nextDomAttribute) {
                // No more attributes, just blur the value field
                this._domValue.blur();

                // If blurring the field created a new attribute then move the
                // focus to that element.
                nextDomAttribute = this._domElement.nextSibling;
            }

            if (nextDomAttribute) {
                // Move focus to next attribute
                const nextNameDom = nextDomAttribute.querySelector(
                    '.ct-attribute__name');
                return nextNameDom.focus();
            }
        });
    }
}
