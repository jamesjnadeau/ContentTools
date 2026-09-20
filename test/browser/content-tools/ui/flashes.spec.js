/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// FlashUI

describe('ContentTools.FlashUI', function() {

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


    describe('ContentTools.FlashUI()', function() {

        it('should return an instance of a FlashUI', function() {

            const flash = new ContentTools.FlashUI('ok');
            return expect(flash instanceof ContentTools.FlashUI).toBe(true);
        });

        it('should mount the component', function() {

            const flash = new ContentTools.FlashUI('ok');
            return expect(flash.isMounted()).toBe(true);
        });

        return it('should unmount the component after X seconds', function(done) {

            const flash = new ContentTools.FlashUI('ok');

            const checkUnmounted = function() {
                expect(flash.isMounted()).toBe(false);
                return done();
            };

            return setTimeout(checkUnmounted, 500);
        });
    });


    return describe('ContentTools.FlashUI.mount()', () => it('should mount the component and apply the specified modifier', function() {

        // `mount` is called with the specified modifier in the constructor
        const flash = new ContentTools.FlashUI('ok');
        expect(flash.isMounted()).toBe(true);

        // Get a list of classes against the class and check the specified
        // modifier is one of them.
        const classes = flash.domElement().getAttribute('class').split(' ');
        return expect(classes.indexOf('ct-flash--ok') > -1).toBe(true);
    }));
});