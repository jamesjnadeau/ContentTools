import ContentEdit from '../../../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from '../../namespace.js';
import {rootContext} from '../../../core/root-context.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.TableDialog = class TableDialog extends ContentTools.DialogUI {
    declare _domApply: any;
    declare _domBodyInput: any;
    declare _domBodySection: any;
    declare _domFootSection: any;
    declare _domFootSwitch: any;
    declare _domHeadSection: any;
    declare _domHeadSwitch: any;
    declare table: any;


    // A dialog to support inserting/update a table

    constructor(table) {
        /* The caption is picked from the PARAMETER, not from `this.table`.
           The CoffeeScript read the field because its compiled output
           assigned it first and then branched between two `super` calls;
           an ES constructor can do neither -- it cannot touch `this` before
           super(), and calling super() twice is a ReferenceError.

           decaffeinate produced exactly that: super('Update table') hoisted
           to the top and super('Insert table') left in the else branch. The
           update path happened to work, so the tool could still edit a
           table the caret was already inside, and inserting a new one threw
           "Super constructor may only be called once" before the dialog
           existed. `src/spec/ui/dialogs/table.coffee` was 0 bytes upstream,
           which is why nothing caught it. */
        super(table ? 'Update table' : 'Insert table');

        this.table = table;
    }

    // Methods

    mount() {
        // Mount the widget
        super.mount();

        // Build the initial configuration of the dialog
        let cfg = {columns: 3, foot: false, head: true};
        if (this.table) {
            cfg = {
                columns: this.table.firstSection().children[0].children.length,
                foot: this.table.tfoot(),
                head: this.table.thead()
                };
        }

        /* A GFM table REQUIRES a header row and has no footer at all, so
           under a profile that says so the two switches are not offered and
           the configuration is forced. The sections are still built, because
           `save()` reads their classes to report the configuration back --
           they are simply never appended to the view. */
        const sections = this._profile().tableSections;
        if (!sections) {
            cfg.head = true;
            cfg.foot = false;
        }

        // Update dialog class
        ContentEdit.addCSSClass(this._domElement, 'ct-table-dialog');

        // Update view class
        ContentEdit.addCSSClass(this._domView, 'ct-table-dialog__view');

        // Add sections

        // Head
        const headCSSClasses = ['ct-section'];
        if (cfg.head) {
            headCSSClasses.push('ct-section--applied');
        }
        this._domHeadSection = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(headCSSClasses);
        if (sections) {
            this._domView.appendChild(this._domHeadSection);
        }

        const domHeadLabel = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-section__label']);
        domHeadLabel.textContent = ContentEdit._('Table head');
        this._domHeadSection.appendChild(domHeadLabel);

        this._domHeadSwitch = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-section__switch']);
        this._domHeadSection.appendChild(this._domHeadSwitch);

        // Body
        this._domBodySection = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv([
            'ct-section',
            'ct-section--applied',
            'ct-section--contains-input'
            ]);
        this._domView.appendChild(this._domBodySection);

        const domBodyLabel = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-section__label']);
        domBodyLabel.textContent = ContentEdit._('Table body (columns)');
        this._domBodySection.appendChild(domBodyLabel);

        this._domBodyInput = rootContext().createElement('input');
        this._domBodyInput.setAttribute('class', 'ct-section__input');
        this._domBodyInput.setAttribute('maxlength', '2');
        this._domBodyInput.setAttribute('name', 'columns');
        this._domBodyInput.setAttribute('type', 'text');
        this._domBodyInput.setAttribute('value', cfg.columns);
        this._domBodySection.appendChild(this._domBodyInput);

        // Foot
        const footCSSClasses = ['ct-section'];
        if (cfg.foot) {
            footCSSClasses.push('ct-section--applied');
        }
        this._domFootSection = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(footCSSClasses);
        if (sections) {
            this._domView.appendChild(this._domFootSection);
        }

        const domFootLabel = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-section__label']);
        domFootLabel.textContent = ContentEdit._('Table foot');
        this._domFootSection.appendChild(domFootLabel);

        this._domFootSwitch = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(['ct-section__switch']);
        this._domFootSection.appendChild(this._domFootSwitch);

        // Add controls
        const domControlGroup = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv(
            ['ct-control-group', 'ct-control-group--right']);
        this._domControls.appendChild(domControlGroup);

        // Apply button
        this._domApply = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv([
            'ct-control',
            'ct-control--text',
            'ct-control--apply'
            ]);
        this._domApply.textContent = 'Apply';
        domControlGroup.appendChild(this._domApply);

        // Add interaction handlers
        return this._addDOMEventListeners();
    }

    save() {
        // Save the table. The event trigged by saving the table includes a
        // dictionary with the table configuration in:
        //
        // `body` Number of columns.
        // `foot` True if a table foot section should be present.
        // `head` True if a table head section should be present.

        // Build a dictionary of the table configuration
        const footCSSClass = this._domFootSection.getAttribute('class');
        const headCSSClass = this._domHeadSection.getAttribute('class');

        const detail = {
            columns: parseInt(this._domBodyInput.value),
            foot: footCSSClass.indexOf('ct-section--applied') > -1,
            head: headCSSClass.indexOf('ct-section--applied') > -1
            };

        return this.dispatchEvent(this.createEvent('save', detail));
    }

    unmount() {
        // Unmount the component from the DOM
        super.unmount();

        this._domBodyInput = null;
        this._domBodySection = null;
        this._domApply = null;
        this._domHeadSection = null;
        this._domHeadSwitch = null;
        this._domFootSection = null;
        return this._domFootSwitch = null;
    }

    // Private methods

    _addDOMEventListeners() {
        // Add event listeners for the widget
        super._addDOMEventListeners();

        // Add support for the head and foot switches
        const toggleSection = function(ev) {
            ev.preventDefault();

            // Toggle applied class
            if (this.getAttribute('class').indexOf('ct-section--applied') > -1) {
                return ContentEdit.removeCSSClass(this, 'ct-section--applied');
            } else {
                return ContentEdit.addCSSClass(this, 'ct-section--applied');
            }
        };

        if (this._profile().tableSections) {
            this._domHeadSection.addEventListener('click', toggleSection);
            this._domFootSection.addEventListener('click', toggleSection);
        }

        // Focus on the columns input if the section is clicked
        this._domBodySection.addEventListener('click', ev => {
            return this._domBodyInput.focus();
        });

        // Check the value body input (number of columns) and enable/disable the
        // 'Apply' button depending on whether or not the value is a valid
        // integer between 1 and 999.
        this._domBodyInput.addEventListener('input', ev => {
            const valid = /^[1-9]\d{0,1}$/.test(ev.target.value);
            if (valid) {
                ContentEdit.removeCSSClass(
                    this._domBodyInput,
                    'ct-section__input--invalid'
                    );
                return ContentEdit.removeCSSClass(
                    this._domApply,
                    'ct-control--muted'
                    );
            } else {
                ContentEdit.addCSSClass(
                    this._domBodyInput,
                    'ct-section__input--invalid'
                    );
                return ContentEdit.addCSSClass(
                    this._domApply,
                    'ct-control--muted'
                    );
            }
        });

        // Apply button
        return this._domApply.addEventListener('click', ev => {
            ev.preventDefault();

            // Check the button isn't muted, if it is then the table
            // configuration isn't valid.
            const cssClass = this._domApply.getAttribute('class');
            if (cssClass.indexOf('ct-control--muted') === -1) {
                return this.save();
            }
        });
    }
};
