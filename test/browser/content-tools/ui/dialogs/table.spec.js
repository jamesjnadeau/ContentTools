// ContentTools.TableDialog
//
// `src/spec/ui/dialogs/table.coffee` was one of the six 0-byte spec files
// upstream shipped, which is why the constructor below went unguarded
// through the CoffeeScript conversion. See the "insert" case: it is the
// one the original decaffeinate output got wrong.

describe('ContentTools.TableDialog', function() {

    let div = null;
    let editor = null;

    beforeEach(function() {
        div = document.createElement('div');
        div.setAttribute('class', 'editable');
        document.body.appendChild(div);

        editor = ContentTools.EditorApp.get();
        return editor.init('.editable');
    });

    afterEach(function() {
        editor.destroy();
        return document.body.removeChild(div);
    });

    function newTable(columns = 2, {head = true, foot = false} = {}) {
        return ContentTools.Tools.Table._createTable({columns, head, foot});
    }

    describe('ContentTools.TableDialog()', function() {

        /* The regression. `new TableDialog(undefined)` is the INSERT path,
           and a constructor that calls super() twice throws
           "Super constructor may only be called once" before the dialog
           exists at all -- so the table tool could update a table the caret
           was already in, and could never add a new one. */
        it('should construct with no table (the insert case)', function() {
            const dialog = new ContentTools.TableDialog();
            return expect(dialog instanceof ContentTools.TableDialog).toBe(true);
        });

        it('should construct with a table (the update case)', function() {
            const dialog = new ContentTools.TableDialog(newTable());
            return expect(dialog instanceof ContentTools.TableDialog).toBe(true);
        });

        it('should be titled "Insert table" with no table', function() {
            const dialog = new ContentTools.TableDialog();
            editor.attach(dialog);
            dialog.mount();
            return expect(
                dialog._domCaption.textContent).toBe('Insert table');
        });

        it('should be titled "Update table" with a table', function() {
            const dialog = new ContentTools.TableDialog(newTable());
            editor.attach(dialog);
            dialog.mount();
            return expect(
                dialog._domCaption.textContent).toBe('Update table');
        });
    });

    describe('ContentTools.TableDialog.mount()', function() {

        it('should default to 3 columns with a head and no foot', function() {
            const dialog = new ContentTools.TableDialog();
            editor.attach(dialog);
            dialog.mount();

            expect(dialog._domBodyInput.value).toBe('3');
            expect(dialog._domHeadSection.getAttribute('class'))
                .toContain('ct-section--applied');
            return expect(dialog._domFootSection.getAttribute('class'))
                .not.toContain('ct-section--applied');
        });

        it('should read its configuration from an existing table', function() {
            const dialog = new ContentTools.TableDialog(
                newTable(4, {head: false, foot: true}));
            editor.attach(dialog);
            dialog.mount();

            expect(dialog._domBodyInput.value).toBe('4');
            expect(dialog._domHeadSection.getAttribute('class'))
                .not.toContain('ct-section--applied');
            return expect(dialog._domFootSection.getAttribute('class'))
                .toContain('ct-section--applied');
        });
    });

    describe('ContentTools.TableDialog.save()', () => it('should dispatch a save event carrying the table configuration', function() {

        const dialog = new ContentTools.TableDialog();
        editor.attach(dialog);
        dialog.mount();

        dialog._domBodyInput.value = '5';
        dialog._domFootSection.setAttribute(
            'class', 'ct-section ct-section--applied');

        let detail = null;
        dialog.addEventListener('save', ev => { detail = ev.detail(); });
        dialog.save();

        return expect(detail).toEqual({columns: 5, foot: true, head: true});
    }));
});


// The tool that drives the dialog. The bug the specs above pin was
// reported as "I can edit an existing table but I can't add a new one",
// which is this level, so it is worth proving end to end and not only at
// the dialog's constructor.

describe('ContentTools.Tools.Table.apply()', function() {

    let div = null;
    let editor = null;

    beforeEach(function() {
        div = document.createElement('div');
        div.setAttribute('class', 'editable');
        div.innerHTML = '<p>Somewhere to put it</p>';
        document.body.appendChild(div);

        editor = ContentTools.EditorApp.get();
        editor.init('.editable');
        return editor.start();
    });

    afterEach(function() {
        // stop(true), not stop(false): reverting runs a confirm dialog.
        editor.stop(true);
        editor.destroy();
        return document.body.removeChild(div);
    });

    /** The dialog the tool just attached to the app. */
    function openDialog() {
        return editor.children().filter(
            child => child instanceof ContentTools.TableDialog)[0];
    }

    it('should insert a new table after the focused element', function() {
        const region = editor.regions()['0'];
        const paragraph = region.children[0];
        paragraph.focus();

        let applied = null;
        ContentTools.Tools.Table.apply(paragraph, null, ok => { applied = ok; });

        const dialog = openDialog();
        expect(dialog).toBeDefined();
        // No surrounding table, so this is the insert path. `closest()`
        // answers null rather than undefined, which the dialog treats as
        // falsy exactly as the CoffeeScript did.
        expect(dialog.table).toBe(null);

        dialog._domBodyInput.value = '2';
        dialog.save();

        expect(applied).toBe(true);

        const table = region.children[1];
        expect(table.type()).toBe('Table');
        // head on by default, body always, no foot
        expect(table.children.length).toBe(2);
        return expect(
            table.firstSection().children[0].children.length).toBe(2);
    });

    it('should update the table the element is already inside', function() {
        const region = editor.regions()['0'];
        const table = ContentTools.Tools.Table._createTable(
            {columns: 2, head: true, foot: false});
        region.attach(table);

        const cellText = table.firstSection()
            .children[0].children[0].children[0];
        cellText.focus();

        let applied = null;
        ContentTools.Tools.Table.apply(cellText, null, ok => { applied = ok; });

        const dialog = openDialog();
        // Inside a table, so this is the update path.
        expect(dialog.table).toBe(table);

        dialog._domBodyInput.value = '4';
        dialog.save();

        expect(applied).toBe(true);
        // Same table, widened rather than a second one inserted.
        expect(region.children.length).toBe(2);
        return expect(
            table.firstSection().children[0].children.length).toBe(4);
    });
});
