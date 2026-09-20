/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// ToolboxUI

describe('ContentTools.ToolboxUI', function() {

    let div = null;
    let editor = null;

    beforeEach(function() {
        // Create an editable region
        div = document.createElement('div');
        div.setAttribute('class', 'editable');
        div.setAttribute('id', 'foo');
        div.innerHTML = '<p>bar</p><img scr="test.png">';
        document.body.appendChild(div);

        // Initialize the editor
        editor = ContentTools.EditorApp.get();
        editor.init('.editable');
        return editor.start();
    });

    afterEach(function() {
        // Shutdown the editor
        editor.stop();
        editor.destroy();

        // Remove the editable region
        return document.body.removeChild(div);
    });


    describe('ContentTools.ToolboxUI()', () => it('should return an instance of a ToolboxUI', function() {

        const toolbox = new ContentTools.ToolboxUI([]);
        return expect(toolbox instanceof ContentTools.ToolboxUI).toBe(true);
    }));


    describe('ContentTools.ToolboxUI.isDragging()', () => it(`should return true if the ToolboxUI is currently being \
dragged`, function() {

        const toolbox = editor._toolbox;

        // By default the editor is not being dragged
        expect(toolbox.isDragging()).toBe(false);

        // Trigger a drag event
        const mouseDownEvent = document.createEvent('CustomEvent');
        mouseDownEvent.initCustomEvent('mousedown', false, false, null);
        toolbox._domGrip.dispatchEvent(mouseDownEvent);

        expect(toolbox.isDragging()).toBe(true);

        // Stop dragging
        const mouseUpEvent = document.createEvent('CustomEvent');
        mouseUpEvent.initCustomEvent('mouseup', false, false, null);
        document.dispatchEvent(mouseUpEvent);

        return expect(toolbox.isDragging()).toBe(false);
    }));


    describe('ContentTools.ToolboxUI.hide()', () => it(`should remove all event bindings before the toolbox is \
hidden`, function() {

        const toolbox = editor._toolbox;
        spyOn(toolbox, '_removeDOMEventListeners');
        toolbox.hide();

        return expect(toolbox._removeDOMEventListeners).toHaveBeenCalled();
    }));


    describe('ContentTools.ToolboxUI.tools()', function() {

        it('should return the list of tools that populate the toolbox', function() {

            // By default we expect the list of tools in the toolbox to match the
            // those in the `DEFAULT_TOOLS` setting.
            const toolbox = editor._toolbox;
            return expect(toolbox.tools()).toEqual(ContentTools.DEFAULT_TOOLS);
        });

        return it('should set the list of tools that populate the toolbox', function() {

            // Set a custom tool layout
            const toolbox = editor._toolbox;
            const customTools = [['bold', 'italic', 'link']];
            toolbox.tools(customTools);

            // Check the toolbox reflects the change
            return expect(toolbox.tools()).toEqual(customTools);
        });
    });


    describe('ContentTools.ToolboxUI.mount()', function() {

        it('should mount the component', function() {

            // Start the editor so the document is editable
            const toolbox = new ContentTools.ToolboxUI([]);
            editor.attach(toolbox);
            toolbox.mount();

            return expect(toolbox.isMounted()).toBe(true);
        });

        it(`should restore the position of the component to any previously \
saved state`, function() {

            // Manually set a restore point
            window.localStorage.setItem('ct-toolbox-position', '7,7');
            const toolbox = new ContentTools.ToolboxUI([]);
            editor.attach(toolbox);
            toolbox.mount();

            // Check the restore position was respected
            expect(toolbox.domElement().style.left).toBe('7px');
            return expect(toolbox.domElement().style.top).toBe('7px');
        });

        return it('should always be contained within the viewport', function() {

            // Manually set a restore point outside of the viewport
            window.localStorage.setItem('ct-toolbox-position', '-7,-7');
            const toolbox = new ContentTools.ToolboxUI([]);
            editor.attach(toolbox);
            toolbox.mount();

            // Check the restore position was respected
            expect(toolbox.domElement().style.left).toBe('');
            return expect(toolbox.domElement().style.top).toBe('');
        });
    });


    describe('ContentTools.ToolboxUI.updateTools()', () => it('should refresh all tool UIs in the toolbox', function(done) {

        // The `updateTools` method is called whenever the focused element
        // and/or content selection is changed.
        const toolbox = editor._toolbox;
        const region = editor.regions()['foo'];
        const element = region.children[0];

        // With no elements select the heading tool should be disabled
        expect(toolbox._toolUIs['heading'].disabled()).toBe(true);

        // Test that if we select an element the tools update
        element.focus();

        const checkUpdated = function() {
            expect(toolbox._toolUIs['heading'].disabled()).toBe(false);
            return done();
        };

        return setTimeout(checkUpdated, 500);
    }));


    // Interactions

    return describe('ContentTools.ToolboxUI > Keyboard short-cuts', function() {

        it(`should allow a non-content element to be removed with the delete key \
short-cut`, function() {

            // Select an element and delete it with the short-cut
            const toolbox = editor._toolbox;
            const region = editor.regions()['foo'];
            const element = region.children[1];
            element.focus();

            // Trigger the remove short-cut event
            const keyDownEvent = document.createEvent('CustomEvent');
            keyDownEvent.initCustomEvent('keydown', false, false, null);
            keyDownEvent.keyCode = 46;
            window.dispatchEvent(keyDownEvent);

            return expect(region.children.length).toBe(1);
        });

        it(`should allow a undo to be triggered with Ctrl-z key \
short-cut`, function() {

            // Select an element and delete it with the short-cut
            const toolbox = editor._toolbox;
            const region = editor.regions()['foo'];
            const element = region.children[1];

            // Spy on the `canApply` class method called if the short-cut is used
            spyOn(ContentTools.Tools.Undo, 'canApply');

            // Trigger the undo short-cut event
            const keyDownEvent = document.createEvent('CustomEvent');
            keyDownEvent.initCustomEvent('keydown', false, false, null);
            keyDownEvent.keyCode = 90;
            keyDownEvent.ctrlKey = true;
            window.dispatchEvent(keyDownEvent);

            // Check the undo short-cut was called
            return expect(ContentTools.Tools.Undo.canApply).toHaveBeenCalled();
        });

        return it(`should allow a redo to be triggered with Ctrl-Shift-z key \
short-cut`, function() {

            // Select an element and delete it with the short-cut
            const toolbox = editor._toolbox;
            const region = editor.regions()['foo'];
            const element = region.children[1];
            element.focus();

            // Spy on the `canApply` class method called if the short-cut is used
            spyOn(ContentTools.Tools.Redo, 'canApply');

            // Trigger the redo short-cut event
            const keyDownEvent = document.createEvent('CustomEvent');
            keyDownEvent.initCustomEvent('keydown', false, false, null);
            keyDownEvent.keyCode = 90;
            keyDownEvent.ctrlKey = true;
            keyDownEvent.shiftKey = true;
            window.dispatchEvent(keyDownEvent);

            // Check the redo short-cut was called
            return expect(ContentTools.Tools.Redo.canApply).toHaveBeenCalled();
        });
    });
});


// ToolsUI

describe('ContentTools.ToolboxUI', function() {

    let div = null;
    let editor = null;

    beforeEach(function() {
        // Create an editable region
        div = document.createElement('div');
        div.setAttribute('class', 'editable');
        div.setAttribute('id', 'foo');
        div.innerHTML = '<p>bar</p><img scr="test.png">';
        document.body.appendChild(div);

        // Initialize the editor
        editor = ContentTools.EditorApp.get();
        return editor.init('.editable');
    });

    afterEach(function() {
        // Shutdown the editor
        editor.destroy();

        // Remove the editable region
        return document.body.removeChild(div);
    });


    describe('ContentTools.ToolUI()', () => it('should return an instance of a ToolUI', function() {

        const tool = new ContentTools.ToolUI(ContentTools.ToolShelf.fetch('bold'));
        return expect(tool instanceof ContentTools.ToolUI).toBe(true);
    }));


    describe('ContentTools.ToolUI.disabled()', () => it('should set/get the disabled state for the tool', function() {

        const tool = new ContentTools.ToolUI(ContentTools.ToolShelf.fetch('bold'));

        // Check that the default ignition disabled state to be true
        expect(tool.disabled()).toBe(false);

        // Check we can change it
        tool.disabled(true);
        return expect(tool.disabled()).toBe(true);
    }));


    describe('ContentTools.ToolUI.apply()', () => it('should apply the tool associated with the component', function() {

        const tool = new ContentTools.ToolUI(
            ContentTools.ToolShelf.fetch('heading'));
        const region = new ContentEdit.Region(
            document.querySelectorAll('.editable')[0]);
        const element = region.children[0];

        // Apply the tool to a paragraph and check that it successfully
        // converts the paragraph to a heading.
        tool.apply(element);

        return expect(element.tagName()).toBe('h1');
    }));


    describe('ContentTools.Tool.mount()', () => it('should mount the component', function() {

        // Start the editor so the document is editable
        const tool = new ContentTools.ToolUI(ContentTools.ToolShelf.fetch('bold'));
        editor.attach(tool);
        tool.mount(editor.domElement());

        return expect(tool.isMounted()).toBe(true);
    }));


    return describe('ContentTools.Tool.update()', () => it(`should update the state of the tool based on the currently focused \
element and content selection`, function() {

        const tool = new ContentTools.ToolUI(
            ContentTools.ToolShelf.fetch('heading'));
        const region = new ContentEdit.Region(
            document.querySelectorAll('.editable')[0]);
        const element = region.children[0];

        // Check the tool is disabled after an update if no element is
        // selected (e.g it's not applicable to the current selection).
        tool.update();
        expect(tool.disabled()).toBe(true);

        // Check the tool is enabled after an update if an element is
        // provided.
        tool.update(element);
        return expect(tool.disabled()).toBe(false);
    }));
});
