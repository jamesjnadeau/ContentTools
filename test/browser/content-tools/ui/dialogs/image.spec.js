/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// ImageDialog

describe('ContentTools.ImageDialog', function() {

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


    describe('ContentTools.ImageDialog()', () => it('should return an instance of a ImageDialog', function() {

        const dialog = new ContentTools.ImageDialog();
        return expect(dialog instanceof ContentTools.ImageDialog).toBe(true);
    }));


    return describe('ContentTools.ImageDialog.cropRegion()', () => it('should return the crop region set by the user', function() {

        const dialog = new ContentTools.ImageDialog();
        editor.attach(dialog);
        dialog.mount();

        // By default this should return the entire image [0, 0, 1, 1]
        expect(dialog.cropRegion()).toEqual([0, 0, 1, 1]);

        // Populate the dialog with an image
        dialog._domView.style.width = '400px';
        dialog._domView.style.height = '400px';
        dialog.populate('test.png', [400, 400]);

        // Add some crop marks for the dialog
        dialog.addCropMarks();
        dialog._cropMarks._domHandles[1].style.left = '200px';
        dialog._cropMarks._domHandles[1].style.top = '200px';

        // By default this should return the entire image [0, 0, 1, 1]
        return expect(dialog.cropRegion()).toEqual([0, 0, 0.5, 0.5]);
    }));
});

    //addCropMarks
    //clear
    //mount
    //populate
    //progress
    //removeCropMarks
    //save
    //state
    //unmount