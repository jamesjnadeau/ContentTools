/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.IgnitionUI = class IgnitionUI extends ContentTools.WidgetUI {

    // To control editing of content (starting/stopping) a ignition switch is
    // provided, the switch has 3 states:
    //
    // - ready    - Displays an edit option
    // - editing  - Displays confirm and cancel options
    // - busy     - Displays a busy status animation

    constructor() {
        super();

        // The state to return to once when the component state reverts from a
        // a busy state.
        this._revertToState = 'ready';

        // The state of the switch
        this._state = 'ready';
    }

    // Methods

    busy(busy) {
        // Set the widget to busy (or revert if from a busy state to its previous
        // state.
        if (this.dispatchEvent(this.createEvent('busy', {busy}))) {

            // If the widget is already busy do nothing
            if (busy === (this._state === 'busy')) {
                return;
            }

            if (busy) {
                this._revertToState = this._state;
                return this.state('busy');
            } else {
                return this.state(this._revertToState);
            }
        }
    }

    cancel() {
        // Dispatch the cancel event against the switch and set its state to
        // ready.
        if (this.dispatchEvent(this.createEvent('cancel'))) {
            return this.state('ready');
        }
    }

    confirm() {
        // Dispatch the confirm event against the switch set its state to
        // ready.
        if (this.dispatchEvent(this.createEvent('confirm'))) {
            return this.state('ready');
        }
    }

    edit() {
        // Dispatch the edit event against the switch and set its state to
        // editing.
        if (this.dispatchEvent(this.createEvent('edit'))) {
            return this.state('editing');
        }
    }

    mount() {
        // Mount the component to the DOM
        super.mount();

        // Base widget component
        this._domElement = this.constructor.createDiv([
            'ct-widget',
            'ct-ignition',
            'ct-ignition--ready'
            ]);
        this.parent().domElement().appendChild(this._domElement);

        // Edit button
        this._domEdit = this.constructor.createDiv([
            'ct-ignition__button',
            'ct-ignition__button--edit'
            ]);
        this._domElement.appendChild(this._domEdit);

        // Confirm button
        this._domConfirm = this.constructor.createDiv([
            'ct-ignition__button',
            'ct-ignition__button--confirm'
            ]);
        this._domElement.appendChild(this._domConfirm);

        // Cancel button
        this._domCancel = this.constructor.createDiv([
            'ct-ignition__button',
            'ct-ignition__button--cancel'
            ]);
        this._domElement.appendChild(this._domCancel);

        // Busy
        this._domBusy = this.constructor.createDiv([
            'ct-ignition__button',
            'ct-ignition__button--busy'
            ]);
        this._domElement.appendChild(this._domBusy);

        // Add events
        return this._addDOMEventListeners();
    }

    state(state) {
        // Get/Set the state of the ignition switch. State must be one of the
        // following values:
        //
        // - busy
        // - editing
        // - ready
        //

        if (state === undefined) {
            return this._state;
        }

        // If the state hasn't changed do nothing
        if (this._state === state) {
            return;
        }

        if (!this.dispatchEvent(this.createEvent('statechange', {state}))) {
            return;
        }

        // Modify the state of the switch
        this._state = state;

        // Remove existing state modifier classes
        this.removeCSSClass('ct-ignition--busy');
        this.removeCSSClass('ct-ignition--editing');
        this.removeCSSClass('ct-ignition--ready');

        // Apply the new state modifier class
        if (this._state === 'busy') {
            return this.addCSSClass('ct-ignition--busy');

        } else if (this._state === 'editing') {
            return this.addCSSClass('ct-ignition--editing');

        } else if (this._state === 'ready') {
            return this.addCSSClass('ct-ignition--ready');
        }
    }

    unmount() {
        // Unmount the widget from the DOM
        super.unmount();

        this._domEdit = null;
        this._domConfirm = null;
        return this._domCancel = null;
    }

    // Private methods

    _addDOMEventListeners() {
        // Add all DOM event bindings for the component in this method

        // Start editing
        this._domEdit.addEventListener('click', ev => {
            ev.preventDefault();
            return this.edit();
        });

        // Stop editing - Confirm changes
        this._domConfirm.addEventListener('click', ev => {
            ev.preventDefault();
            return this.confirm();
        });

        // Stop editing - Cancel changes
        return this._domCancel.addEventListener('click', ev => {
            ev.preventDefault();
            return this.cancel();
        });
    }
};