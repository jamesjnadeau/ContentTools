/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// AnchoredDialogUI

describe('ContentTools.AnchoredDialogUI', function() {

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


    describe('ContentTools.AnchoredDialogUI()', () => it('should return an instance of a AnchoredDialogUI', function() {

        const dialog = new ContentTools.AnchoredDialogUI();
        return expect(dialog instanceof ContentTools.AnchoredDialogUI).toBe(true);
    }));


    describe('ContentTools.AnchoredDialogUI.mount()', () => it('should mount the dialog', function() {

        const dialog = new ContentTools.AnchoredDialogUI();
        editor.attach(dialog);
        dialog.mount();
        return expect(dialog.isMounted()).toBe(true);
    }));


    return describe('ContentTools.AnchoredDialogUI.position()', () => it('should set/get the dialog\'s position', function() {}));
});

            // @@ This test is no longer valid - need to determine how to set the
            // width for phantomjs.


// DialogUI

describe('ContentTools.DialogUI', function() {

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


    describe('ContentTools.DialogUI()', () => it('should return an instance of a DialogUI', function() {

        const dialog = new ContentTools.DialogUI('foo');
        return expect(dialog instanceof ContentTools.DialogUI).toBe(true);
    }));


    describe('ContentTools.DialogUI.busy()', () => it('should set/get the busy state for the dialog', function() {

        const dialog = new ContentTools.DialogUI('foo');
        editor.attach(dialog);
        dialog.mount();

        // Check that the default dialog busy state is false
        expect(dialog.busy()).toBe(false);
        let classes = dialog.domElement().getAttribute('class');
        expect(classes.indexOf('ct-dialog--busy')).toBe(-1);

        // Check we can change it
        dialog.busy(true);
        expect(dialog.busy()).toBe(true);
        classes = dialog.domElement().getAttribute('class');
        return expect(classes.indexOf('ct-dialog--busy') > 0).toBe(true);
    }));


    describe('ContentTools.DialogUI.position()', () => it('should set/get the dialog\'s caption', function() {

        const dialog = new ContentTools.DialogUI('foo');
        editor.attach(dialog);
        dialog.mount();

        // Initially the should be dialog's should be 'foo'
        expect(dialog.caption()).toEqual('foo');
        expect(dialog._domCaption.textContent).toEqual('foo');

        // Set a new caption and check the change has been applied
        dialog.caption('bar');
        expect(dialog.caption()).toEqual('bar');
        return expect(dialog._domCaption.textContent).toEqual('bar');
    }));


    describe('ContentTools.DialogUI.mount()', () => it('should mount the dialog', function() {

        const dialog = new ContentTools.DialogUI();
        editor.attach(dialog);
        dialog.mount();
        return expect(dialog.isMounted()).toBe(true);
    }));


    return describe('ContentTools.DialogUI.unmount()', () => it('should unmount the component', function() {

        const dialog = new ContentTools.DialogUI();
        editor.attach(dialog);
        dialog.mount();
        dialog.unmount();
        return expect(dialog.isMounted()).toBe(false);
    }));
});
