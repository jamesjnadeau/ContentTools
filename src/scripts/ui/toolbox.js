import ContentSelect from '../../../vendor-src/content-select/content-select.js';
import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';
import {rootContext} from '../../core/root-context.js';

/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.ToolboxUI = class ToolboxUI extends ContentTools.WidgetUI {

    // The toolbox window provides a set of content editing tools to the user
    // (e.g make the selected text bold, insert an image, etc.) The toolbox is
    // also draggable so that the user can position as required whilst editing.

    constructor(tools) {
        super();

        this._onDrag = this._onDrag.bind(this);
        this._onStartDragging = this._onStartDragging.bind(this);
        this._onStopDragging = this._onStopDragging.bind(this);

        // The tools that will populate the toolbox. The structure of the tools
        // parameter should be an list of lists, where the top level list
        // represents tool groups and the sub-lists are made up of a list of tool
        // names, for example:
        //
        // [
        //     ['bold', 'italic'],    # Tool group 1
        //     ['image']              # Tool group 2
        //     ...
        // ]
        this._tools = tools;

        // Flag indicating if the toolbox is currently being dragged
        this._dragging = false;

        // The offset of the cursor to the toolbox's position on the page at the
        // point we start dragging.
        this._draggingOffset = null;

        // The DOM element relating to the toolbox's grip which allows the user
        // to drag the toolbox to any position on the page.
        this._domGrip = null;

        // A map of tool UI components mounted to the toolbox
        this._toolUIs = {};
    }

    // Read-only properties

    isDragging() {
        // Return true if the toolbox is currently being dragged
        return this._dragging;
    }

    // Methods

    hide() {
        // Hide the widget

        // We unbind events from the toolbox as soon as we start to hide it as we
        // don't want any interactions once the process of hiding the toolbox has
        // started.
        this._removeDOMEventListeners();

        return super.hide();
    }

    mount() {
        // Mount the widget to the DOM

        // Toolbox
        this._domElement = this.constructor.createDiv([
            'ct-widget',
            'ct-toolbox'
            ]);
        this.parent().domElement().appendChild(this._domElement);

        // Grip
        this._domGrip = this.constructor.createDiv([
            'ct-toolbox__grip',
            'ct-grip'
            ]);
        this._domElement.appendChild(this._domGrip);

        this._domGrip.appendChild(this.constructor.createDiv(['ct-grip__bump']));
        this._domGrip.appendChild(this.constructor.createDiv(['ct-grip__bump']));
        this._domGrip.appendChild(this.constructor.createDiv(['ct-grip__bump']));

        // Tools
        this._domToolGroups = this.constructor.createDiv(['ct-tool-groups']);
        this._domElement.appendChild(this._domToolGroups);
        this.tools(this._tools);

        // Restore the position of the element (if there's a restore set)
        const restore = rootContext().storage().getItem('ct-toolbox-position');
        if (restore && /^\d+,\d+$/.test(restore)) {
            const position = (Array.from(restore.split(',')).map((coord) => parseInt(coord)));
            this._domElement.style.left = `${ position[0] }px`;
            this._domElement.style.top = `${ position[1] }px`;

            // After restoring the position make sure the toolbox is still
            // visible in the window.
            this._contain();
        }

        // Add interaction handlers
        return this._addDOMEventListeners();
    }

    tools(tools) {
        // Get/Set the tools that populate the toolbox
        let toolName;
        if (tools === undefined) {
            return this._tools;
        }

        // Set the tools
        this._tools = tools;

        // Only attempt to mount the tools if the toolbox itself is mounted
        if (!this.isMounted()) {
            return;
        }

        // Clear existing tools
        for (toolName in this._toolUIs) {
            var toolUI = this._toolUIs[toolName];
            toolUI.unmount();
        }
        this._toolUIs = {};

        // Remove tool groups
        while (this._domToolGroups.lastChild) {
            this._domToolGroups.removeChild(this._domToolGroups.lastChild);
        }

        // Add the tools
        return (() => {
            const result = [];
            for (let i = 0; i < this._tools.length; i++) {

            // Create a group for the tools
                var toolGroup = this._tools[i];
                var domToolGroup = this.constructor.createDiv(['ct-tool-group']);
                this._domToolGroups.appendChild(domToolGroup);

                // Create an associated ToolUI compontent for each tool in the group
                result.push((() => {
                    const result1 = [];
                    for (toolName of Array.from(toolGroup)) {

                    // Get the tool
                        var tool = ContentTools.ToolShelf.fetch(toolName);

                        // Create an associated ToolUI component and add it to the
                        // toolbox.
                        this._toolUIs[toolName] = new ContentTools.ToolUI(tool);
                        this._toolUIs[toolName].mount(domToolGroup);
                        this._toolUIs[toolName].disabled(true);

                        // Whenever the tool is applied we'll want to force an update
                        result1.push(this._toolUIs[toolName].addEventListener('applied', () => {
                            return this.updateTools();
                        }));
                    }
                    return result1;
                })());
            }
            return result;
        })();
    }

    updateTools() {
        // Refresh all tool UIs in the toolbox

        // Get the currently focused element and selection (if there is one)
        const element = ContentEdit.Root.get().focused();
        let selection = null;
        if (element && element.selection) {
            selection = element.selection();
        }

        // Update the status of all tools
        return (() => {
            const result = [];
            for (var name in this._toolUIs) {
                var toolUI = this._toolUIs[name];
                result.push(toolUI.update(element, selection));
            }
            return result;
        })();
    }

    unmount() {
        // Unmount the widget from the DOM
        super.unmount();

        return this._domGrip = null;
    }

    // Private methods

    _addDOMEventListeners() {
        // Add DOM event listeners for the widget

        // Allow the toolbox to be dragged to a new location by the user
        this._domGrip.addEventListener('mousedown', this._onStartDragging);

        // Ensure that when the window is resized the toolbox remains in view
        this._handleResize = ev => {
            if (this._resizeTimeout) {
                clearTimeout(this._resizeTimeout);
            }

            const containResize = () => {
                return this._contain();
            };

            return this._resizeTimeout = setTimeout(containResize, 250);
        };

        rootContext().on('window', 'resize', this._handleResize);

        // Set up a timed event to update the status of each tool
        this._updateTools = () => {
            const app = ContentTools.EditorApp.get();

            // Determine if the element, selection, or document history has
            // changed, if not then we don't need to update the tools.
            let update = false;

            // Check the selected element and selection are the same
            const element = ContentEdit.Root.get().focused();

            let selection = null;
            if (element === this._lastUpdateElement) {
                if (element && element.selection) {
                    selection = element.selection();

                    // Check the selection hasn't changed
                    if (this._lastUpdateSelection) {
                        if (!selection.eq(this._lastUpdateSelection)) {
                            update = true;
                        }
                    } else {
                        update = true;
                    }
                }

            } else {
                // Not the same element
                update = true;
            }

            // Check the documents history (if there is one)
            if (app.history) {
                if (this._lastUpdateHistoryLength !== app.history.length()) {
                    update = true;
                }

                // Remember the history length for next update
                this._lastUpdateHistoryLength = app.history.length();

                if (this._lastUpdateHistoryIndex !== app.history.index()) {
                    update = true;
                }

                // Remember the history index for next update
                this._lastUpdateHistoryIndex = app.history.index();
            }

            // Remember the element/section for next update
            this._lastUpdateElement = element;
            this._lastUpdateSelection = selection;

            // Only update the tools if we can detect something has changed
            if (update) {
                return (() => {
                    const result = [];
                    for (var name in this._toolUIs) {
                        var toolUI = this._toolUIs[name];
                        result.push(toolUI.update(element, selection));
                    }
                    return result;
                })();
            }
        };

        this._updateToolsInterval = setInterval(this._updateTools, 100);

        // Capture top-level key events so that we can override common key
        // behaviour.
        this._handleKeyDown = ev => {

            // Keyboard events that apply only to non-text elements
            const element = ContentEdit.Root.get().focused();
            if (element && !element.content) {

                // Add support for deleting non-text elements using the `delete`
                // key.
                if (ev.keyCode === 46) {
                    ev.preventDefault();

                    // Remove the element
                    return ContentTools.Tools.Remove.apply(element, null, function() {});
                }

                // Add support for adding a new paragraph after non-text elements
                // using the `return` key.
                if (ev.keyCode === 13) {
                    ev.preventDefault();

                    // Add a new paragraph element after the current element
                    const {
                        Paragraph
                    } = ContentTools.Tools;
                    return Paragraph.apply(element, null, function() {});
                }
            }

            // Undo/Redo key support
            //
            // Windows undo: Ctrl+z
            // Windows redo: Ctrl+y
            // -
            // Mac undo:     Cmd+z
            // Mac redo:     Shift+Cmd+z
            // -
            // Linux undo:   Ctrl+z
            // Linux redo:   Shift+Ctrl+z

            // Guess the OS
            const version = navigator.appVersion;
            let os = 'linux';
            if (version.indexOf('Mac') !== -1) {
                os = 'mac';
            } else if (version.indexOf('Win') !== -1) {
                os = 'windows';
            }

            // Check for undo/redo command
            let redo = false;
            let undo = false;

            switch (os) {
                case 'linux':
                    if (!ev.altKey) {
                        if ((ev.keyCode === 90) && ev.ctrlKey) {
                            redo = ev.shiftKey;
                            undo = !redo;
                        }
                    }
                    break;

                case 'mac':
                    if (!(ev.altKey || ev.ctrlKey)) {
                        if ((ev.keyCode === 90) && ev.metaKey) {
                            redo = ev.shiftKey;
                            undo = !redo;
                        }
                    }
                    break;

                case 'windows':
                    if (!ev.altKey || ev.shiftKey) {
                        if ((ev.keyCode === 89) && ev.ctrlKey) {
                            redo = true;
                        }
                        if ((ev.keyCode === 90) && ev.ctrlKey) {
                            undo = true;
                        }
                    }
                    break;
            }

            // Perform undo/redo
            if (undo && ContentTools.Tools.Undo.canApply(null, null)) {
                ContentTools.Tools.Undo.apply(null, null, function() {});
            }

            if (redo && ContentTools.Tools.Redo.canApply(null, null)) {
                return ContentTools.Tools.Redo.apply(null, null, function() {});
            }
        };

        return rootContext().on('window', 'keydown', this._handleKeyDown);
    }

    _contain() {
        // Ensure the toolbox is visible in the current window
        if (!this.isMounted()) {
            return;
        }

        let rect = this._domElement.getBoundingClientRect();

        if ((rect.left + rect.width) > rootContext().viewportSize()[0]) {
            this._domElement.style.left = `${ rootContext().viewportSize()[0] - rect.width }px`;
        }

        if ((rect.top + rect.height) > rootContext().viewportSize()[1]) {
            this._domElement.style.top = `${ rootContext().viewportSize()[1] - rect.height }px`;
        }

        if (rect.left < 0) {
            this._domElement.style.left = '0px';
        }

        if (rect.top < 0) {
            this._domElement.style.top = '0px';
        }

        // Save the new position to local storage so we can restore it on
        // remount.
        rect = this._domElement.getBoundingClientRect();
        return rootContext().storage().setItem(
            'ct-toolbox-position',
            `${ rect.left },${ rect.top }`
            );
    }

    _removeDOMEventListeners() {
        // Remove DOM event listeners for the widget

        // Remove mouse event handlers
        if (this.isMounted()) {
            this._domGrip.removeEventListener('mousedown', this._onStartDragging);
        }

        // Remove key events
        rootContext().off('window', 'keydown', this._handleKeyDown);

        // Remove resize handler
        rootContext().off('window', 'resize', this._handleResize);

        // Remove timer for updating tools
        return clearInterval(this._updateToolsInterval);
    }

    // Dragging methods

    _onDrag(ev) {
        // User has dragged the toolbox to a new position

        // Prevent content selection while dragging elements
        ContentSelect.Range.unselectAll();

        // Reposition the toolbox
        this._domElement.style.left = `${ ev.clientX - this._draggingOffset.x }px`;
        return this._domElement.style.top = `${ ev.clientY - this._draggingOffset.y }px`;
    }

    _onStartDragging(ev) {
        // Start dragging the toolbox
        ev.preventDefault();

        if (this.isDragging()) {
            return;
        }

        // Flag that the toolbox is being dragged
        this._dragging = true;
        this.addCSSClass('ct-toolbox--dragging');

        // Calculate the offset of the cursor to the toolbox
        const rect = this._domElement.getBoundingClientRect();
        this._draggingOffset = {
            x: ev.clientX - rect.left,
            y: ev.clientY - rect.top
            };

        // Setup dragging behaviour for the element
        rootContext().on('document', 'mousemove', this._onDrag);
        rootContext().on('document', 'mouseup', this._onStopDragging);

        // Add dragging class to the body (this class is defined in ContentEdit
        // it disabled content selection via CSS).
        return rootContext().setGlobalState('dragging', true);
    }

    _onStopDragging(ev) {
        // User has finished dragging the toolbox to a new position
        if (!this.isDragging()) {
            return;
        }

        // Ensure the toolbox isn't outside the window
        this._contain();

        // Remove dragging behaviour
        rootContext().off('document', 'mousemove', this._onDrag);
        rootContext().off('document', 'mouseup', this._onStopDragging);

        // Reset the dragging offset
        this._draggingOffset = null;

        // Flag that the toolbox is no longer being dragged
        this._dragging = false;
        this.removeCSSClass('ct-toolbox--dragging');

        // Remove dragging class from the body (this class is defined in
        // ContentEdit it disabled content selection via CSS).
        return rootContext().setGlobalState('dragging', false);
    }
};


ContentTools.ToolUI = class ToolUI extends ContentTools.AnchoredComponentUI {

    // A tool that can be selected in the toolbox.

    constructor(tool) {
        super();

        this._addDOMEventListeners = this._addDOMEventListeners.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseLeave = this._onMouseLeave.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);

        // The tool associated with this UI tool
        this.tool = tool;

        // Flag indicating if the mouse button is down whilst the cursor is over
        // (and remains over) the tool.
        this._mouseDown = false;

        // Flag indicating if the tools is disabled
        this._disabled = false;
    }

    // Methods

    apply(element, selection) {
        // Apply the tool UIs associated tool
        if (!this.tool.canApply(element, selection)) {
            return;
        }

        const detail = {
            'element': element,
            'selection': selection
            };

        const callback = applied => {
            if (applied) {
                return this.dispatchEvent(this.createEvent('applied', detail));
            }
        };

        if (this.dispatchEvent(this.createEvent('apply', detail))) {
            return this.tool.apply(element, selection, callback);
        }
    }

    disabled(disabledState) {
        // Get/Set the disabled state of the tool

        // Return the current state if `disabledState` hasn't been provided
        if (disabledState === undefined) {
            return this._disabled;
        }

        // Set the state
        if (this._disabled === disabledState) {
            return;
        }

        // Set the disabled state
        this._disabled = disabledState;

        if (disabledState) {
            // Disable the tool
            this._mouseDown = false;
            this.addCSSClass('ct-tool--disabled');
            return this.removeCSSClass('ct-tool--applied');

        } else {
            // Enable the tool
            return this.removeCSSClass('ct-tool--disabled');
        }
    }

    mount(domParent, before=null) {
        // Mount the component to the DOM

        this._domElement = this.constructor.createDiv([
            'ct-tool',
            `ct-tool--${ this.tool.icon }`
            ]);

        // Add the tooltip
        this._domElement.setAttribute('data-ct-tooltip', ContentEdit._(this.tool.label));

        return super.mount(domParent, before);
    }

    update(element, selection) {
        // Update the state of the tool based on the current element and
        // selection.

        // Most elements are automatically disabled if there is no element
        // however some tools such as redo/undo don't require an element to be
        // applied.
        if (this.tool.requiresElement) {
            // If there's no element selected then the tool is disabled
            if (!(element && element.isMounted())) {
                this.disabled(true);
                return;
            }
        }

        // Check if the tool can be applied
        if (this.tool.canApply(element, selection)) {
            this.disabled(false);
        } else {
            this.disabled(true);
            return;
        }

        // Check of the tool is already being applied
        if (this.tool.isApplied(element, selection)) {
            return this.addCSSClass('ct-tool--applied');
        } else {
            return this.removeCSSClass('ct-tool--applied');
        }
    }

    // Private methods

    _addDOMEventListeners() {
        // Add all event bindings for the DOM element in this method
        this._domElement.addEventListener('mousedown', this._onMouseDown);
        this._domElement.addEventListener('mouseleave', this._onMouseLeave);
        return this._domElement.addEventListener('mouseup', this._onMouseUp);
    }

    // It's important to note that the click event for tools is managed in order
    // to prevent focus being lost from an element because of a tool being
    // clicked. Native 'mousedown' events triggered have their defaults
    // prevented.

    _onMouseDown(ev) {
        // Flag that the mouse has been clicked down over the tool
        ev.preventDefault();

        // If the tool is disabled ignore this event
        if (this.disabled()) {
            return;
        }

        this._mouseDown = true;
        return this.addCSSClass('ct-tool--down');
    }

    _onMouseLeave(ev) {
        // Cursor has left the tool so remove flag indicating the mouse is down
        // over the tool.
        this._mouseDown = false;
        return this.removeCSSClass('ct-tool--down');
    }

    _onMouseUp(ev) {
        // If a click event has occured exectute the tool
        if (this._mouseDown) {
            const element = ContentEdit.Root.get().focused();

            // Most elements are automatically disabled if there is no element
            // however some tools such as redo/undo don't require an element to
            // be applied.
            if (this.tool.requiresElement) {
                if (!element || !element.isMounted()) {
                    return;
                }
            }

            let selection = null;
            if (element && element.selection) {
                selection = element.selection();
            }

            this.apply(element, selection);
        }

        // Reset the mouse down flag
        this._mouseDown = false;
        return this.removeCSSClass('ct-tool--down');
    }
};
