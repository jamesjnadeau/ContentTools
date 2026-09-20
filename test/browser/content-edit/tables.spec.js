/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Table

describe('`ContentEdit.Table()`', () => it('should return an instance of Table`', function() {
    const table = new ContentEdit.Table();
    return expect(table instanceof ContentEdit.Table).toBe(true);
}));


describe('`ContentEdit.Table.cssTypeName()`', () => it('should return \'table\'', function() {
    const table = new ContentEdit.Table();
    return expect(table.cssTypeName()).toBe('table');
}));


describe('`ContentEdit.Table.type()`', () => it('should return \'Table\'', function() {
    const table = new ContentEdit.Table();
    return expect(table.type()).toBe('Table');
}));


describe('`ContentEdit.Table.typeName()`', () => it('should return \'table\'', function() {
    const table = new ContentEdit.Table();
    return expect(table.typeName()).toBe('Table');
}));


describe('`ContentEdit.Table.firstSection()`', () => it(`should return the first section in the table (their position as children \
is irrelevant, the order is thead, tbody, tfoot in that order \
`, function() {
    const table = new ContentEdit.Table();
    const thead = new ContentEdit.TableSection('thead');
    const tbody = new ContentEdit.TableSection('tbody');
    const tfoot = new ContentEdit.TableSection('tfoot');

    // Return null if there are no sections
    expect(table.firstSection()).toBe(null);

    // Expect the order (thead, tbody, tfoot) to be honored no matter the
    // position as a child of the table.
    table.attach(tfoot);
    expect(table.firstSection()).toBe(tfoot);

    table.attach(tbody);
    expect(table.firstSection()).toBe(tbody);

    table.attach(thead);
    return expect(table.firstSection()).toBe(thead);
}));


describe('`ContentEdit.Table.lastSection()`', () => it(`should return the last section in the table (their position as children \
is irrelevant, the order is thead, tbody, tfoot in that order \
`, function() {
    const table = new ContentEdit.Table();
    const thead = new ContentEdit.TableSection('thead');
    const tbody = new ContentEdit.TableSection('tbody');
    const tfoot = new ContentEdit.TableSection('tfoot');

    // Return null if there are no sections
    expect(table.lastSection()).toBe(null);

    // Expect the order (thead, tbody, tfoot) to be honored no matter the
    // position as a child of the table.
    table.attach(thead);
    expect(table.lastSection()).toBe(thead);

    table.attach(tbody);
    expect(table.lastSection()).toBe(tbody);

    table.attach(tfoot);
    return expect(table.lastSection()).toBe(tfoot);
}));


describe('`ContentEdit.Table.thead()`', () => it(`should return the \`TableSection\` (thead) for the \`Table\` if there is \
one`, function() {

    const table = new ContentEdit.Table();
    expect(table.thead()).toBe(null);

    const tableHead = new ContentEdit.TableSection('thead');
    table.attach(tableHead);
    return expect(table.thead()).toBe(tableHead);
}));


describe('`ContentEdit.Table.tbody()`', () => it(`should return the \`TableSection\` (tbody) for the \`Table\` if there is \
one`, function() {

    const table = new ContentEdit.Table();
    expect(table.tbody()).toBe(null);

    const tableBody = new ContentEdit.TableSection('tbody');
    table.attach(tableBody);
    return expect(table.tbody()).toBe(tableBody);
}));


describe('`ContentEdit.Table.tfoot()`', () => it(`should return the \`TableSection\` (tfoot) for the \`Table\` if there is \
one`, function() {

    const table = new ContentEdit.Table();
    expect(table.tfoot()).toBe(null);

    const tableFoot = new ContentEdit.TableSection('tfoot');
    table.attach(tableFoot);
    return expect(table.tfoot()).toBe(tableFoot);
}));


describe('`ContentEdit.Table.fromDOMElement()`', () => it('should convert a <table> DOM element into a table element', function() {

    const I = ContentEdit.INDENT;

    // Strict rows
    let domTable = document.createElement('table');
    domTable.innerHTML = `\
<tbody>
<tr>
    <td>bar</td>
    <td>zee</td>
</tr>
</tbody>\
`;

    let table = ContentEdit.Table.fromDOMElement(domTable);
    expect(table.html()).toBe(`\
<table>
${ I }<tbody>
${ I }${ I }<tr>
${ I }${ I }${ I }<td>
${ I }${ I }${ I }${ I }bar
${ I }${ I }${ I }</td>
${ I }${ I }${ I }<td>
${ I }${ I }${ I }${ I }zee
${ I }${ I }${ I }</td>
${ I }${ I }</tr>
${ I }</tbody>
</table>\
`
    );

    // Lazy rows
    domTable = document.createElement('table');
    domTable.innerHTML = `\
<tr>
<td>bar</td>
<td>zee</td>
</tr>\
`;

    table = ContentEdit.Table.fromDOMElement(domTable);
    return expect(table.html()).toBe(`\
<table>
${ I }<tbody>
${ I }${ I }<tr>
${ I }${ I }${ I }<td>
${ I }${ I }${ I }${ I }bar
${ I }${ I }${ I }</td>
${ I }${ I }${ I }<td>
${ I }${ I }${ I }${ I }zee
${ I }${ I }${ I }</td>
${ I }${ I }</tr>
${ I }</tbody>
</table>\
`
    );
}));


// Droppers

describe('`ContentEdit.Table` drop interactions`', function() {

    let table = null;
    let region = null;

    beforeEach(function() {
        region = new ContentEdit.Region(document.createElement('div'));
        table = new ContentEdit.Table();
        return region.attach(table);
    });

    it('should support dropping on Image', function() {
        const image = new ContentEdit.Image({'src': '/bar.jpg'});
        region.attach(image);

        // Check the initial order
        expect(table.nextSibling()).toBe(image);

        // Check the order after dropping the element below
        table.drop(image, ['below', 'center']);
        expect(image.nextSibling()).toBe(table);

        // Check the order after dropping the element above
        table.drop(image, ['above', 'center']);
        return expect(table.nextSibling()).toBe(image);
    });

    it('should support being dropped on by Image', function() {
        const image = new ContentEdit.Image({'src': '/bar.jpg'});
        region.attach(image, 0);

        // Check the initial order
        expect(image.nextSibling()).toBe(table);

        // Check the order and class above dropping the element left
        image.drop(table, ['above', 'left']);
        expect(image.hasCSSClass('align-left')).toBe(true);
        expect(image.nextSibling()).toBe(table);

        // Check the order and class above dropping the element right
        image.drop(table, ['above', 'right']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(true);
        expect(image.nextSibling()).toBe(table);

        // Check the order after dropping the element below
        image.drop(table, ['below', 'center']);
        expect(image.hasCSSClass('align-left')).toBe(false);
        expect(image.hasCSSClass('align-right')).toBe(false);
        expect(table.nextSibling()).toBe(image);

        // Check the order after dropping the element above
        image.drop(table, ['above', 'center']);
        return expect(image.nextSibling()).toBe(table);
    });

    it('should support dropping on List', function() {
        const list = new ContentEdit.Image({'src': '/bar.jpg'});
        region.attach(list);

        // Check the initial order
        expect(table.nextSibling()).toBe(list);

        // Check the order after dropping the element below
        table.drop(list, ['below', 'center']);
        expect(list.nextSibling()).toBe(table);

        // Check the order after dropping the element above
        table.drop(list, ['above', 'center']);
        return expect(table.nextSibling()).toBe(list);
    });

    it('should support being dropped on by List', function() {
        const list = new ContentEdit.Text('p');
        region.attach(list, 0);

        // Check the initial order
        expect(list.nextSibling()).toBe(table);

        // Check the order after dropping the element below
        list.drop(table, ['below', 'center']);
        expect(table.nextSibling()).toBe(list);

        // Check the order after dropping the element above
        list.drop(table, ['above', 'center']);
        return expect(list.nextSibling()).toBe(table);
    });

    it('should support dropping on PreText', function() {
        const preText = new ContentEdit.PreText('pre', {}, '');
        region.attach(preText);

        // Check the initial order
        expect(table.nextSibling()).toBe(preText);

        // Check the order after dropping the element below
        table.drop(preText, ['below', 'center']);
        expect(preText.nextSibling()).toBe(table);

        // Check the order after dropping the element above
        table.drop(preText, ['above', 'center']);
        return expect(table.nextSibling()).toBe(preText);
    });

    it('should support being dropped on by PreText', function() {
        const preText = new ContentEdit.PreText('pre', {}, '');
        region.attach(preText, 0);

        // Check the initial order
        expect(preText.nextSibling()).toBe(table);

        // Check the order after dropping the element below
        preText.drop(table, ['below', 'center']);
        expect(table.nextSibling()).toBe(preText);

        // Check the order after dropping the element above
        preText.drop(table, ['above', 'center']);
        return expect(preText.nextSibling()).toBe(table);
    });

    it('should support dropping on Static', function() {
        const staticElm = ContentEdit.Static.fromDOMElement(
            document.createElement('div')
            );
        region.attach(staticElm);

        // Check the initial order
        expect(table.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element below
        table.drop(staticElm, ['below', 'center']);
        expect(staticElm.nextSibling()).toBe(table);

        // Check the order after dropping the element above
        table.drop(staticElm, ['above', 'center']);
        return expect(table.nextSibling()).toBe(staticElm);
    });

    it('should support being dropped on by `moveable` Static', function() {
        const staticElm = new ContentEdit.Static('div', {'data-ce-moveable': 'data-ce-moveable'}, 'foo');
        region.attach(staticElm, 0);

        // Check the initial order
        expect(staticElm.nextSibling()).toBe(table);

        // Check the order after dropping the element below
        staticElm.drop(table, ['below', 'center']);
        expect(table.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element above
        staticElm.drop(table, ['above', 'center']);
        return expect(staticElm.nextSibling()).toBe(table);
    });

    it('should support dropping on Table', function() {
        const otherTable = new ContentEdit.Table();
        region.attach(otherTable);

        // Check the initial order
        expect(table.nextSibling()).toBe(otherTable);

        // Check the order after dropping the element below
        table.drop(otherTable, ['below', 'center']);
        expect(otherTable.nextSibling()).toBe(table);

        // Check the order after dropping the element above
        table.drop(otherTable, ['above', 'center']);
        return expect(table.nextSibling()).toBe(otherTable);
    });

    it('should support dropping on Text', function() {
        const text = new ContentEdit.Text('p');
        region.attach(text);

        // Check the initial order
        expect(table.nextSibling()).toBe(text);

        // Check the order after dropping the element below
        table.drop(text, ['below', 'center']);
        expect(text.nextSibling()).toBe(table);

        // Check the order after dropping the element above
        table.drop(text, ['above', 'center']);
        return expect(table.nextSibling()).toBe(text);
    });

    it('should support being dropped on by Text', function() {
        const text = new ContentEdit.Text('p');
        region.attach(text, 0);

        // Check the initial order
        expect(text.nextSibling()).toBe(table);

        // Check the order after dropping the element below
        text.drop(table, ['below', 'center']);
        expect(table.nextSibling()).toBe(text);

        // Check the order after dropping the element above
        text.drop(table, ['above', 'center']);
        return expect(text.nextSibling()).toBe(table);
    });

    it('should support dropping on Video', function() {
        const video = new ContentEdit.Video('iframe', {'src': '/foo.jpg'});
        region.attach(video);

        // Check the initial order
        expect(table.nextSibling()).toBe(video);

        // Check the order after dropping the element below
        table.drop(video, ['below', 'center']);
        expect(video.nextSibling()).toBe(table);

        // Check the order after dropping the element above
        table.drop(video, ['above', 'center']);
        return expect(table.nextSibling()).toBe(video);
    });

    return it('should support being dropped on by Video', function() {
        const video = new ContentEdit.Video('iframe', {'src': '/foo.jpg'});
        region.attach(video, 0);

        // Check the initial order
        expect(video.nextSibling()).toBe(table);

        // Check the order and class above dropping the element left
        video.drop(table, ['above', 'left']);
        expect(video.hasCSSClass('align-left')).toBe(true);
        expect(video.nextSibling()).toBe(table);

        // Check the order and class above dropping the element right
        video.drop(table, ['above', 'right']);
        expect(video.hasCSSClass('align-left')).toBe(false);
        expect(video.hasCSSClass('align-right')).toBe(true);
        expect(video.nextSibling()).toBe(table);

        // Check the order after dropping the element below
        video.drop(table, ['below', 'center']);
        expect(video.hasCSSClass('align-left')).toBe(false);
        expect(video.hasCSSClass('align-right')).toBe(false);
        expect(table.nextSibling()).toBe(video);

        // Check the order after dropping the element above
        video.drop(table, ['above', 'center']);
        return expect(video.nextSibling()).toBe(table);
    });
});


// TableSection

describe('`ContentEdit.TableSection()`', () => it('should return an instance of TableSection`', function() {
    const tableSection = new ContentEdit.TableSection('tbody', {});
    return expect(tableSection instanceof ContentEdit.TableSection).toBe(true);
}));


describe('`ContentEdit.TableSection.cssTypeName()`', () => it('should return \'table-section\'', function() {
    const tableSection = new ContentEdit.TableSection('tbody', {});
    return expect(tableSection.cssTypeName()).toBe('table-section');
}));


describe('`ContentEdit.TableSection.type()`', () => it('should return \'TableSection\'', function() {
    const tableSection = new ContentEdit.TableSection('tbody', {});
    return expect(tableSection.type()).toBe('TableSection');
}));


describe('`ContentEdit.TableSection.fromDOMElement()`', () => it(`should convert a <tbody>, <tfoot> or <thead> DOM element into a table \
section element`, function() {

    const I = ContentEdit.INDENT;

    return (() => {
        const result = [];
        for (var sectionName of ['tbody', 'tfoot', 'thead']) {
            var domTableSection = document.createElement(sectionName);
            domTableSection.innerHTML = `\
<tr>
    <td>foo</td>
    <td>bar</td>
</tr>\
`;

            var tableSection = ContentEdit.TableSection.fromDOMElement(
                domTableSection
                );
            result.push(expect(tableSection.html()).toBe(`\
<${ sectionName }>
${ I }<tr>
${ I }${ I }<td>
${ I }${ I }${ I }foo
${ I }${ I }</td>
${ I }${ I }<td>
${ I }${ I }${ I }bar
${ I }${ I }</td>
${ I }</tr>
</${ sectionName }>\
`
            ));
        }
        return result;
    })();
}));


// TableRow

describe('`ContentEdit.TableRow()`', () => it('should return an instance of TableRow`', function() {
    const tableRow = new ContentEdit.TableRow();
    return expect(tableRow instanceof ContentEdit.TableRow).toBe(true);
}));


describe('`ContentEdit.TableRow.cssTypeName()`', () => it('should return \'table-row\'', function() {
    const tableRow = new ContentEdit.TableRow();
    return expect(tableRow.cssTypeName()).toBe('table-row');
}));


describe('`ContentEdit.TableRow.isEmpty()`', function() {

    it('should return true if the table row is empty', function() {

        // tr
        const domTableRow = document.createElement('tr');
        domTableRow.innerHTML = '<td></td><td></td>';
        const tableRow = ContentEdit.TableRow.fromDOMElement(domTableRow);

        return expect(tableRow.isEmpty()).toBe(true);
    });

    return it('should return true false the table contains content', function() {

        // tr
        const domTableRow = document.createElement('tr');
        domTableRow.innerHTML = '<td>foo</td><td></td>';
        const tableRow = ContentEdit.TableRow.fromDOMElement(domTableRow);

        return expect(tableRow.isEmpty()).toBe(false);
    });
});


describe('`ContentEdit.TableRow.type()`', () => it('should return \'TableRow\'', function() {
    const tableRow = new ContentEdit.TableRow();
    return expect(tableRow.type()).toBe('TableRow');
}));


describe('`ContentEdit.TableRow.typeName()`', () => it('should return \'Table row\'', function() {
    const tableRow = new ContentEdit.TableRow();
    return expect(tableRow.typeName()).toBe('Table row');
}));


describe('`ContentEdit.TableRow.fromDOMElement()`', () => it('should convert a <tr> DOM element into a table row element', function() {

    const I = ContentEdit.INDENT;

    // tr
    const domTableRow = document.createElement('tr');
    domTableRow.innerHTML = `\
<td>foo</td>
<td>bar</td>\
`;

    const tableRow = ContentEdit.TableRow.fromDOMElement(domTableRow);
    return expect(tableRow.html()).toBe(`\
<tr>
${ I }<td>
${ I }${ I }foo
${ I }</td>
${ I }<td>
${ I }${ I }bar
${ I }</td>
</tr>\
`
    );
}));

describe('`ContentEdit.TableRow` key events`', function() {

    const ev = {preventDefault() {  }};
    let emptyTableRow = null;
    let region = null;
    const root = ContentEdit.Root.get();
    let tableRow = null;

    beforeEach(function() {
        const domElement = document.createElement('div');
        document.body.appendChild(domElement);
        region = new ContentEdit.Region(domElement);

        const domTable = document.createElement('table');
        domTable.innerHTML = `<tbody>
<tr><td></td><td>foo</td></tr>
<tr><td></td><td></td></tr>
</tbody>`;
        const table = ContentEdit.Table.fromDOMElement(domTable);
        tableRow = table.children[0].children[0];
        emptyTableRow = table.children[0].children[1];
        return region.attach(table);
    });

    afterEach(function() {
        for (var child of region.children.slice()) {
            region.detach(child);
        }
        return document.body.removeChild(region.domElement());
    });

    it('should support delete removing empty rows', function() {
        // Remove empty rows
        let text = emptyTableRow.children[1].tableCellText();
        text.focus();
        text._keyDelete(ev);

        expect(emptyTableRow.parent()).toBe(null);

        // Retain populated rows
        const parent = tableRow.parent();
        text = tableRow.children[1].tableCellText();
        text.focus();
        text._keyDelete(ev);

        return expect(parent).toBe(tableRow.parent());
    });

    it('should support backspace in first cell removing empty rows', function() {
        // Remove empty rows
        let text = emptyTableRow.children[0].tableCellText();
        text.focus();
        text._keyBack(ev);

        expect(emptyTableRow.parent()).toBe(null);

        // Retain populated rows
        const parent = tableRow.parent();
        text = tableRow.children[0].tableCellText();
        text.focus();
        text._keyBack(ev);

        return expect(parent).toBe(tableRow.parent());
    });

    return it(`should not allow a row to be deleted with backspace or delete if remove \
behaviour is disallowed`, function() {

        // Disallow the removal of the table row
        emptyTableRow.can('remove', false);

        // Attempt to delete using the backspace key
        const text = emptyTableRow.children[0].tableCellText();
        text.focus();
        text._keyBack(ev);

        return expect(emptyTableRow.parent()).not.toBe(null);
    });
});


// Droppers

describe('`ContentEdit.TableRow` drop interactions`', function() {

    let region = null;
    let table = null;

    beforeEach(function() {
        region = new ContentEdit.Region(document.createElement('div'));
        const domTable = document.createElement('table');
        domTable.innerHTML = `\
<tbody>
    <tr>
        <td>foo</td>
    </tr>
    <tr>
        <td>bar</td>
    </tr>
    <tr>
        <td>zee</td>
    </tr>
    <tr>
        <td>umm</td>
    </tr>
</tbody>\
`;
        table = ContentEdit.Table.fromDOMElement(domTable);
        return region.attach(table);
    });

    return it('should support dropping on TableRow', function() {
        const tableRowA = table.tbody().children[1];
        const tableRowB = table.tbody().children[2];

        // Check the initial order
        expect(tableRowA.nextSibling()).toBe(tableRowB);

        // Check the order after dropping the element after
        tableRowA.drop(tableRowB, ['below', 'center']);
        expect(tableRowB.nextSibling()).toBe(tableRowA);

        // Check the order after dropping the element before
        tableRowA.drop(tableRowB, ['above', 'center']);
        return expect(tableRowA.nextSibling()).toBe(tableRowB);
    });
});


// TableCell

describe('`ContentEdit.TableCell()`', () => it('should return an instance of `TableCell`', function() {
    const tableCell = new ContentEdit.TableCell('td', {});
    return expect(tableCell instanceof ContentEdit.TableCell).toBe(true);
}));


describe('`ContentEdit.TableCell.cssTypeName()`', () => it('should return \'table-cell\'', function() {
    const tableCell = new ContentEdit.TableCell('td', {});
    return expect(tableCell.cssTypeName()).toBe('table-cell');
}));


describe('`ContentEdit.TableCell.tableCellText()`', () => it(`should return any associated TableCellText element, or null if there \
isn\'t one`, function() {

    // Build a table cell with a child text node
    const tableCell = new ContentEdit.TableCell('td');
    expect(tableCell.tableCellText()).toBe(null);

    const tableCellText = new ContentEdit.TableCellText('foo');
    tableCell.attach(tableCellText);
    return expect(tableCell.tableCellText()).toBe(tableCellText);
}));


describe('`ContentEdit.TableCell.type()`', () => it('should return \'table-cell\'', function() {
    const tableCell = new ContentEdit.TableCell('td', {});
    return expect(tableCell.type()).toBe('TableCell');
}));


describe('`ContentEdit.TableCell.html()`', () => it('should return a HTML string for the table cell element', function() {
    const tableCell = new ContentEdit.TableCell('td', {'class': 'foo'});
    const tableCellText = new ContentEdit.TableCellText('bar');
    tableCell.attach(tableCellText);

    return expect(tableCell.html()).toBe('<td class="foo">\n' +
            `${ ContentEdit.INDENT }bar\n` +
        '</td>'
    );
}));


describe('`ContentEdit.TableCell.fromDOMElement()`', () => it(`should convert a <td> or <th> DOM element into a table cell \
element`, function() {

    const I = ContentEdit.INDENT;

    // td
    let domTableCell= document.createElement('td');
    domTableCell.innerHTML = 'foo';

    let tableCell = ContentEdit.TableCell.fromDOMElement(domTableCell);
    expect(tableCell.html()).toBe(`\
<td>
${ I }foo
</td>\
`
    );

    // th
    domTableCell= document.createElement('th');
    domTableCell.innerHTML = 'bar';

    tableCell = ContentEdit.TableCell.fromDOMElement(domTableCell);
    return expect(tableCell.html()).toBe(`\
<th>
${ I }bar
</th>\
`
    );
}));


// TableCellText

describe('`ContentEdit.TableCellText()`', () => it('should return an instance of TableCellText', function() {
    const tableCellText = new ContentEdit.TableCellText('foo');
    return expect(tableCellText instanceof ContentEdit.TableCellText).toBe(true);
}));


describe('`ContentEdit.TableCellText.cssTypeName()`', () => it('should return \'table-cell-text\'', function() {
    const tableCellText = new ContentEdit.TableCellText('foo');
    return expect(tableCellText.cssTypeName()).toBe('table-cell-text');
}));


describe('`ContentEdit.TableCellText.type()`', () => it('should return \'TableCellText\'', function() {
    const tableCellText = new ContentEdit.TableCellText('foo');
    return expect(tableCellText.type()).toBe('TableCellText');
}));


describe('ContentEdit.TableCellText.blur()', function() {

    const root = ContentEdit.Root.get();
    let region = null;
    let table = null;
    let tableCell = null;
    let tableCellText = null;

    beforeEach(function() {
        // Mount a table element to a region
        const domTable = document.createElement('table');
        domTable.innerHTML = `\
<tbody>
    <tr>
        <td>bar</td>
        <td>zee</td>
    </tr>
</tbody>\
`;

        table = ContentEdit.Table.fromDOMElement(domTable);
        region = new ContentEdit.Region(document.getElementById('test'));
        region.attach(table);
        tableCell = table.tbody().children[0].children[0];
        tableCellText = tableCell.tableCellText();
        return tableCellText.focus();
    });

    afterEach(() => region.detach(table));

    it('should blur the text element', function() {
        tableCellText.blur();
        return expect(tableCellText.isFocused()).toBe(false);
    });

    it(`should not remove the table cell text element if it\'s just \
whitespace`, function() {

        const parent = tableCellText.parent();
        tableCellText.content = new HTMLString.String('');
        tableCellText.blur();
        return expect(tableCellText.parent()).toBe(parent);
    });

    return it('should trigger the `blur` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the blur event
        root.bind('blur', foo.handleFoo);

        // Detach the node
        tableCellText.blur();
        return expect(foo.handleFoo).toHaveBeenCalledWith(tableCellText);
    });
});


describe('ContentEdit.TableCellText.html()', () => it('should return a HTML string for the table cell text element', function() {
    const tableCellText = new ContentEdit.TableCellText('bar <b>zee</b>');
    return expect(tableCellText.html()).toBe('bar <b>zee</b>');
}));


// Key events

describe('`ContentEdit.TableCellText` key events`', function() {

    const {
        INDENT
    } = ContentEdit;
    const ev = {preventDefault() {  }};
    const root = ContentEdit.Root.get();
    let region = null;
    let table = null;
    let tbody = null;

    beforeEach(function() {
        // Mount a text element to a region
        document.getElementById('test').innerHTML = `\
<p>foo</p>
<table>
    <tbody>
        <tr>
            <td>foo</td>
            <td>bar</td>
        </tr>
        <tr>
            <td>zee</td>
            <td>umm</td>
        </tr>
    </tbody>
</table>
<p>bar</p>\
`;

        region = new ContentEdit.Region(document.getElementById('test'));
        table = region.children[1];
        return tbody = table.tbody();
    });

    afterEach(() => region.children.slice().map((child) =>
        region.detach(child)));

    it(`should support down arrow nav to table cell below or next content \
element if we\'re in the last row`, function() {

        // Next cell down
        const tableCellText = tbody.children[0].children[0].tableCellText();
        tableCellText.focus();
        new ContentSelect.Range(3, 3).select(tableCellText.domElement());
        tableCellText._keyDown(ev);

        const otherTableCellText = tbody.children[1].children[0].tableCellText();
        expect(root.focused()).toBe(otherTableCellText);

        // Next content element
        new ContentSelect.Range(3, 3).select(otherTableCellText.domElement());
        root.focused()._keyDown(ev);
        return expect(root.focused()).toBe(region.children[2]);
    });

    it(`should support up arrow nav to table cell below or previous content \
element if we\'re in the first row`, function() {

        // Previous cell up
        const tableCellText = tbody.children[1].children[0].tableCellText();
        tableCellText.focus();
        new ContentSelect.Range(0, 0).select(tableCellText.domElement());
        tableCellText._keyUp(ev);

        const otherTableCellText = tbody.children[0].children[0].tableCellText();
        expect(root.focused()).toBe(otherTableCellText);

        // Previous content element
        root.focused()._keyUp(ev);
        return expect(root.focused()).toBe(region.children[0]);
    });

    it('should support return nav to next content element', function() {
        const tableCellText = tbody.children[0].children[0].tableCellText();
        tableCellText.focus();
        new ContentSelect.Range(3, 3).select(tableCellText.domElement());
        tableCellText._keyReturn(ev);

        const otherTableCellText = tbody.children[0].children[1].tableCellText();
        return expect(root.focused()).toBe(otherTableCellText);
    });

    it('should support using tab to nav to next table cell', function() {
        const tableCellText = tbody.children[0].children[0].tableCellText();
        tableCellText.focus();
        new ContentSelect.Range(3, 3).select(tableCellText.domElement());
        tableCellText._keyTab(ev);

        const otherTableCellText = tbody.children[0].children[1].tableCellText();
        return expect(root.focused()).toBe(otherTableCellText);
    });

    it(`should support tab creating a new body row if last table cell in last \
row of the table body focused`, function() {

        const rows = tbody.children.length;
        const tableCellText = tbody.children[1].children[1].tableCellText();
        tableCellText.focus();
        new ContentSelect.Range(3, 3).select(tableCellText.domElement());
        tableCellText._keyTab(ev);

        expect(tbody.children.length).toBe(rows + 1);
        const otherTableCellText = tbody.children[rows].children[0].tableCellText();
        return expect(root.focused()).toBe(otherTableCellText);
    });

    it('should support using shift-tab to nav to previous table cell', function() {
        const tableCellText = tbody.children[1].children[0].tableCellText();
        tableCellText.focus();
        new ContentSelect.Range(3, 3).select(tableCellText.domElement());

        ev.shiftKey = true;
        tableCellText._keyTab(ev);

        const otherTableCellText = tbody.children[0].children[1].tableCellText();
        return expect(root.focused()).toBe(otherTableCellText);
    });

    return it('should not create an new body row on tab if spawn is disallowed', function() {

        const rows = tbody.children.length;
        const tableCell = tbody.children[1].children[1];

        // Disallow spawning of new rows
        tableCell.can('spawn', false);

        const tableCellText = tableCell.tableCellText();
        tableCellText.focus();
        new ContentSelect.Range(3, 3).select(tableCellText.domElement());
        tableCellText._keyTab(ev);

        return expect(tbody.children.length).toBe(rows);
    });
});