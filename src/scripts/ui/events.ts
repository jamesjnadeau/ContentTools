import ContentTools from '../namespace.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.Event = class Event {
    declare _defaultPrevented: any;
    declare _detail: any;
    declare _name: any;
    declare _propagationStopped: any;
    declare _timeStamp: any;


    // The `Event` class provides information about events dispatched by
    // `UIComponents`.

    constructor(name, detail) {

        // The name of the event
        this._name = name;

        // Detail of the event (typically an object but can actually be set to
        // any value).
        this._detail = detail;

        // The date/time the event was created
        this._timeStamp = Date.now();

        // A flag indicating if the event has been cancelled
        this._defaultPrevented = false;

        // A flag indicating if the execution of additional callbacks for the
        // event has been halted.
        this._propagationStopped = false;
    }

    // Read-only properties

    defaultPrevented() {
        // Return true if the event has been cancelled
        return this._defaultPrevented;
    }

    detail() {
        // Return the detail of the event
        return this._detail;
    }

    name() {
        // Return the name of the event
        return  this._name;
    }

    propagationStopped() {
        // Return true if the event has been halted
        return this._propagationStopped;
    }

    timeStamp() {
        // Return a time stamp of when the event was created
        return this._timeStamp;
    }

    // Methods

    preventDefault() {
        // Cancel the event preventing the default event action
        return this._defaultPrevented = true;
    }

    stopImmediatePropagation() {
        // Halt the event preventing any bound listener functions that have not
        // yet been called for the event being called.
        return this._propagationStopped = true;
    }
};
