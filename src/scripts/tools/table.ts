import ContentEdit from '../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Table = class Table extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Insert/Update a Table.
    
        ContentTools.ToolShelf.stow(this, 'table');
    
        this.label = 'Table';
        this.icon = 'table';
    }

    // Class methods

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.

        if (element.isFixed()) {
            return false;
        }

        return element !== undefined;
    }

    static apply(element, selection, callback) {
        // Dispatch `apply` event
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // If supported allow store the state for restoring once the dialog is
        // cancelled.
        if (element.storeState) {
            element.storeState();
        }

        // Set-up the dialog
        const app = ContentTools.EditorApp.get();

        // Modal
        const modal = new ContentTools.ModalUI();

        // If the element is part of a table find the parent table
        let table = element.closest(node => node && (node.type() === 'Table'));

        // Dialog
        const dialog = new ContentTools.TableDialog(table);

        // Support cancelling the dialog
        dialog.addEventListener('cancel', () => {

            modal.hide();
            dialog.hide();

            if (element.restoreState) {
                element.restoreState();
            }

            return callback(false);
        });

        // Support saving the dialog
        dialog.addEventListener('save', ev => {
            const tableCfg = ev.detail();

            // This flag indicates if we can restore the previous elements focus
            // and state or if we need to change the focus to the first cell in
            // the table.
            let keepFocus = true;

            if (table) {
                // Update the existing table
                this._updateTable(tableCfg, table);

                // Check if the current element is still part of the table after
                // being updated.
                keepFocus = element.closest(node => node && (node.type() === 'Table'));

            } else {
                // Create a new table
                table = this._createTable(tableCfg);

                // Insert it into the document
                const [node, index] = Array.from<any>(this._insertAt(element));
                node.parent().attach(table, index);

                keepFocus = false;
            }

            if (keepFocus) {
                element.restoreState();

            } else {
                // Focus on the first cell in the table e.g:
                //
                // TableSection > TableRow > TableCell > TableCellText
                table.firstSection().children[0].children[0].children[0].focus();
            }

            modal.hide();
            dialog.hide();

            callback(true);

            // Dispatch `applied` event
            return this.dispatchEditorEvent('tool-applied', toolDetail);
        });

        // Show the dialog
        app.attach(modal);
        app.attach(dialog);
        modal.show();
        return dialog.show();
    }

    // Private class methods

    static _adjustColumns(section, columns) {
        // Adjust the number of columns in a table section
        return (() => {
            const result = [];
            for (var row of Array.from<any>(section.children)) {
                var cellTag = row.children[0].tagName();
                var currentColumns = row.children.length;
                var diff = columns - currentColumns;

                if (diff < 0) {
                    // Remove columns
                    result.push((() => {
                        const result1 = [];
                        for (let i = diff, asc = diff <= 0; asc ? i < 0 : i > 0; asc ? i++ : i--) {
                            var cell = row.children[row.children.length - 1];
                            result1.push(row.detach(cell));
                        }
                        return result1;
                    })());

                } else if (diff > 0) {
                    // Add columns
                    result.push((() => {
                        const result2 = [];
                        for (let i = 0, end = diff, asc1 = 0 <= end; asc1 ? i < end : i > end; asc1 ? i++ : i--) {
                            var cell = new ContentEdit.TableCell(cellTag);
                            row.attach(cell);
                            var cellText = new ContentEdit.TableCellText('');
                            result2.push(cell.attach(cellText));
                        }
                        return result2;
                    })());
                } else {
                    result.push(undefined);
                }
            }
            return result;
        })();
    }

    static _createTable(tableCfg) {
        // Create a new table element from the specified configuration
        const table = new ContentEdit.Table();

        // Head
        if (tableCfg.head) {
            const head = this._createTableSection('thead', 'th', tableCfg.columns);
            table.attach(head);
        }

        // Body
        const body = this._createTableSection('tbody', 'td', tableCfg.columns);
        table.attach(body);

        // Foot
        if (tableCfg.foot) {
            const foot = this._createTableSection('tfoot', 'td', tableCfg.columns);
            table.attach(foot);
        }

        return table;
    }

    static _createTableSection(sectionTag, cellTag, columns) {
        // Create a new table section element
        const section = new ContentEdit.TableSection(sectionTag);
        const row = new ContentEdit.TableRow();
        section.attach(row);

        for (let i = 0, end = columns, asc = 0 <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            var cell = new ContentEdit.TableCell(cellTag);
            row.attach(cell);
            var cellText = new ContentEdit.TableCellText('');
            cell.attach(cellText);
        }

        return section;
    }

    static _updateTable(tableCfg, table) {
        // Update an existing table

        // Remove any sections no longer required
        if (!tableCfg.head && table.thead()) {
            table.detach(table.thead());
        }

        if (!tableCfg.foot && table.tfoot()) {
            table.detach(table.tfoot());
        }

        // Increase or decrease the number of columns
        const columns = table.firstSection().children[0].children.length;
        if (tableCfg.columns !== columns) {
            for (var section of Array.from<any>(table.children)) {
                this._adjustColumns(section, tableCfg.columns);
            }
        }

        // Add any new sections
        if (tableCfg.head && !table.thead()) {
            const head = this._createTableSection('thead', 'th', tableCfg.columns);
            table.attach(head, 0);
        }

        if (tableCfg.foot && !table.tfoot()) {
            const foot = this._createTableSection('tfoot', 'td', tableCfg.columns);
            return table.attach(foot);
        }
    }
});
Cls$tools.initClass();
