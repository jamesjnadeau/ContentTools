import HTMLString from '../../vendor-src/html-string/namespace.js';
import ContentSelect from '../../vendor-src/content-select/content-select.js';
import ContentEdit from '../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from './namespace.js';
import {rootContext} from '../core/root-context.js';
import {HTML_PROFILE, filterToolGroups} from '../core/profile.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class _EditorApp extends ContentTools.ComponentUI {
    declare _busy: any;
    declare _children: any;
    declare _ctrlDown: any;
    declare _domElement: any;
    declare _domRegions: any;
    declare _emptyRegionsAllowed: any;
    declare _fixtureTest: any;
    declare _handleBeforeUnload: any;
    declare _handleClipboardPaste: any;
    declare _handleAttach: any;
    declare _handleDetach: any;
    declare _handleHighlightOff: any;
    declare _handleHighlightOn: any;
    declare _handleNextRegionTransition: any;
    declare _handlePreviousRegionTransition: any;
    declare _handleUnload: any;
    declare _handleVisibility: any;
    declare _highlightTimeout: any;
    declare _ignition: any;
    declare _inspector: any;
    declare _namingProp: any;
    declare _profile: any;
    declare _orderedRegions: any;
    declare _regionQuery: any;
    declare _regions: any;
    declare _regionsLastModified: any;
    declare _rootLastModified: any;
    declare _shiftDown: any;
    declare _state: any;
    declare _toolbox: any;
    declare history: any;


    // The editor application

    constructor() {
        super();

        // Whenever the user starts to edit the page a new history stack is
        // created to provide undo/redo support.
        this.history = null;

        // The state of the app
        this._state = 'dormant';

        // Flags indicating if the editor has been set to busy (typically whilst
        // the application waits for a response from a remote server).
        this._busy = false;

        // The property used to store a region/fixtures name
        this._namingProp = null;

        // The constraint profile: what this editor is allowed to produce. The
        // default allows everything v1.6.16 did, so every site that consults
        // it falls through to its original behaviour.
        this._profile = HTML_PROFILE;

        // The test to use to determine if region is a fixture (by default we
        // look for the data-fixture attribute).
        this._fixtureTest = domElement => domElement.hasAttribute('data-fixture');

        // The query (or set of DOM elements) that define the editable
        // regions/fixtures with the page.
        this._regionQuery = null;

        // A list of DOM elements representing regions
        this._domRegions = null;

        // A map of editable regions (`ContentEdit.Region/Fixture`) the editor
        // will manage.
        this._regions = {};

        // A list of the mapped regions used to determine their order
        this._orderedRegions = [];

        // The last modified dates for the root node and regions
        this._rootLastModified = null;
        this._regionsLastModified = {};

        // The UI widgets that form the editor's interface
        this._ignition = null;
        this._inspector = null;
        this._toolbox = null;

        // Flag used to indicate that for a temporary period the editor should
        // allow empty regions to exist.
        this._emptyRegionsAllowed = false;
    }

    // Read-only properties

    ctrlDown() {
        return this._ctrlDown;
    }

    domRegions() {
        // Return a list of DOM nodes that are assigned as be editable regions
        return this._domRegions;
    }

    getState() {
        // Returns the current state of the editor (see `ContentTools.EditorApp`
        // for information on possible editor states).
        return this._state;
    }

    ignition() {
        // Return the ignition component for the editor
        return this._ignition;
    }

    inspector() {
        // Return the inspector component for the editor
        return this._inspector;
    }

    isDormant() {
        // Return true if the editor is currently in the dormant state
        return this._state === 'dormant';
    }

    isReady() {
        // Return true if the editor is currently in the ready state
        return this._state === 'ready';
    }

    isEditing() {
        // Return true if the editor is currently in the editing state
        return this._state === 'editing';
    }

    orderedRegions() {
        // Return a list of regions in the given order
        return (Array.from<any>(this._orderedRegions).map((name) => this._regions[name]));
    }

    regions() {
        // Return a list of editable regions on the page
        return this._regions;
    }

    shiftDown() {
        return this._shiftDown;
    }

    toolbox() {
        // Return the toolbox component for the editor
        return this._toolbox;
    }

    // Methods

    busy(busy) {
        // Get/set the busy flag for the editor

        // Return the busy flag
        if (busy === undefined) {
            return this._busy;
        }

        // Set the busy flag
        this._busy = busy;

        // If the ignition exists set the busy flag for it also
        if (this._ignition) {
            return this._ignition.busy(busy);
        }
    }

    profile(profile?) {
        // Get/set the constraint profile for the editor
        if (profile === undefined) {
            return this._profile;
        }

        this._profile = profile;

        /* A profile set after `init()` has to catch up with what init
           already did: re-filter the toolbox it built, and re-apply the
           behaviour rules to the regions it already parsed. Setting the
           profile BEFORE init -- which is what the element does -- leaves
           both of these no-ops, and the 'attach' binding covers everything
           created from then on, region parsing included. */
        if (this._toolbox) {
            this._toolbox.tools(
                filterToolGroups(profile, ContentTools.DEFAULT_TOOLS)
                );
        }

        for (const name in this._regions) {
            this._applyProfileTo(this._regions[name]);
        }

        return profile;
    }

    createPlaceholderElement(region) {
        // Return a placeholder element for the region (used to populate an empty
        // region).
        return new ContentEdit.Text('p', {}, '');
    }

    init(
            queryOrDOMElements,
            namingProp,
            fixtureTest=null,
            withIgnition
            ) {

        // Initialize the editor application

        // Set the naming property
        if (namingProp == null) { namingProp = 'id'; }
        if (withIgnition == null) { withIgnition = true; }
        this._namingProp = namingProp;

        // If defined set the function used to test for fixtures
        if (fixtureTest) {
            this._fixtureTest = fixtureTest;
        }

        // Mount the element to the DOM
        this.mount();

        // Set up the ignition switch for page editing
        if (withIgnition) {
            this._ignition = new ContentTools.IgnitionUI();
            this.attach(this._ignition);

            // Set up events to allow the ignition switch to manage the editor
            // state.
            this._ignition.addEventListener('edit', ev => {
                ev.preventDefault();

                // Start the editor and set the ignition switch to `editing`
                this.start();
                return this._ignition.state('editing');
            });

            this._ignition.addEventListener('confirm', ev => {
                ev.preventDefault();

                if (this._ignition.state() !== 'editing') {
                    return;
                }

                // Stop the editor and request that changes are saved
                this._ignition.state('ready');
                return this.stop(true);
            });

            this._ignition.addEventListener('cancel', ev => {
                ev.preventDefault();

                if (this._ignition.state() !== 'editing') {
                    return;
                }

                // Stop the editor and request that changes are reverted
                this.stop(false);

                // Update the state of the ignition switch based on the outcome
                // of the stop action (e.g whether the revert was actioned or
                // cancelled).
                if (this.isEditing()) {
                    return this._ignition.state('editing');
                } else {
                    return this._ignition.state('ready');
                }
            });
        }

        // Toolbox
        this._toolbox = new ContentTools.ToolboxUI(
            filterToolGroups(this._profile, ContentTools.DEFAULT_TOOLS)
            );
        this.attach(this._toolbox);

        // Inspector
        this._inspector = new ContentTools.InspectorUI();
        this.attach(this._inspector);

        // Set as ready to edit
        this._state = 'ready';

        this._handleDetach = element => {
            return this._preventEmptyRegions();
        };

        // Apply the constraint profile to elements as they are created.
        // Applying it once over the regions would be undone the moment the
        // user pressed Enter, so it has to ride the 'attach' event -- the
        // sibling of the 'detach' binding above.
        this._handleAttach = (parent, element) => {
            return this._applyProfileTo(element);
        };

        this._handleClipboardPaste = (element, ev) => {
            // Get the clipboardData
            let clipboardData = null;

            // Non-IE browsers
            if (ev.clipboardData) {
                if (ev.clipboardData.getData('text/html') &&
                        (element.type() !== 'PreText')) {
                    this.pasteHTML(element, ev.clipboardData.getData('text/html'));
                } else {
                    this.pasteText(element, ev.clipboardData.getData('text/plain'));
                }

                return;
            }

            // IE browsers
            if (rootContext().clipboardData()) {
                clipboardData = rootContext().clipboardData().getData('TEXT');
                return this.pasteText(element, rootContext().clipboardData().getData('TEXT'));
            }
        };

        this._handleNextRegionTransition = region => {
            // Is there a next region?
            const regions = this.orderedRegions();
            const index = regions.indexOf(region);
            if (index >= (regions.length - 1)) {
                return;
            }

            // Move to the next region
            region = regions[index + 1];

            // Is there a content element to move to?
            let element = null;
            for (var child of Array.from<any>(region.descendants())) {
                if (child.content !== undefined) {
                    element = child;
                    break;
                }
            }

            // If there is a content child move the selection to it else check
            // the next region.
            if (element) {
                element.focus();
                element.selection(new ContentSelect.Range(0, 0));
                return;
            }

            return ContentEdit.Root.get().trigger('next-region', region);
        };

        this._handlePreviousRegionTransition = region => {
            // Is there a previous region?
            const regions = this.orderedRegions();
            const index = regions.indexOf(region);
            if (index <= 0) {
                return;
            }

            // Move to the previous region
            region = regions[index - 1];

            // Is there a content element to move to?
            let element = null;
            const descendants = region.descendants();
            descendants.reverse();
            for (var child of Array.from<any>(descendants)) {
                if (child.content !== undefined) {
                    element = child;
                    break;
                }
            }

            // If there is a content child move the selection to it else check
            // the next region.
            if (element) {
                const length = element.content.length();
                element.focus();
                element.selection(new ContentSelect.Range(length, length));
                return;
            }

            return ContentEdit.Root.get().trigger('previous-region', region);
        };

        // Check when elements are detached that the parent region is not empty
        ContentEdit.Root.get().bind('detach', this._handleDetach);

        // Constrain elements as they are created
        ContentEdit.Root.get().bind('attach', this._handleAttach);

        // Monitor paste events so that we can pre-parse the content the user
        // wants to paste into the region.
        ContentEdit.Root.get().bind('paste', this._handleClipboardPaste);

        // Manage the transition between regions
        ContentEdit.Root.get().bind('next-region', this._handleNextRegionTransition);
        ContentEdit.Root.get().bind(
            'previous-region',
            this._handlePreviousRegionTransition
            );

        // Sync the page regions
        return this.syncRegions(queryOrDOMElements);
    }

    destroy() {
        // Destroy the editor application

        // Remove any events bound to the ContentEdit Root
        ContentEdit.Root.get().unbind('detach', this._handleDetach);
        ContentEdit.Root.get().unbind('attach', this._handleAttach);
        ContentEdit.Root.get().unbind('paste', this._handleClipboardPaste);
        ContentEdit.Root.get().unbind(
            'next-region',
            this._handleNextRegionTransition
            );
        ContentEdit.Root.get().unbind(
            'previous-region',
            this._handlePreviousRegionTransition
            );

        // Remove any event listeners attached to the editor
        this.removeEventListener();

        // Unmount the editor
        this.unmount();

        // Clear the list of children for the editor
        return this._children = [];
    }

    highlightRegions(highlight) {
        // Highlight (or stop highlighting) editiable regions within the page
        return Array.from<any>(this._domRegions).map((domRegion) =>
            highlight ?
                ContentEdit.addCSSClass(domRegion, 'ct--highlight')
            :
                ContentEdit.removeCSSClass(domRegion, 'ct--highlight'));
    }

    mount() {
        // Mount the widget to the DOM
        this._domElement = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-app']);
        rootContext().mountPoint().insertBefore(this._domElement, null);
        return this._addDOMEventListeners();
    }

    unmount() {
        // Unmount the widget from the DOM

        // Check the editor is mounted
        if (!this.isMounted()) {
            return;
        }

        // Unmount all children
        for (var child of Array.from<any>(this._children)) {
            child.unmount();
        }

        // Remove the DOM element
        this._domElement.parentNode.removeChild(this._domElement);
        this._domElement = null;

        // Remove any DOM event bindings
        this._removeDOMEventListeners();

        // Reset child component handles
        this._ignition = null;
        this._inspector = null;
        return this._toolbox = null;
    }

    // Page state methods

    pasteHTML(element, content) {
        // Paste HTML into/after the given element
        const tagNames = ContentEdit.TagNames.get();

        // Clean the HTML
        const sandbox = rootContext().createSandboxDocument();
        const wrapper = sandbox.createElement('div');
        wrapper.innerHTML = this._htmlCleaner().clean(content.trim());

        // Remove any undefined nodes or empty #text nodes
        const childNodes = [];
        for (var childNode of Array.from<any>(wrapper.childNodes)) {
            if (!childNode) {
                continue;
            }

            if (childNode.nodeName.toLowerCase() === '#text') {
                if (childNode.textContent.trim() === '') {
                    continue;
                }
            }

            childNodes.push(childNode);
        }

        if (!childNodes.length) {
            return;
        }

        // Paste the HTML
        const inlineTags = ContentTools.INLINE_TAGS.slice();
        inlineTags.push('#text');
        const firstNode = childNodes[0].nodeName.toLowerCase();
        const lastNode = childNodes[childNodes.length - 1].nodeName.toLowerCase();

        // Cater for a single line of HTML being pasted, or pasting into a
        // fixture.
        if (element.isFixed() || ((inlineTags.indexOf(firstNode) > -1) &&
                (inlineTags.indexOf(lastNode) > -1))) {

            // If we merging multiple block level elements into one we strip
            // HTML before doing so.
            //
            // HACK: This isn't the long term plan, where we're resolving here
            // is an issue where pasting multiple paragraphs into a fixture
            // causes issues because fixtures typically don't cater for block
            // level elements as children. Long term this needs to be improved
            // to cater for merging the text elements within to produce a
            // single text element (retaining the HTML tags) that can be pasted
            // into the fixture.
            //
            // ~ Anthony Blackshaw <ant@getme.co.uk>, 7 Jan 2018
            //
            if ((inlineTags.indexOf(firstNode) > -1) &&
                    (inlineTags.indexOf(lastNode) > -1)) {
                content = new HTMLString.String(wrapper.innerHTML);

            } else {
                content = new HTMLString.String(
                    HTMLString.String.encode(wrapper.textContent)
                );
            }

            // Check we can paste in to the selected element
            if (element.content) {

                // Insert the content into the element's existing content
                const selection = element.selection();
                const cursor = selection.get()[0] + content.length();
                const tip = element.content.substring(0, selection.get()[0]);
                const tail = element.content.substring(selection.get()[1]);

                // Format the string using tags for the first character it is
                // replacing (if any).
                const replaced = element.content.substring(
                    selection.get()[0],
                    selection.get()[1]
                    );
                if (replaced.length()) {
                    const character = replaced.characters[0];
                    const tags = character.tags();

                    if (character.isTag()) {
                        tags.shift();
                    }

                    if (tags.length >= 1) {
                        content = content.format(0, content.length(), ...Array.from<any>(tags));
                    }
                }

                element.content = tip.concat(content);
                element.content = element.content.concat(tail, false);
                element.updateInnerHTML();

                // Mark the element as tainted
                element.taint();

                // Restore the selection
                selection.set(cursor, cursor);
                element.selection(selection);

                return;

            } else {
                // Can't paste content into the selected element so update the
                // wrapper to contain a single paragraph.
                wrapper.innerHTML = '<p>' + content.html() + '</p>';
            }
        }

        // If the element isn't a text element find the nearest top level
        // node that we can insert the pasted content after.
        const originalElement = element;
        if (element.parent().type() !== 'Region') {
            element = element.closest(node => node.parent().type() === 'Region');
        }

        const region = element.parent();

        // If the content starts and ends with an inline tag then we need to
        // wrap it within a paragraph tag before inserting.

        if ((inlineTags.indexOf(firstNode) > -1) &&
                (inlineTags.indexOf(lastNode) > -1)) {

            const innerP = wrapper.createElement('p');
            while (wrapper.childNodes.length > 0) {
                innerP.appendChild(wrapper.childNodes[0]);
            }
            wrapper.appendChild(innerP);
        }

        let i = 0;
        let newElement = originalElement;
        for (var node of Array.from<any>(wrapper.childNodes)) {
            if (!node) {
                continue;
            }

            // Skip whitespace text elements
            if ((node.nodeName === '#text') && (node.textContent.trim() === '')) {
                continue;
            }

            // Attempt to convert the node to a ContentEdit element
            var elementCls = tagNames.match(node.nodeName);

            // We assume nodes that don't match an element are inline and so we
            // wrap then in a paragraph tag for insertion.
            if (elementCls === ContentEdit.Static) {
                var p = rootContext().createElement('p');
                p.appendChild(node);
                node = p;
                elementCls = ContentEdit.Text;
            }

            // Create the new element
            newElement = elementCls.fromDOMElement(node);

            // Insert the new element into the page
            region.attach(
                newElement,
                region.children.indexOf(element) + (1 + i)
            );

            i += 1;
        }

        // Focus on the last focusable element inserted
        if (newElement.focus) {
            return newElement.focus();

        } else if (newElement.nextSibling()) {
            newElement = newElement.nextSibling().previousWithTest(function(node) {
                if (node.focus) {
                    return node;
                }
            });

            if (newElement) {
                return newElement.focus();
            }

        } else {
            newElement = newElement.nextWithTest(function(node) {
                if (node.focus) {
                    return node;
                }
            });

            if (newElement) {
                return newElement.focus();
            } else {
                return originalElement.focus();
            }
        }
    }

    pasteText(element, content) {
        // Paste text into/after the given element

        // Convert the content into a series of lines to be inserted
        let lines;
        if (element.type() !== 'PreText') {
            lines = content.split('\n');
        } else {
            lines = [content];
        }

        // Filter out any blank (whitespace only) lines
        lines = lines.filter(line => line.trim() !== '');

        // Check there's something to paste.
        //
        // This read `if (!lines)`, which never fires: `lines` is an array and
        // an empty array is truthy. Pasting whitespace-only content therefore
        // fell through with nothing to paste and threw. A crash is not
        // behaviour anyone depends on, so the guard now does what it says.
        if (!lines.length) {
            return;
        }

        // Determine whether the new content should be pasted into the existing
        // element or should spawn new elements for each line of content.
        const encodeHTML = HTMLString.String.encode;
        let spawn = true;
        const type = element.type();

        // Are their multiple lines to add?
        if (lines.length === 1) {
            spawn = false;
        }

        // Is this a pre-text element which supports multiline content?
        if (type === 'PreText') {
            spawn = false;
        }

        // Does the element itself allow content to be spawned from it?
        if (!element.can('spawn')) {
            spawn = false;
        }

        if (spawn) {
            // Paste the content as multiple elements

            // Find the insertion point in the document
            let insertAt, insertIn, insertNode, lastItem;
            if (type === 'ListItemText') {
                // If the element is a ListItem then we want to insert the lines
                // as siblings.
                insertNode = element.parent();
                insertIn = element.parent().parent();
                insertAt = insertIn.children.indexOf(insertNode) + 1;

            } else {
                // For any other element type we want to insert the lines as
                // paragraphs.
                insertNode = element;
                if (insertNode.parent().type() !== 'Region') {
                    insertNode = element.closest(node => node.parent().type() === 'Region');
                }

                insertIn = insertNode.parent();
                insertAt = insertIn.children.indexOf(insertNode) + 1;
            }

            // Insert each line as a paragraph
            for (let i = 0; i < lines.length; i++) {
                var item;
                var line = lines[i];
                line = encodeHTML(line);
                if (type === 'ListItemText') {
                    item = new ContentEdit.ListItem();
                    var itemText = new ContentEdit.ListItemText(line);
                    item.attach(itemText);
                    lastItem = itemText;

                } else {
                    item = new ContentEdit.Text('p', {}, line);
                    lastItem = item;
                }

                insertIn.attach(item, insertAt + i);
            }

            // Give focus to the last line/paragraph added and position the
            // cursor at the end of it.
            const lineLength = lastItem.content.length();
            lastItem.focus();
            return lastItem.selection(new ContentSelect.Range(lineLength, lineLength));

        } else {
            // Paste the content within the existing element

            // Convert the content to a HTMLString
            content = encodeHTML(content);
            content = new HTMLString.String(content, type === 'PreText');

            // Insert the content into the element's existing content
            const selection = element.selection();
            const cursor = selection.get()[0] + content.length();
            const tip = element.content.substring(0, selection.get()[0]);
            const tail = element.content.substring(selection.get()[1]);

            // Format the string using tags for the first character it is
            // replacing (if any).
            const replaced = element.content.substring(
                selection.get()[0],
                selection.get()[1]
                );
            if (replaced.length()) {
                const character = replaced.characters[0];
                const tags = character.tags();

                if (character.isTag()) {
                    tags.shift();
                }

                if (tags.length >= 1) {
                    content = content.format(0, content.length(), ...Array.from<any>(tags));
                }
            }

            element.content = tip.concat(content);
            element.content = element.content.concat(tail, false);
            element.updateInnerHTML();

            // Mark the element as tainted
            element.taint();

            // Restore the selection
            selection.set(cursor, cursor);
            return element.selection(selection);
        }
    }

    revert() {
        // Revert the page to it's previous state before we started editing
        // the page.
        if (!this.dispatchEvent(this.createEvent('revert'))) {
            return;
        }

        // Check if there are any changes, and if there are make the user confirm
        // they want to lose them.
        if (ContentTools.CANCEL_MESSAGE) {
            const confirmMessage = ContentEdit._(ContentTools.CANCEL_MESSAGE);
            if ((ContentEdit.Root.get().lastModified() > this._rootLastModified) &&
                    !rootContext().confirm(confirmMessage)) {
                return false;
            }
        }

        // Revert the page to it's initial state
        this.revertToSnapshot(this.history.goTo(0), false);

        return true;
    }

    revertToSnapshot(snapshot, restoreEditable) {
        // Revert the page to the specified snapshot (the snapshot should be a
        // map of regions and the associated HTML).

        let name, region;
        if (restoreEditable == null) { restoreEditable = true; }
        const domRegions = [];
        for (name in this._regions) {
            // Apply the changes made to the DOM (affectively reseting the DOM to
            // a non-editable state).

            // Unmount all children
            region = this._regions[name];
            for (var child of Array.from<any>(region.children)) {
                child.unmount();
            }

            // Handle fixtures vs. standard regions
            if (snapshot.regions[name] !== undefined) {
                if ((region.children.length === 1) && region.children[0].isFixed()) {
                    var wrapper = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv();
                    wrapper.innerHTML = snapshot.regions[name];
                    domRegions.push(wrapper.firstElementChild);
                    region.domElement().parentNode.replaceChild(
                        wrapper.firstElementChild,
                        region.domElement()
                        );
                } else {
                    domRegions.push(region.domElement());
                    region.domElement().innerHTML = snapshot.regions[name];
                }
            } else {
                region.domElement().remove();
                delete this._regions[name];
            }
        }

        // Resync the DOM regions, this is required as fixture will replace the
        // existing DOM region element (regions wont).
        this._domRegions = domRegions;

        // Check to see if we need to restore the regions to an editable state
        if (restoreEditable) {
            // Unset any focused element against root
            if (ContentEdit.Root.get().focused()) {
                ContentEdit.Root.get().focused().blur();
            }

            // Reset the regions map
            this._regions = {};

            this.syncRegions(null, true);

            // Restore timestamps
            ContentEdit.Root.get()._modified = snapshot.rootModified;
            for (name in this._regions) {
                region = this._regions[name];
                if (snapshot.regionModifieds[name]) {
                    region._modified = snapshot.regionModifieds[name];
                }
            }

            // Update history with the new regions
            this.history.replaceRegions(this._regions);

            // Restore the selection for the snapshot
            this.history.restoreSelection(snapshot);

            // Update the inspector tags
            return this._inspector.updateTags();
        }
    }

    save(passive?) {
        // Save changes to the current page
        if (!this.dispatchEvent(this.createEvent('save', {passive}))) {
            return;
        }

        // Blur any active element to ensure empty elements are not retained
        const root = ContentEdit.Root.get();
        if (root.focused() && !passive) {
            root.focused().blur();
        }

        // Check the document has changed, if not we don't need do anything
        if ((root.lastModified() === this._rootLastModified) && passive) {
            // Trigger the saved event early with no modified regions,
            this.dispatchEvent(
                this.createEvent('saved', {regions: {}, passive})
                );
            return;
        }

        // Build a map of the modified regions
        const domRegions = [];
        const modifiedRegions = {};
        for (var name in this._regions) {
            // Check for regions that contain only a place holder
            var child;
            var region = this._regions[name];
            var html = region.html();
            // BUG, preserved deliberately: `!region.type() === 'Fixture'`
            // compares a boolean with a string, so it is ALWAYS FALSE and
            // this branch has never executed. The author meant
            // `region.type() !== 'Fixture'`. Fixing it would start blanking
            // the HTML of single-empty-child regions, which is a real change
            // to saved output, so it is left alone here and flagged for a
            // change that can be verified on its own.
            if ((region.children.length === 1) &&
                    ((!region.type() as unknown as string) === 'Fixture')) {
                child = region.children[0];
                if (child.content && !child.content.html()) {
                    html = '';
                }
            }

            // Apply the changes made to the DOM (affectively resetting the DOM
            // to a non-editable state).
            if (!passive) {
                // Unmount all children
                for (child of Array.from<any>(region.children)) {
                    child.unmount();
                }

                // Handle fixtures vs. standard regions
                if ((region.children.length === 1) && region.children[0].isFixed()) {
                    var wrapper = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv();
                    wrapper.innerHTML = html;
                    domRegions.push(wrapper.firstElementChild);
                    region.domElement().parentNode.replaceChild(
                        wrapper.firstElementChild,
                        region.domElement()
                    );
                } else {
                    domRegions.push(region.domElement());
                    region.domElement().innerHTML = html;
                }
            }

            // Check the region has been modified, if not we don't include it in
            // the output.
            if (region.lastModified() === this._regionsLastModified[name]) {
                continue;
            }

            modifiedRegions[name] = html;

            // Set the region back to not modified
            this._regionsLastModified[name] = region.lastModified();
        }

        // Resync the DOM regions, this is required as fixture will replace the
        // existing DOM region element (regions wont).
        this._domRegions = domRegions;

        // Trigger the saved event with a region HTML map for the changed
        // content.
        return this.dispatchEvent(
            this.createEvent('saved', {regions: modifiedRegions, passive})
        );
    }

    setRegionOrder(regionNames) {
        // Set the navigation order of regions on the page to the order set in
        // `regionNames`.
        return this._orderedRegions = regionNames.slice();
    }

    start() {
        // Start editing the page
        if (!this.dispatchEvent(this.createEvent('start'))) {
            return;
        }

        // Set the edtior to busy while we set up
        this.busy(true);

        // Convert each assigned node to a region
        this.syncRegions();
        this._initRegions();

        // Ensure no region is empty
        this._preventEmptyRegions();

        // Store the date at which the root was last modified so we can check for
        // changes on save.
        this._rootLastModified = ContentEdit.Root.get().lastModified();

        // Create a new history instance to store the page changes against
        this.history = new ContentTools.History(this._regions);
        this.history.watch();

        // Set the application state to editing
        this._state = 'editing';

        // Display the editing tools
        this._toolbox.show();
        this._inspector.show();

        this.busy(false);

        return this.dispatchEvent(this.createEvent('started'));
    }

    stop(save) {
        // Stop editing the page
        if (!this.dispatchEvent(this.createEvent('stop', {save}))) {
            return;
        }

        // HACK: We can't currently capture certain changes to text
        // elements (for example deletion of a section of text from the
        // context menu option). Long-term mutation observers or
        // consistent support for the `input` event against
        // `contenteditable` elements would resolve this.
        //
        // For now though we manually perform a content sync if an
        // element supporting that method has focus.
        const focused = ContentEdit.Root.get().focused();
        if (focused && focused.isMounted() &&
                (focused._syncContent !== undefined)) {

            focused._syncContent();
        }

        if (save) {
            this.save();
        } else {
            // If revert returns false then we cancel the stop action
            if (!this.revert()) {
                return;
            }
        }

        // Clear history
        this.history.stopWatching();
        this.history = null;

        // Hide the editing tools
        this._toolbox.hide();
        this._inspector.hide();

        // Remove all regions
        this._regions = {};

        // Set the application state to ready to edit
        this._state = 'ready';

        // Blur any existing focused element
        if (ContentEdit.Root.get().focused()) {
            this._allowEmptyRegions(() => {
                return ContentEdit.Root.get().focused().blur();
            });
        }

        return this.dispatchEvent(this.createEvent('stopped'));
    }

    syncRegions(regionQuery?, restoring?) {
        // Sync the editor with the page in order to map out the regions/fixtures
        // that can be edited.

        // If a region query has been provided then set it
        if (regionQuery) {
            this._regionQuery = regionQuery;
        }

        // Find the DOM elements that will be managed as regions/fixtures
        this._domRegions = [];
        if (this._regionQuery) {

            // If a string is provided attempt select the DOM regions using a CSS
            // selector.
            if ((typeof this._regionQuery === 'string') ||
                    this._regionQuery instanceof String) {
                this._domRegions = rootContext().contentScope().querySelectorAll(this._regionQuery);

            // Otherwise assume a valid list of DOM elements has been provided
            } else {
                this._domRegions = this._regionQuery;
            }
        }

        // If the editor is currently in the 'editing' state then live sync
        if (this._state === 'editing') {
            this._initRegions(restoring);
            this._preventEmptyRegions();
        }

        if (this._ignition) {
            if (this._domRegions.length) {
                return this._ignition.show();
            } else {
                return this._ignition.hide();
            }
        }
    }

    // Private methods

    _applyProfileTo(element) {
        // Apply the constraint profile's behaviour rules to one element and
        // its descendants.
        //
        // `can()` is ContentEdit's own per-element gate, so constraining
        // through it means the drag handles, resize corners and keyboard
        // paths all agree without any of them being taught about profiles.
        if (!element) {
            return;
        }

        if (!this._profile.resize && (element.type() === 'Image')) {
            element.can('resize', false);
        }

        if (element.children) {
            for (const child of Array.from<any>(element.children)) {
                this._applyProfileTo(child);
            }
        }
    }

    _htmlCleaner() {
        // Return the cleaner used to sanitize pasted HTML.
        //
        // Under the default profile this is exactly
        // `ContentTools.getHTMLCleaner()`, which consumers are documented to
        // override. A constraining profile cannot honour that override -- an
        // override returning a permissive cleaner would defeat the whole
        // constraint -- so it builds a cleaner from its own whitelists.
        const profile = this._profile;
        if (!profile.tags && !profile.attributes) {
            return ContentTools.getHTMLCleaner();
        }
        return new ContentTools.HTMLCleaner(
            profile.tags,
            profile.attributes,
            profile.voidTags
            );
    }

    _addDOMEventListeners() {
        // Add DOM event listeners for the widget

        // If the user holds the shift key down for a set period we highlight
        // editable regions on the page (for example by flashing them).
        //
        // In addition we monitor the Crtl/Meta and Shift key statuses so that
        // they can be tested independently of a ui event.
        this._handleHighlightOn = ev => {
            if ([17, 224, 91, 93].includes(ev.keyCode)) { // Ctrl/Cmd
                this._ctrlDown = true;
            }

            if ((ev.keyCode === 16) && !this._ctrlDown) { // Shift
                // Check for repeating key in which case we don't want to create
                // additional timeouts.
                if (this._highlightTimeout) {
                    return;
                }

                this._shiftDown = true;
                this._highlightTimeout = setTimeout(
                    () => this.highlightRegions(true),
                    ContentTools.HIGHLIGHT_HOLD_DURATION
                    );
                return;
            }

            // Remove the highlight if any other key is pressed
            clearTimeout(this._highlightTimeout);
            return this.highlightRegions(false);
        };

        this._handleHighlightOff = ev => {
            // Ignore repeated key press events
            if ([17, 224, 91, 93].includes(ev.keyCode)) { // Ctrl/Cmd
                this._ctrlDown = false;
                return;
            }

            if (ev.keyCode === 16) { // Shift
                this._shiftDown = false;
                if (this._highlightTimeout) {
                    clearTimeout(this._highlightTimeout);
                    this._highlightTimeout = null;
                }
                return this.highlightRegions(false);
            }
        };

        this._handleVisibility = ev => {
            // If the document is hidden at any time remove the region
            // highlighting.
            if (!rootContext().hasFocus()) {
                clearTimeout(this._highlightTimeout);
                return this.highlightRegions(false);
            }
        };

        rootContext().on('document', 'keydown', this._handleHighlightOn);
        rootContext().on('document', 'keyup', this._handleHighlightOff);
        rootContext().on('document', 'visibilitychange', this._handleVisibility);

        // When unloading the page we check to see if the user is currently
        // editing and if so ask them to confirm the action.
        this._handleBeforeUnload = ev => {
            if ((this._state === 'editing') && ContentTools.CANCEL_MESSAGE) {
                if (this.history && this.history._snapshotIndex) {
                    const cancelMessage = ContentEdit._(ContentTools.CANCEL_MESSAGE);
                    (ev || rootContext().currentEvent()).returnValue = cancelMessage;
                    return cancelMessage;
                }
            }
        };

        rootContext().on('window', 'beforeunload', this._handleBeforeUnload);

        // When the page is unloaded we destroy the app to make sure everything
        // is cleaned up.
        this._handleUnload = ev => {
            return this.destroy();
        };

        return rootContext().on('window', 'unload', this._handleUnload);
    }

    _allowEmptyRegions(callback) {
        // Execute a function while allowing empty regions (e.g disabling the
        // default `_preventEmptyRegions` behaviour).
        this._emptyRegionsAllowed = true;
        callback();
        return this._emptyRegionsAllowed = false;
    }

    _preventEmptyRegions() {
        // Ensure no region is empty by inserting a placeholder <p> tag if
        // required.
        if (this._emptyRegionsAllowed) {
            return;
        }

        // Check for any region that is now empty
        return (() => {
            const result = [];
            for (var name in this._regions) {
                var region = this._regions[name];
                var lastModified = region.lastModified();

                // We have to check for elements that can receive focus as static
                // elements alone don't allow new content to be added to a region.
                var hasEditableChildren = false;
                for (var child of Array.from<any>(region.children)) {
                    if (child.type() !== 'Static') {
                        hasEditableChildren = true;
                        break;
                    }
                }

                if (hasEditableChildren) {
                    continue;
                }

                // Insert a placeholder text element to prevent the region from
                // becoming empty.
                var placeholder = this.createPlaceholderElement(region);
                region.attach(placeholder);

                // HACK: This action will mark the region as modified which it
                // technically isn't and so we commit the change to nullify this.
                result.push(region._modified = lastModified);
            }
            return result;
        })();
    }

    _removeDOMEventListeners() {
        // Remove DOM event listeners for the widget

        // Highlight events
        rootContext().off('document', 'keydown', this._handleHighlightOn);
        rootContext().off('document', 'keyup', this._handleHighlightOff);
        // Previously leaked: added in _addDOMEventListeners but never removed,
        // so every destroy() left a visibilitychange listener on the document.
        rootContext().off('document', 'visibilitychange', this._handleVisibility);

        // Unload events
        rootContext().off('window', 'beforeunload', this._handleBeforeUnload);
        return rootContext().off('window', 'unload', this._handleUnload);
    }

    _initRegions(restoring?) {
        // Initialize DOM regions within the page

        let name;
        if (restoring == null) { restoring = false; }
        const found = {};
        const domRegions = [];
        this._orderedRegions = [];
        for (let i = 0; i < this._domRegions.length; i++) {

            // Find a name for the region
            var domRegion = this._domRegions[i];
            name = domRegion.getAttribute(this._namingProp);

            // If we can't find a name assign the region a name based on its
            // position on the page.
            if (!name) {
                name = i;
            }

            // Remember that we added a region/fixture with this name, those that
            // aren't found are removed.
            found[name] = true;

            // Update the order
            this._orderedRegions.push(name);

            // Check if the region/fixture is already initialized, in which case
            // we're done.
            if (this._regions[name] && (this._regions[name].domElement() === domRegion)) {
                continue;
            }

            // Initialize the new region/fixture
            if (this._fixtureTest(domRegion)) {
                this._regions[name] = new ContentEdit.Fixture(domRegion);
            } else {
                this._regions[name] = new ContentEdit.Region(domRegion);
            }
            domRegions.push(this._regions[name].domElement());

            // Store the date at which the region was last modified so we can
            // check for changes on save.
            if (!restoring) {
                this._regionsLastModified[name] = this._regions[name].lastModified();
            }
        }

        // Resync the DOM regions, this is required as fixture will replace the
        // existing DOM region element (regions wont).
        this._domRegions = domRegions;

        // Remove any regions no longer part of the page
        return (() => {
            const result = [];
            for (name in this._regions) {

            // If the region exists
                var region = this._regions[name];
                if (found[name]) {
                    continue;
                }

                // Remove the region
                delete this._regions[name];
                delete this._regionsLastModified[name];
                var index = this._orderedRegions.indexOf(name);
                if (index > -1) {
                    result.push(this._orderedRegions.splice(index, 1));
                } else {
                    result.push(undefined);
                }
            }
            return result;
        })();
    }
}


(function() {
    let instance = undefined;
    const Cls$editor = (ContentTools.EditorApp = class EditorApp {


        static initClass() {
    
            // The `ContentTools.EditorApp` class is a singleton, this code provides
            // access to the singleton instance of the protected `_EditorApp` class which
            // is initialized the first time the class method `get` is called.
    
            // Storage for the singleton instance that will be created for the editor app
            instance = null;
        }

        static get() {
            const cls = ContentTools.EditorApp.getCls();
            return instance != null ? instance : (instance = new cls());
        }

        static getCls() {
            return _EditorApp;
        }
    });
    Cls$editor.initClass();
    return Cls$editor;
})();
