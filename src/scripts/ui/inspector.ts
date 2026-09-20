import HTMLString from '../../../vendor-src/html-string/namespace.js';
import ContentSelect from '../../../vendor-src/content-select/content-select.js';
import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.InspectorUI = class InspectorUI extends ContentTools.WidgetUI {
    declare _domCounter: any;
    declare _domTags: any;
    declare _handleFocusChange: any;
    declare _tagUIs: any;
    declare _updateCounterInterval: any;


    // The inspector provides a breadcrumb style navigation tool for the
    // currently selected element in the document and it's chain of parent
    // elements.

    constructor() {
        super();

        // A list of TagUI elements displayed in the inspector
        this._tagUIs = [];
    }

    mount() {
        // Mount the widget to the DOM

        // Inspector
        this._domElement = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-widget', 'ct-inspector']);
        this.parent().domElement().appendChild(this._domElement);

        // Tags
        this._domTags = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv([
            'ct-inspector__tags',
            'ct-tags'
            ]);
        this._domElement.appendChild(this._domTags);

        // Counter
        this._domCounter = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-inspector__counter']);
        this._domElement.appendChild(this._domCounter);
        this.updateCounter();

        // Add interaction handlers
        this._addDOMEventListeners();

        // Listen for changes in focus at which point we need to update the tool
        this._handleFocusChange = () => {
            return this.updateTags();
        };

        ContentEdit.Root.get().bind('blur', this._handleFocusChange);
        ContentEdit.Root.get().bind('focus', this._handleFocusChange);

        // We use mount here to catch instances where the tag name is changed, in
        // which case the focus wont be affected but the element will be
        // remounted in the DOM.
        return ContentEdit.Root.get().bind('mount', this._handleFocusChange);
    }

    unmount() {
        // Unmount the widget from the DOM
        super.unmount();

        this._domTags = null;

        // Remove listeners for the inspector
        ContentEdit.Root.get().unbind('blur', this._handleFocusChange);
        ContentEdit.Root.get().unbind('focus', this._handleFocusChange);
        return ContentEdit.Root.get().unbind('mount', this._handleFocusChange);
    }

    updateCounter() {
        // Update the counter displaying the number of words in the editable
        // regions and the line/column for the cursor if within a preformatted
        // text block.

        // The method used to count words is from
        // Countable - https://sacha.me/Countable/ and
        // https://github.com/RadLikeWhoa/Countable/.
        //
        // The formatting of the counts to thousands is from StackOverflow:
        // http://stackoverflow.com/questions/2901102/how-to-print-a-number-with-commas-as-thousands-separators-in-javascript

        if (!this.isMounted()) {
            return;
        }

        // Word count
        let completeText = '';
        for (var region of Array.from<any>(ContentTools.EditorApp.get().orderedRegions())) {

            // If one of the regions returned is undefined we ignore it, this can
            // happen if the regions are modified during an update but the
            // effects are harmless.
            if (!region) {
                continue;
            }

            completeText += region.domElement().textContent;
        }

        completeText = completeText.trim();

        // Strip tags
        completeText = completeText.replace(/<\/?[a-z][^>]*>/gi, '');

        // Strip zero-width spaces
        completeText = completeText.replace(/[\u200B]+/, '');

        // Strip other irrelevant characters
        completeText = completeText.replace(/['";:,.?¿\-!¡]+/g, '');

        // Count the words
        let word_count: any = (completeText.match(/\S+/g) || []).length;

        // Format the count to use commas for thousands
        word_count = word_count.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        // We only display line/column if the currently focused element is a
        // preformatted text block.
        const element = ContentEdit.Root.get().focused();
        if (!element ||
                (element.type() !== 'PreText') ||
                !element.selection().isCollapsed()) {
            this._domCounter.textContent = word_count;
            return;
        }

        // Line/Column
        let line: any = 0;
        let column: any = 1;

        // Find the selected line, column
        const sub = element.content.substring(0, element.selection().get()[0]);
        const lines = sub.text().split('\n');
        line = lines.length;
        column = lines[lines.length - 1].length + 1;

        // Format the line and column
        line = line.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        column = column.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        return this._domCounter.textContent = `${word_count} / ${line}:${column}`;
    }

    updateTags() {
        // Update the tags based on the current selection
        let tag;
        let element = ContentEdit.Root.get().focused();

        // Clear the current list of tags
        for (tag of Array.from<any>(this._tagUIs)) {
            tag.unmount();
        }

        this._tagUIs = [];

        // If there's no element selected we're done
        if (!element) {
            return;
        }

        // Get a list of parent elements for the currently selected element
        const elements = element.parents();
        elements.reverse();
        elements.push(element);

        return (() => {
            const result = [];
            for (element of Array.from<any>(elements)) {

            // Certain tags are ignored as attributes cannot be safely set
            // against them.
                if (ContentTools.INSPECTOR_IGNORED_ELEMENTS.indexOf(
                        element.type()) !== -1) {
                    continue;
                }

                // if element.isFixed()
                //     continue

                // Convert each element to a UI tag
                tag = new ContentTools.TagUI(element);
                this._tagUIs.push(tag);
                result.push(tag.mount(this._domTags));
            }
            return result;
        })();
    }

    _addDOMEventListeners() {
        // Add DOM event listeners for the widget

        // Update the counter every 4 times a second
        return this._updateCounterInterval = setInterval(
            () => this.updateCounter(),
            250
            );
    }

    _removeDOMEventListeners() {
        // Add DOM event listeners for the widget

        // Clear the counter update
        return clearInterval(this._updateCounterInterval);
    }
};


ContentTools.TagUI = class TagUI extends ContentTools.AnchoredComponentUI {
    declare _domElement: any;
    declare element: any;


    // A tag displayed in the inspector representing the selected element or one
    // of it's parents.

    constructor(element) {
        super();

        this._onMouseDown = this._onMouseDown.bind(this);
        this.element = element;
    }

    // Methods

    mount(domParent, before=null) {
        // Mount the component to the DOM

        this._domElement = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-tag']);
        this._domElement.textContent = this.element.tagName();

        return super.mount(domParent, before);
    }

    // Private methods

    _addDOMEventListeners() {
        // Add DOM event listeners for the widget
        return this._domElement.addEventListener('mousedown', this._onMouseDown);
    }

    _onMouseDown(ev) {
        // Open a properties dialog for the associated element

        // We don't want to lose selected elements focus so prevent the event's
        // default behaviour.
        ev.preventDefault();

        // If supported allow store the state for restoring once the dialog is
        // cancelled.
        if (this.element.storeState) {
            this.element.storeState();
        }

        // Set-up the dialog
        const app = ContentTools.EditorApp.get();

        // Modal
        const modal = new ContentTools.ModalUI();

        // Dialog
        const dialog = new ContentTools.PropertiesDialog(this.element);

        // Support cancelling the dialog
        dialog.addEventListener('cancel', () => {
            modal.hide();
            dialog.hide();

            if (this.element.restoreState) {
                return this.element.restoreState();
            }
        });

        // Support saving the dialog
        dialog.addEventListener('save', ev => {
            let element;
            const detail = ev.detail();
            const attributes = detail.changedAttributes;
            const styles = detail.changedStyles;
            const {
                innerHTML
            } = detail;

            // Apply the attribute changes
            for (var name in attributes) {

                // The `class` attribute has to be handled differently from other
                // attributes as CSS classes should only be set using the
                // add/removeCSSClass methods.
                var value = attributes[name];
                if (name === 'class') {

                    // If the value is null (marked for remove) default it to an
                    // empty string so all classes will be safely removed.
                    var className;
                    if (value === null) {
                        value = '';
                    }

                    // Apply any new classes (and build a map of all classes for
                    // the element so we know which ones, if any, to remove).
                    var classNames = {};
                    for (className of Array.from<any>(value.split(' '))) {
                        className = className.trim();

                        if (!className) {
                            continue;
                        }

                        classNames[className] = true;

                        // If the element doesn't have the class add it
                        if (!this.element.hasCSSClass(className)) {
                            this.element.addCSSClass(className);
                        }
                    }

                    // Remove any classes no longer present
                    for (className of Array.from<any>(this.element.attr('class').split(' '))) {
                        className = className.trim();

                        // If the class is no longer assocated with the element
                        // remove it.
                        if (classNames[className] === undefined) {
                            this.element.removeCSSClass(className);
                        }
                    }

                } else {
                    if (value === null) {
                        this.element.removeAttr(name);
                    } else {
                        this.element.attr(name, value);
                    }
                }
            }

            // Apply the style changes
            for (var cssClass in styles) {
                var applied = styles[cssClass];
                if (applied) {
                    this.element.addCSSClass(cssClass);
                } else {
                    this.element.removeCSSClass(cssClass);
                }
            }

            // Apply any inner HTML changes
            if (innerHTML !== null) {

                // Check there has been a change
                if (innerHTML !== dialog.getElementInnerHTML()) {

                    // Update the elements inner HTML
                    ({
                        element
                    } = this);
                    if (!element.content) {
                        element = element.children[0];
                    }

                    element.content = new HTMLString.String(
                        innerHTML,
                        element.content.preserveWhitespace()
                        );
                    element.updateInnerHTML();
                    element.taint();

                    // If we've changed the inner HTML just place the caret at
                    // the start of the selection.
                    element.selection(new ContentSelect.Range(0, 0));
                    element.storeState();
                }
            }

            modal.hide();
            dialog.hide();

            // Restore any previous state
            if (this.element.restoreState) {
                return this.element.restoreState();
            }
        });

        // Show the dialog
        app.attach(modal);
        app.attach(dialog);
        modal.show();
        return dialog.show();
    }
};
