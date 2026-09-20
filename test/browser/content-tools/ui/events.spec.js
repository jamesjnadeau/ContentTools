/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// UI

// Events

describe('ContentTools.Event', function() {

    describe('ContentTools.Event()', () => it('should return an instance of an Event', function() {

        const ev = new ContentTools.Event('test');
        return expect(ev instanceof ContentTools.Event).toBe(true);
    }));


    describe('ContentTools.Event.defaultPrevented()', () => it('should return true if the event is cancelled', function() {

        const ev = new ContentTools.Event('test');
        expect(ev.defaultPrevented()).toBe(false);
        ev.preventDefault();
        return expect(ev.defaultPrevented()).toBe(true);
    }));


    describe('ContentTools.Event.detail()', () => it('should return the detail of the event', function() {

        const ev = new ContentTools.Event('test', {foo: 1});
        return expect(ev.detail()).toEqual({foo: 1});
}));


    describe('ContentTools.Event.name()', () => it('should return the name of the event', function() {

        const ev = new ContentTools.Event('test');
        return expect(ev.name()).toBe('test');
    }));


    describe('ContentTools.Event.propagationStopped()', () => it('should return true if the event has been halted', function() {

        const ev = new ContentTools.Event('test');
        expect(ev.propagationStopped()).toBe(false);
        ev.stopImmediatePropagation();
        return expect(ev.propagationStopped()).toBe(true);
    }));

    describe('ContentTools.Event.propagationStopped()', () => it('should return a timestamp of when the event was created', function() {

        const ev = new ContentTools.Event('test');
        return expect(ev.timeStamp()).toBeCloseTo(Date.now(), 100);
    }));


    describe('ContentTools.Event.preventDefault()', () => it('should cancel an event', function() {

        const ev = new ContentTools.Event('test');
        ev.preventDefault();
        return expect(ev.defaultPrevented()).toBe(true);
    }));


    return describe('ContentTools.Event.preventDefault()', () => it('should halt an event', function() {

        const ev = new ContentTools.Event('test');
        ev.stopImmediatePropagation();
        return expect(ev.propagationStopped()).toBe(true);
    }));
});