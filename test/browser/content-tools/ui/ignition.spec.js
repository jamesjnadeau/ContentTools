/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// IgnitionUI

describe('ContentTools.IgnitionUI', function() {

    let div = null;
    let editor = null;

    beforeEach(function() {
        // Create an editable region
        div = document.createElement('div');
        div.setAttribute('class', 'editable');
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


    describe('ContentTools.IgnitionUI()', () => it('should return an instance of a IgnitionUI', function() {

        const ignition = new ContentTools.IgnitionUI();
        return expect(ignition instanceof ContentTools.IgnitionUI).toBe(true);
    }));


    describe('ContentTools.IgnitionUI.busy()', () => it('should set/unset the ignition to busy', function() {

        const ignition = new ContentTools.IgnitionUI();

        // Check that the default ignition busy state is false
        expect(ignition.state()).toBe('ready');

        // Check we can change it
        ignition.busy(true);
        expect(ignition.state()).toBe('busy');

        // Check we can change it back
        ignition.busy(false);
        return expect(ignition.state()).toBe('ready');
    }));


    describe('ContentTools.IgnitionUI.cancel()', () => it(`should set the ignition to editing and trigger the cancel \
event`, function() {

        // Set the ignition to editing
        const ignition = new ContentTools.IgnitionUI();
        ignition.state('editing');

        // Create function we can spy on to ensure the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the spied on function to the event
        ignition.addEventListener('cancel', foo.handleFoo);

        // Trigger the cancel event
        ignition.cancel();

        expect(foo.handleFoo).toHaveBeenCalled();
        return expect(ignition.state()).toBe('ready');
    }));

    describe('ContentTools.IgnitionUI.confim()', () => it(`should set the ignition to ready and trigger the confirm \
event`, function() {

        // Set the ignition to editing
        const ignition = new ContentTools.IgnitionUI();
        ignition.state('editing');

        // Create function we can spy on to ensure the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the spied on function to the event
        ignition.addEventListener('confirm', foo.handleFoo);

        // Trigger the confirm event
        ignition.confirm();

        expect(foo.handleFoo).toHaveBeenCalled();
        return expect(ignition.state()).toBe('ready');
    }));


    describe('ContentTools.IgnitionUI.edit()', () => it(`should set the ignition to editing and trigger the edit \
event`, function() {

        // Set the ignition to editing
        const ignition = new ContentTools.IgnitionUI();
        ignition.state('ready');

        // Create function we can spy on to ensure the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the spied on function to the event
        ignition.addEventListener('edit', foo.handleFoo);

        // Trigger the edit event
        ignition.edit();

        expect(foo.handleFoo).toHaveBeenCalled();
        return expect(ignition.state()).toBe('editing');
    }));


    describe('ContentTools.IgnitionUI.mount()', () => it('should mount the component', function() {

        const ignition = new ContentTools.IgnitionUI();
        editor.attach(ignition);
        ignition.mount();
        return expect(ignition.isMounted()).toBe(true);
    }));


    describe('ContentTools.IgnitionUI.state()', function() {

        it('should change the state of the ignition switch', function() {

            // Set the ignition to editing
            const ignition = new ContentTools.IgnitionUI();
            ignition.state('ready');

            // Create function we can spy on to ensure the event is triggered
            const foo = {
                handleFoo() {
                }
            };
            spyOn(foo, 'handleFoo');

            // Bind the spied on function to the event
            ignition.addEventListener('statechange', foo.handleFoo);

            // Trigger the edit event
            ignition.state('editing');

            expect(foo.handleFoo).toHaveBeenCalled();
            return expect(ignition.state()).toBe('editing');
        });

        return it('should get the state of the iginition switch', function() {

            // Set the ignition to editing
            const ignition = new ContentTools.IgnitionUI();
            expect(ignition.state()).toBe('ready');

            ignition.edit();
            expect(ignition.state()).toBe('editing');

            ignition.busy(true);
            return expect(ignition.state()).toBe('busy');
        });
    });


    describe('ContentTools.IgnitionUI.unmount()', () => it('should unmount the component', function() {

        const ignition = new ContentTools.IgnitionUI();
        editor.attach(ignition);
        ignition.mount();
        ignition.unmount();
        return expect(ignition.isMounted()).toBe(false);
    }));


    // Events

    return describe('ContentTools.IgnitionUI > Events', function() {

        it('should call `edit` when edit button is clicked', function() {

            const ignition = editor._ignition;

            // Spy on the edit methof
            spyOn(ignition, 'edit');

            // Create a fake click event against the modal's DOM element
            const clickEvent = document.createEvent('CustomEvent');
            clickEvent.initCustomEvent('click', false, false, null);
            ignition._domEdit.dispatchEvent(clickEvent);

            return expect(ignition.edit).toHaveBeenCalled();
        });

        it('should call `cancel` when cancel button is clicked', function() {

            const ignition = editor._ignition;

            // Spy on the edit methof
            spyOn(ignition, 'cancel');

            // Create a fake click event against the modal's DOM element
            const clickEvent = document.createEvent('CustomEvent');
            clickEvent.initCustomEvent('click', false, false, null);
            ignition._domCancel.dispatchEvent(clickEvent);

            return expect(ignition.cancel).toHaveBeenCalled();
        });

        return it('should call `confirm` when confirm button is clicked', function() {

            const ignition = editor._ignition;

            // Spy on the edit methof
            spyOn(ignition, 'confirm');

            // Create a fake click event against the modal's DOM element
            const clickEvent = document.createEvent('CustomEvent');
            clickEvent.initCustomEvent('click', false, false, null);
            ignition._domConfirm.dispatchEvent(clickEvent);

            return expect(ignition.confirm).toHaveBeenCalled();
        });
    });
});