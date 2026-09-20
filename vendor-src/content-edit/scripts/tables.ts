import ContentSelect from '../../content-select/content-select.js';
import ContentEdit from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let Cls$tables: any = (ContentEdit.Table = class Table extends ContentEdit.ElementCollection {
    static declare droppers: any;

    static initClass() {
    
        // Class properties
    
        this.droppers = {
            'Image': ContentEdit.Element._dropBoth,
            'ImageFixture': ContentEdit.Element._dropVert,
            'List': ContentEdit.Element._dropVert,
            'PreText': ContentEdit.Element._dropVert,
            'Static': ContentEdit.Element._dropVert,
            'Table': ContentEdit.Element._dropVert,
            'Text': ContentEdit.Element._dropVert,
            'Video': ContentEdit.Element._dropBoth
        };
    }

    // An editable table (e.g <table>)

    constructor(attributes) {
        super('table', attributes);
    }

    // Read-only properties

    cssTypeName() {
        // Return the CSS type modifier name for the element
        // (e.g ce-element--type-table).
        return 'table';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'Table';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'Table';
    }

    firstSection() {
        // Return the first table section associted with the table (if there is
        // one).
        let section;
        if (section = this.thead()) {
            return section;
        } else if (section =  this.tbody()) {
            return section;
        } else if (section = this.tfoot()) {
            return section;
        }
        return null;
    }

    lastSection() {
        // Return the last table section associted with the table (if there is
        // one).
        let section;
        if (section = this.tfoot()) {
            return section;
        } else if (section =  this.tbody()) {
            return section;
        } else if (section = this.thead()) {
            return section;
        }
        return null;
    }

    tbody() {
        // Return the table body associated with the table (if there is one)
        return this._getChild('tbody');
    }

    tfoot() {
        // Return the table footer associated with the table (if there is one)
        return this._getChild('tfoot');
    }

    thead() {
        // Return the table header associated with the table (if there is one)
        return this._getChild('thead');
    }

    // Event handlers

    _onMouseOver(ev) {
        super._onMouseOver(ev);

        // Don't highlight that we're over the element
        return this._removeCSSClass('ce-element--over');
    }

    // Private methods

    _getChild(tagName) {
        // Return a child of the table that matches the specified tag name
        for (var child of Array.from<any>(this.children)) {
            if (child.tagName() === tagName) {
                return child;
            }
        }
        return null;
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type

        // Create the table
        const table = new (this)(this.getDOMElementAttributes(domElement));

        // Create a list if child nodes we can safely remove whilst iterating
        // through them.
        const childNodes = (Array.from<any>(domElement.childNodes));

        // Parse the table for sections and rows
        const orphanRows = [];
        for (var childNode of Array.from<any>(childNodes)) {

            // Filter out non-elements
            if (childNode.nodeType !== 1) { // ELEMENT_NODE
                continue;
            }

            // Don't allow duplicate sections
            var tagName = childNode.tagName.toLowerCase();
            if (table._getChild(tagName)) {
                continue;
            }

            // Convert relevent child nodes
            switch (tagName) {

                case 'tbody': case 'tfoot': case 'thead':
                    var section = ContentEdit.TableSection.fromDOMElement(childNode);
                    table.attach(section);
                    break;

                case 'tr':
                    orphanRows.push(
                        ContentEdit.TableRow.fromDOMElement(childNode)
                        );
                    break;
            }
        }

        // If there are orphan rows
        if (orphanRows.length > 0) {
            if (!table._getChild('tbody')) {
                table.attach(new ContentEdit.TableSection('tbody'));
            }

            for (var row of Array.from<any>(orphanRows)) {
                table.tbody().attach(row);
            }
        }

        // If the table is empty then don't create it
        if (table.children.length === 0) {
            return null;
        }

        return table;
    }
});
Cls$tables.initClass();

// Register `ContentEdit.Table` the class with associated tag names
ContentEdit.TagNames.get().register(ContentEdit.Table, 'table');


ContentEdit.TableSection = class TableSection extends ContentEdit.ElementCollection {

    // An editable section of a table (e.g <thead>, <tbody>, <tfoot>)

    constructor(tagName, attributes) {
        super(tagName, attributes);
    }

    // Read-only properties

    cssTypeName() {
        // Return the CSS type modifier name for the element
        // (e.g ce-element--type-table-section).
        return 'table-section';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'TableSection';
    }

    // Event handlers

    _onMouseOver(ev) {
        super._onMouseOver(ev);

        // Don't highlight that we're over the element
        return this._removeCSSClass('ce-element--over');
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type

        // Create the table section
        const section = new (this)(
            domElement.tagName,
            this.getDOMElementAttributes(domElement)
            );

        // Create a list if child nodes we can safely remove whilst iterating
        // through them.
        const childNodes = (Array.from<any>(domElement.childNodes));

        // Parse the section for rows
        for (var childNode of Array.from<any>(childNodes)) {

            // Filter out non-elements
            if (childNode.nodeType !== 1) { // ELEMENT_NODE
                continue;
            }

            // Filter out non-<tr> elements
            if (childNode.tagName.toLowerCase() !== 'tr') {
                continue;
            }

            section.attach(ContentEdit.TableRow.fromDOMElement(childNode));
        }

        return section;
    }
};


Cls$tables = (ContentEdit.TableRow = class TableRow extends ContentEdit.ElementCollection {
    static declare droppers: any;

    static initClass() {
    
        // Class properties
    
        this.droppers =
            {'TableRow': ContentEdit.Element._dropVert};
    }

    // An editable table row (e.g <tr>)

    constructor(attributes) {
        super('tr', attributes);
    }

    // Read-only properties

    cssTypeName() {
        // Return the CSS type modifier name for the element
        // (e.g ce-element--type-table-row).
        return 'table-row';
    }

    isEmpty() {
        // Return true if the row is empty of content
        for (var cell of Array.from<any>(this.children)) {
            var text = cell.tableCellText();
            if (text && (text.content.length() > 0)) {
                return false;
            }
        }
        return true;
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'TableRow';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'Table row';
    }

    // Event handlers

    _onMouseOver(ev) {
        super._onMouseOver(ev);

        // Don't highlight that we're over the element
        return this._removeCSSClass('ce-element--over');
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type

        // Create the table row
        const row = new (this)(this.getDOMElementAttributes(domElement));

        // Create a list if child nodes we can safely remove whilst iterating
        // through them.
        const childNodes = (Array.from<any>(domElement.childNodes));

        // Parse the section for rows
        for (var childNode of Array.from<any>(childNodes)) {

            // Filter out non-elements
            if (childNode.nodeType !== 1) { // ELEMENT_NODE
                continue;
            }

            // Filter out non-<td/th> elements
            var tagName = childNode.tagName.toLowerCase();
            if ((tagName !== 'td') && (tagName !== 'th')) {
                continue;
            }

            row.attach(ContentEdit.TableCell.fromDOMElement(childNode));
        }

        return row;
    }
});
Cls$tables.initClass();


ContentEdit.TableCell = class TableCell extends ContentEdit.ElementCollection {

    // An editable table cell (e.g <td>, <th>).

    constructor(tagName, attributes) {
        super(tagName, attributes);
    }

    // Read-only properties

    cssTypeName() {
        return 'table-cell';
    }

    tableCellText() {
        // Return the table cell text associated with this table cell (if there
        // is one).
        if (this.children.length > 0) {
            return this.children[0];
        }
        return null;
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'TableCell';
    }

    // Methods

    html(indent?) {
        if (indent == null) { indent = ''; }
        const lines = [
            `${ indent }<${ this.tagName() }${ this._attributesToString() }>`
            ];
        if (this.tableCellText()) {
            lines.push(this.tableCellText().html(indent + ContentEdit.INDENT));
        }
        lines.push(`${ indent }</${ this.tagName() }>`);
        return lines.join(ContentEdit.LINE_ENDINGS);
    }

    // Event handlers

    _onMouseOver(ev) {
        super._onMouseOver(ev);

        // Don't highlight that we're over the element
        return this._removeCSSClass('ce-element--over');
    }

    // Disabled methods

    _addDOMEventListeners() {}
    _removeDOMEventListners() {}

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type
        const tableCell = new (this)(
            domElement.tagName,
            this.getDOMElementAttributes(domElement)
            );

        // Attach a table cell text item
        const tableCellText = new ContentEdit.TableCellText(
            domElement.innerHTML.replace(/^\s+|\s+$/g, '')
            );
        tableCell.attach(tableCellText);

        return tableCell;
    }
};


Cls$tables = (ContentEdit.TableCellText = class TableCellText extends ContentEdit.Text {
    declare _cached: any;
    declare _dragTimeout: any;
    declare _lastCached: any;

    static declare droppers: any;
    static declare mergers: any;

    static initClass() {
    
        // Class properties
    
        this.droppers = {};
    
        this.mergers = {};
    }

    // An editable table cell (e.g <td>, <th> -> TEXT_NODE).

    constructor(content) {
        super('div', {}, content);
    }

    // Read-only properties

    cssTypeName() {
        // Return the CSS type modifier name for the element
        // (e.g ce-element--type-table-cell-text).
        return 'table-cell-text';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'TableCellText';
    }

    _isInFirstRow() {
        const cell = this.parent();
        const row = cell.parent();
        const section = row.parent();
        const table = section.parent();

        if (section !== table.firstSection()) {
            return false;
        }

        return row === section.children[0];
    }

    _isInLastRow() {
        const cell = this.parent();
        const row = cell.parent();
        const section = row.parent();
        const table = section.parent();

        if (section !== table.lastSection()) {
            return false;
        }

        return row === section.children[section.children.length - 1];
    }

    _isLastInSection() {
        const cell = this.parent();
        const row = cell.parent();
        const section = row.parent();
        if (row !== section.children[section.children.length - 1]) {
            return false;
        }
        return cell === row.children[row.children.length - 1];
    }

    // Methods

    blur() {
        // Remove focus from the element

        if (this.isMounted()) {

            // Blur the DOM element
            this._domElement.blur();

            // Stop the element from being editable
            this._domElement.removeAttribute('contenteditable');
        }

        // Remove editing focus from this element
        return ContentEdit.Element.prototype.blur.call(this);
    }

    can(behaviour, allowed?) {
        // The allowed behaviour for a TableCellText instance reflects its parent
        // TableCell and can not be set directly.
        if (allowed) {
            throw new Error('Cannot set behaviour for ListItemText');
        }

        return this.parent().can(behaviour);
    }

    html(indent?) {
        // Return a HTML string for the node

        // For text elements with optimized output we use a cache to improve
        // performance for repeated calls.
        if (indent == null) { indent = ''; }
        // NOTE: `<=`, not `<`. Both _lastCached and _modified come from
        // Date.now(), so warming the cache and then taint()ing it inside the
        // same millisecond left a strict `<` reading false and html() served
        // stale content while the element's own content and DOM were correct.
        // PhantomJS was slow enough in 2015 to never collide; modern browsers
        // collide often. Re-checking when the stamps are equal costs at most
        // one redundant recompute.
        if (!this._lastCached || (this._lastCached <= this._modified)) {

            // Copy the content so we can optimize if for output, we also trim
            // whitespace from the string (if the behaviour hasn't been
            // disabled).
            let content;
            if (ContentEdit.TRIM_WHITESPACE) {
                content = this.content.copy().trim();
            } else {
                content = this.content.copy();
            }

            // Optimize the content for output
            content.optimize();

            this._lastCached = Date.now();
            this._cached = content.html();
        }

        return `${ indent }${ this._cached }`;
    }

    // Event handlers

    _onMouseDown(ev) {
        // Give the element focus
        ContentEdit.Element.prototype._onMouseDown.call(this, ev);

        // Tables support dragging of individual rows or the table. The drag is
        // initialized by clicking and holding the mouse down on a cell, how long
        // the user holds the mouse down determines which element is dragged (the
        // parent row or table).
        var initDrag = () => {
            const cell = this.parent();
            if (ContentEdit.Root.get().dragging() === cell.parent()) {
                // We're currently dragging the row so switch to dragging the
                // parent table.

                // Cancel dragging the row
                ContentEdit.Root.get().cancelDragging();

                // Find the table and start dragging it
                const table = cell.parent().parent().parent();
                return table.drag(ev.pageX, ev.pageY);

            } else {
                // We're not currently dragging anything so start dragging the
                // parent row.
                cell.parent().drag(ev.pageX, ev.pageY);

                // Reset a timeout for this function so that if the user
                // continues to hold down the mouse we can switch to the list
                // root.
                return this._dragTimeout = setTimeout(
                    initDrag,
                    ContentEdit.DRAG_HOLD_DURATION * 2
                    );
            }
        };

        clearTimeout(this._dragTimeout);
        return this._dragTimeout = setTimeout(initDrag, ContentEdit.DRAG_HOLD_DURATION);
    }

    // Key handlers

    _keyBack(ev) {
        let selection = ContentSelect.Range.query(this._domElement);
        if ((selection.get()[0] !== 0) || !selection.isCollapsed()) {
            return;
        }

        ev.preventDefault();

        // If this is the first cell in the row and the user the cell is empty
        // check to see if the whole row is empty and if so remove it.
        const cell = this.parent();
        const row = cell.parent();

        // Check we're allowed to delete the row
        if (!(row.isEmpty() && row.can('remove'))) {
            return;
        }

        if ((this.content.length() === 0) && (row.children.indexOf(cell) === 0)) {

            // Move the focus to the previous text element
            const previous = this.previousContent();
            if (previous) {
                previous.focus();
                selection = new ContentSelect.Range(
                    previous.content.length(),
                    previous.content.length()
                    );
                selection.select(previous.domElement());
            }

            // If this is the last row check we're allowed to
            return row.parent().detach(row);
        }
    }

    _keyDelete(ev) {
        // Check if the row is empty and if it is delete it
        const row = this.parent().parent();

        // Check we're allowed to delete the row
        if (!(row.isEmpty() && row.can('remove'))) {
            return;
        }

        ev.preventDefault();

        // Move the cursor to either the next row (if available) or the
        // next content element.
        const lastChild = row.children[row.children.length - 1];
        const nextElement = lastChild.tableCellText().nextContent();

        if (nextElement) {
            nextElement.focus();
            const selection = new ContentSelect.Range(0, 0);
            selection.select(nextElement.domElement());
        }

        return row.parent().detach(row);
    }

    _keyDown(ev) {
        const selection = ContentSelect.Range.query(this._domElement);
        if (!this._atEnd(selection) || !selection.isCollapsed()) {
            return;
        }

        ev.preventDefault();
        const cell = this.parent();

        // If this is the last row in the table move out of the section...
        if (this._isInLastRow()) {
            const row = cell.parent();
            const lastCell = row.children[row.children.length - 1].tableCellText();
            const next = lastCell.nextContent();

            if (next) {
                return next.focus();
            } else {
                // If no next element was found this must be the last content
                // node found so trigger an event for external code to manage a
                // region switch.
                return ContentEdit.Root.get().trigger(
                    'next-region',
                    this.closest(node => (node.type() === 'Fixture') || (node.type() === 'Region'))
                    );
            }

        // ...else move down vertically
        } else {
            const nextRow = cell.parent().nextWithTest(node => node.type() === 'TableRow');

            let cellIndex = cell.parent().children.indexOf(cell);
            cellIndex = Math.min(cellIndex, nextRow.children.length);

            return nextRow.children[cellIndex].tableCellText().focus();
        }
    }

    _keyReturn(ev) {
        ev.preventDefault();
        return this._keyTab({'shiftKey': false, 'preventDefault'() {}});
    }

    _keyTab(ev) {
        ev.preventDefault();
        const cell = this.parent();

        if (ev.shiftKey) {
            // If this is the first child in the first row of the table stop
            if (this._isInFirstRow() && (cell.parent().children[0] === cell)) {
                return;
            }

            // Else move to the previous table cell
            return this.previousContent().focus();

        } else {
            // Check if this is the last table cell in a tbody, if it is add
            // another row.
            if (!this.can('spawn')) {
                return;
            }

            const grandParent = cell.parent().parent();
            if ((grandParent.tagName() === 'tbody') && this._isLastInSection()) {
                const row = new ContentEdit.TableRow();

                // Copy the structure of this row
                for (var child of Array.from<any>(cell.parent().children)) {
                    var newCell = new ContentEdit.TableCell(
                            child.tagName(),
                            child._attributes
                            );
                    var newCellText = new ContentEdit.TableCellText('');
                    newCell.attach(newCellText);
                    row.attach(newCell);
                }

                // Add the new row to the section
                const section = this.closest(node => node.type() === 'TableSection');
                section.attach(row);

                // Move the focus to the first cell in the new row
                return row.children[0].tableCellText().focus();

            // If not the last table cell navigate to the next cell
            } else {
                return this.nextContent().focus();
            }
        }
    }

    _keyUp(ev) {
        const selection = ContentSelect.Range.query(this._domElement);
        if ((selection.get()[0] !== 0) || !selection.isCollapsed()) {
            return;
        }

        ev.preventDefault();
        const cell = this.parent();

        // If this is the first row in the table move out of the section...
        if (this._isInFirstRow()) {
            const row = cell.parent();
            const previous = row.children[0].previousContent();

            if (previous) {
                return previous.focus();
            } else {
                // If no previous element was found this must be the first
                // content node found so trigger an event for external code to
                // manage a region switch.
                return ContentEdit.Root.get().trigger(
                    'previous-region',
                    this.closest(node => (node.type() === 'Fixture') || (node.type() === 'Region'))
                    );
            }

        // ...else move up vertically
        } else {
            const previousRow = cell.parent().previousWithTest(node => node.type() === 'TableRow');

            let cellIndex = cell.parent().children.indexOf(cell);
            cellIndex = Math.min(cellIndex, previousRow.children.length);

            return previousRow.children[cellIndex].tableCellText().focus();
        }
    }
});
Cls$tables.initClass();
