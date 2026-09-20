import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.ComponentUI = class ComponentUI {

    // All UI compontents inherit from the CompontentUI class which provides base
    // functionality and a common API.

    constructor() {

        // Event bindings for the component
        this._bindings = {};

        // The component's parent
        this._parent = null;

        // The component's children
        this._children = [];

        // The DOM element associated with this component
        this._domElement = null;
    }

    // Read-only methods

    children() {
        // Return the list of children for the component
        return this._children.slice();
    }

    domElement() {
        // Return the mounted DOM element for the component
        return this._domElement;
    }

    isMounted() {
        // Return true if the component is mounted to the DOM
        return this._domElement !== null;
    }

    parent() {
        // Return the parent of the component
        return this._parent;
    }

    // Methods

    attach(component, index) {
        // Attach a component as a child of this component

        if (component.parent()) {
            component.parent().detach(component);
        }

        component._parent = this;

        if (index !== undefined) {
            return this._children.splice(index, 0, component);
        } else {
            return this._children.push(component);
        }
    }

    addCSSClass(className) {
        // Add a CSS class to the DOM element
        if (!this.isMounted()) {
            return;
        }
        return ContentEdit.addCSSClass(this._domElement, className);
    }

    detach(component) {
        // Detach a child component from this component

        // Find the component to detatch (if not found return)
        const componentIndex = this._children.indexOf(component);
        if (componentIndex === -1) {
            return;
        }

        // Remove the component from the components children
        return this._children.splice(componentIndex, 1);
    }

    mount() {}
        // Mount the component to the DOM

    removeCSSClass(className) {
        // Remove a CSS class from the DOM element
        if (!this.isMounted()) {
            return;
        }

        return ContentEdit.removeCSSClass(this._domElement, className);
    }

    unmount() {
        // Unmount the component from the DOM
        if (!this.isMounted()) {
            return;
        }

        this._removeDOMEventListeners();
        if (this._domElement.parentNode) {
            this._domElement.parentNode.removeChild(this._domElement);
        }

        return this._domElement = null;
    }

    // Event methods

    addEventListener(eventName, callback) {
        // Add an event listener for the UI component

        // Check a list has been set for the specified event
        if (this._bindings[eventName] === undefined) {
            this._bindings[eventName] = [];
        }

        // Add the callback to list for the event
        this._bindings[eventName].push(callback);

    }

    createEvent(eventName, detail) {
        // Create an event
        return new ContentTools.Event(eventName, detail);
    }

    dispatchEvent(ev) {
        // Dispatch an event against the UI compontent

        // Check we have callbacks to trigger for the event
        if (!this._bindings[ev.name()]) {
            return !ev.defaultPrevented();
        }

        // Call each function bound to the event
        for (var callback of Array.from(this._bindings[ev.name()])) {
            if (ev.propagationStopped()) {
                break;
            }

            if (!callback) {
                continue;
            }

            callback.call(this, ev);
        }

        return !ev.defaultPrevented();
    }

    removeEventListener(eventName, callback) {
        // Remove a previously registered event listener for the UI component

        // If no eventName is specified remove all events
        if (!eventName) {
            this._bindings = {};
            return;
        }

        // If no callback is specified remove all callbacks for the event
        if (!callback) {
            this._bindings[eventName] = undefined;
            return;
        }

        // Check if any callbacks are bound to this event
        if (!this._bindings[eventName]) {
            return;
        }

        // Remove the callback from the event
        return (() => {
            const result = [];
            for (let i = 0; i < this._bindings[eventName].length; i++) {
                var suspect = this._bindings[eventName][i];
                if (suspect === callback) {
                    result.push(this._bindings[eventName].splice(i, 1));
                } else {
                    result.push(undefined);
                }
            }
            return result;
        })();
    }

    // Private methods

    _addDOMEventListeners() {}
        // Add all event bindings for the DOM element in this method

    _removeDOMEventListeners() {}
        // Remove all event bindings for the DOM element in this method

    static createDiv(classNames, attributes, content) {
        // All UI components are constructed entirely from one or more nested
        // <div>s, this class method provides a shortcut for creating a <div>
        // including the initial CSS class names, attributes and content.

        // Create the element
        const domElement = document.createElement('div');

        // Add the specified CSS classes
        if (classNames && (classNames.length > 0)) {
            domElement.setAttribute('class', classNames.join(' '));
        }

        // Add the specified attributes
        if (attributes) {
            for (var name in attributes) {
                var value = attributes[name];
                domElement.setAttribute(name, value);
            }
        }

        if (content) {
            domElement.innerHTML = content;
        }

        return domElement;
    }
};


ContentTools.WidgetUI = class WidgetUI extends ContentTools.ComponentUI {

    // The widget class provides a base class for components that render at the
    // root of the application.

    attach(component, index) {
        // Attach a component as a child of this component
        super.attach(component, index);

        if (!this.isMounted()) {
            return component.mount();
        }
    }

    detach(component) {
        // Detach a child component from this component
        super.detach(component);

        if (this.isMounted()) {
            return component.unmount();
        }
    }

    detatch(component) {
        // Misspelling present in earlier versions, retain until the next minor
        // release so that a patch can be provided without breaking backward
        // compatability.
        console.log(
            'Please call detach, detatch will be removed in release 1.4.x'
            );
        return this.detach(component);
    }

    show() {
        // Show the widget

        // Make sure any hide action is stopped
        if (this._hideTimeout) {
            clearTimeout(this._hideTimeout);
            this._hideTimeout = null;
            this.unmount();
        }

        if (!this.isMounted()) {
            this.mount();
        }

        // We delay adding the --active modifier to ensure any CSS transition is
        // activated.
        const fadeIn = () => {
            this.addCSSClass('ct-widget--active');
            return this._showTimeout = null;
        };

        return this._showTimeout = setTimeout(fadeIn, 100);
    }

    hide() {
        // Hide the widget

        // Make sure any show action is stopped
        if (this._showTimeout) {
            clearTimeout(this._showTimeout);
            this._showTimeout = null;
        }

        // Removing the --active modifier will attempt to trigger an CSS
        // transition to fade out the widget. Once the transition to 0 opacity
        // is complete we unmount it.
        this.removeCSSClass('ct-widget--active');

        var monitorForHidden = () => {
            this._hideTimeout = null;

            // If there's no support for `getComputedStyle` then we fallback to
            // unmounting the widget immediately.
            if (!window.getComputedStyle) {
                this.unmount();
                return;
            }

            // If the widget is now hidden we unmount it
            if (parseFloat(window.getComputedStyle(this._domElement).opacity) < 0.01) {
                return this.unmount();
            } else {
                return this._hideTimeout = setTimeout(monitorForHidden, 250);
            }
        };

        if (this.isMounted()) {
            return this._hideTimeout = setTimeout(monitorForHidden, 250);
        }
    }
};


ContentTools.AnchoredComponentUI = class AnchoredComponentUI extends ContentTools.ComponentUI {

    // Anchored components are mounted against a specified DOM element at a
    // specified anchor. Remounting an anchored component requires that the
    // parent perform the re-mount.
    //
    // The benefit of anchored components is they are light weight and can be
    // rendered into different a specific DOM element by the parent, for example
    // tools within the toolbox are anchored components.

    mount(domParent, before=null) {
        // Mount the component to the DOM (mount should be called by inheriting
        // classes after they've created their DOM element using `super`.

        // Mount the element
        domParent.insertBefore(this._domElement, before);

        // Add interaction handlers
        return this._addDOMEventListeners();
    }
};
