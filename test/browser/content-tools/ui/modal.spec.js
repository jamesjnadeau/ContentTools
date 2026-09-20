/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// ModalUI

describe('ContentTools.ModalUI', function() {

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


    describe('ContentTools.ModalUI()', () => it('should return an instance of a ModalUI', function() {

        const modal = new ContentTools.ModalUI(true, false);
        return expect(modal instanceof ContentTools.ModalUI).toBe(true);
    }));

    describe('ContentTools.ModalUI.mount()', function() {

        it('should mount the component', function() {

            const modal = new ContentTools.ModalUI(true, true);
            editor.attach(modal);
            modal.show();
            return expect(modal.isMounted()).toBe(true);
        });

        it('should apply transparent flag', function() {

            // Check that the transparency and allowScrolling flags are set
            const modal = new ContentTools.ModalUI(true, true);
            editor.attach(modal);
            modal.show();

            // Check transparency flag is set
            const classes = modal.domElement().getAttribute('class').split(' ');
            return expect(classes.indexOf('ct-modal--transparent') > -1).toBe(true);
        });

        return it('should apply no-scrolling flag', function() {

            // Check that the transparency and allowScrolling flags are set
            const modal = new ContentTools.ModalUI(true, false);
            editor.attach(modal);
            modal.show();

            // Check no scrolling flag is not set
            const classes = (document.body.getAttribute('class') || '').split(' ');
            return expect(classes.indexOf('ct--no-scroll') > -1).toBe(true);
        });
    });


    describe('ContentTools.ModalUI.unmount()', function() {

        it('should unmount the component', function() {

            const modal = new ContentTools.ModalUI(true, true);
            editor.attach(modal);
            modal.show();
            modal.unmount();
            return expect(modal.isMounted()).toBe(false);
        });

        return it('should remove no-scrolling flag', function() {

            // Check that the transparency and allowScrolling flags are set
            const modal = new ContentTools.ModalUI(true, false);
            editor.attach(modal);
            modal.show();
            modal.unmount();

            // Check no scrolling flag is not set
            const classes = (document.body.getAttribute('class') || '').split(' ');
            return expect(classes.indexOf('ct--no-scroll') > -1).toBe(false);
        });
    });


    // Events

    return describe('ContentTools.ModalUI > Events', () => it('should trigger a `click` event if clicked', function() {

        const modal = new ContentTools.ModalUI(true, true);
        editor.attach(modal);
        modal.show();

        // Create function we can spy on to ensure the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the spied on function to the event
        modal.addEventListener('click', foo.handleFoo);

        // Create a fake click event against the modal's DOM element
        const clickEvent = document.createEvent('CustomEvent');
        clickEvent.initCustomEvent('click', false, false, null);
        modal.domElement().dispatchEvent(clickEvent);

        return expect(foo.handleFoo).toHaveBeenCalled();
    }));
});
