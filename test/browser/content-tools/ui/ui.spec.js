/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// HACK: Disable getComputedStyle so that transitions/animations are not
// considered for the purpose of testing.
window.getComputedStyle = null;

// HACK: Force the appVersion to be linux for testing.
// navigator.appVersion is getter-only in modern browsers, so the original
// plain assignment now throws; defineProperty preserves the intent.
Object.defineProperty(navigator, 'appVersion', {
    value: 'Linux', configurable: true
});


// UI

// ComponentUI

describe('ContentTools.ComponentUI()', () => it('should return an instance of a ComponentUI', function() {

    const component = new ContentTools.ComponentUI();
    return expect(component instanceof ContentTools.ComponentUI).toBe(true);
}));


describe('ContentTools.ComponentUI.children()', () => it('should return a list of children attached to the component', function() {

    const parent = new ContentTools.ComponentUI();
    const child = new ContentTools.ComponentUI();
    parent.attach(child);

    return expect(parent.children()).toEqual([child]);
}));


describe('ContentTools.ComponentUI.domElement()', () => it('should return a DOM element for the component if it\'s mounted', function() {

    // Components can't mount themselves so we have to fake this by
    // associating a DOM element with the component manually.
    const component = new ContentTools.ComponentUI();
    const domElement = document.createElement('div');
    component._domElement = domElement;

    return expect(component.domElement()).toBe(domElement);
}));


describe('ContentTools.ComponentUI.isMounted()', () => it('should return true if the component is mounted', function() {
    const component = new ContentTools.ComponentUI();

    // Initially the component isn't mounted
    expect(component.isMounted()).toBe(false);

    // Components can't mount themselves so we have to fake this by
    // associating a DOM element with the component manually.
    const domElement = document.createElement('div');
    component._domElement = domElement;

    return expect(component.isMounted()).toBe(true);
}));


describe('ContentTools.ComponentUI.parent()', () => it('should return a the parent the component is attached to', function() {

    const parent = new ContentTools.ComponentUI();
    const child = new ContentTools.ComponentUI();
    parent.attach(child);

    return expect(child.parent()).toBe(parent);
}));


describe('ContentTools.ComponentUI.attach()', () => it('should attach a component as a child of another component', function() {

    // NOTE: Currently this is a duplicate of the test for `children()`.
    const parent = new ContentTools.ComponentUI();
    const child = new ContentTools.ComponentUI();
    parent.attach(child);

    return expect(parent.children()).toEqual([child]);
}));


describe('ContentTools.ComponentUI.addCSSClass()', () => it('should add a CSS class to the component\'s DOM element', function() {

    // Components can't mount themselves so we have to fake this by
    // associating a DOM element with the component manually.
    const component = new ContentTools.ComponentUI();
    const domElement = document.createElement('div');
    component._domElement = domElement;
    component.addCSSClass('foo');

    return expect(domElement.getAttribute('class')).toBe('foo');
}));


describe('ContentTools.ComponentUI.detach()', () => it('should detach a child component', function() {

    const parent = new ContentTools.ComponentUI();
    const child = new ContentTools.ComponentUI();
    parent.attach(child);
    parent.detach(child);

    return expect(parent.children()).toEqual([]);
}));


describe('ContentTools.ComponentUI.mount()', () => it('should do nothing, `mount()` is a placeholder method only', function() {

    const component = new ContentTools.ComponentUI();
    component.mount();

    return expect(component.isMounted()).toBe(false);
}));


describe('ContentTools.ComponentUI.removeCSSClass()', () => it('should remove a CSS class from the component\'s DOM element', function() {

    // Components can't mount themselves so we have to fake this by
    // associating a DOM element with the component manually.
    const component = new ContentTools.ComponentUI();
    const domElement = document.createElement('div');
    component._domElement = domElement;
    component.addCSSClass('foo');
    component.addCSSClass('bar');
    component.removeCSSClass('foo');

    return expect(domElement.getAttribute('class')).toBe('bar');
}));


describe('ContentTools.ComponentUI.unmount()', () => it('should remove a CSS class from the component\'s DOM element', function() {

    // Components can't mount themselves so we have to fake this by
    // associating a DOM element with the component manually.
    const component = new ContentTools.ComponentUI();
    const domElement = document.createElement('div');
    document.body.appendChild(domElement);
    component._domElement = domElement;
    component.unmount();

    return expect(component.isMounted()).toBe(false);
}));


describe('ContentTools.ComponentUI.addEventListener()', () => it(`should bind a function to be called whenever the named event is \
dispatched against the component`, function() {

    // Create a function to call when the event is triggered
    const foo = {
        handleFoo() {
        }
    };
    spyOn(foo, 'handleFoo');

    // Create a component and add an event listner
    const component = new ContentTools.ComponentUI();
    component.addEventListener('foo', foo.handleFoo);

    // Dispatch the event
    const ev = component.createEvent('foo', {'bar': 1});
    component.dispatchEvent(ev);

    return expect(foo.handleFoo).toHaveBeenCalledWith(ev);
}));


describe('ContentTools.ComponentUI.createEvent()', () => it('should return an new event', function() {

    // Create a component to create an event against
    const component = new ContentTools.ComponentUI();
    const ev = new ContentTools.Event('foo', {bar: 1});

    expect(ev.name()).toBe('foo');
    return expect(ev.detail()).toEqual({bar: 1});
}));


describe('ContentTools.ComponentUI.dispatchEvent()', function() {

    it('should dispatch an event against a component', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Create a component and add an event listner
        const component = new ContentTools.ComponentUI();
        component.addEventListener('foo', foo.handleFoo);

        // Dispatch the event
        const ev = component.createEvent('foo', {'bar': 1});
        component.dispatchEvent(ev);

        return expect(foo.handleFoo).toHaveBeenCalledWith(ev);
    });

    it(`should return false (prevent the default action) for the event if \
cancelled`, function() {

        // Define a test component class that triggers an event when a method is
        // called.
        class TestComponent extends ContentTools.ComponentUI {

            foo() {
                if (this.triggerEvent('foo')) {
                    return this.bar = 1;
                }
            }
        }

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo(ev) {
                ev.preventDefault();
            }
        };
        spyOn(foo, 'handleFoo');

        // Create a test component and add an event listner
        const component = new TestComponent();
        component.addEventListener('foo', foo.handleFoo);

        // Dispatch the event
        const ev = component.createEvent('foo', {'bar': 1});
        component.dispatchEvent(ev);

        expect(foo.handleFoo).toHaveBeenCalledWith(ev);
        return expect(foo.bar).toBe(undefined);
    });

    return it(`should prevent stop calling listener functions once the event has been \
halted`, function() {

        // Create a set of functions to call when the event is triggered
        const foo = {
            handleBar() {
            },

            handleFoo() {
                ev.stopImmeditatePropagation();
            }
        };
        spyOn(foo, 'handleBar');
        spyOn(foo, 'handleFoo');

        // Create a component and add an event listner
        const component = new ContentTools.ComponentUI();
        component.addEventListener('foo', foo.handleFoo);
        component.addEventListener('bar', foo.handleBar);

        // Dispatch the event
        var ev = component.createEvent('foo', {'bar': 1});
        component.dispatchEvent(ev);

        expect(foo.handleFoo).toHaveBeenCalledWith(ev);
        return expect(foo.handleBar).not.toHaveBeenCalled();
    });
});


describe('ContentTools.ComponentUI.removeEventListener()', function() {

    let component = null;
    let listeners = null;

    beforeEach(function() {
        listeners = {
            handleBar() {
            },

            handleFoo() {
            },

            handleZee() {
            }
        };
        spyOn(listeners, 'handleBar');
        spyOn(listeners, 'handleFoo');
        spyOn(listeners, 'handleZee');

        // Create an editable region
        component = new ContentTools.ComponentUI();
        component.addEventListener('foo', listeners.handleFoo);
        component.addEventListener('foo', listeners.handleBar);
        return component.addEventListener('zee', listeners.handleZee);
    });

    it(`should remove a single event listener against a component if called with \
an event name and the listener function`, function() {

        // Remove an individual event listener
        component.removeEventListener('foo', listeners.handleFoo);

        // Dispatch foo event
        let ev = component.createEvent('foo', {'bar': 1});
        component.dispatchEvent(ev);

        expect(listeners.handleFoo).not.toHaveBeenCalled();
        expect(listeners.handleBar).toHaveBeenCalled();

        // Dispatch zee event
        ev = component.createEvent('zee');
        component.dispatchEvent(ev);

        return expect(listeners.handleZee).toHaveBeenCalled();
    });

    it(`should remove multiple event listener against a component by \
name`, function() {

        // Remove an individual event listener
        component.removeEventListener('foo');

        // Dispatch foo event
        let ev = component.createEvent('foo');
        component.dispatchEvent(ev);

        expect(listeners.handleFoo).not.toHaveBeenCalled();
        expect(listeners.handleBar).not.toHaveBeenCalled();

        // Dispatch zee event
        ev = component.createEvent('zee');
        component.dispatchEvent(ev);

        return expect(listeners.handleZee).toHaveBeenCalled();
    });

    return it(`should remove all event listener against a component if called without \
arguments`, function() {

        // Remove an individual event listener
        component.removeEventListener();

        // Dispatch foo event
        let ev = component.createEvent('foo');
        component.dispatchEvent(ev);

        expect(listeners.handleFoo).not.toHaveBeenCalled();
        expect(listeners.handleBar).not.toHaveBeenCalled();

        // Dispatch zee event
        ev = component.createEvent('zee');
        component.dispatchEvent(ev);

        return expect(listeners.handleZee).not.toHaveBeenCalled();
    });
});


describe('ContentTools.ComponentUI.createDiv()', () => it(`should create a DOM element with the specified classes, attributes and \
content`, function() {

    const domElement = ContentTools.ComponentUI.createDiv(
        ['foo'],
        {'bar': 'foo'},
        'foo bar'
        );

    expect(domElement.getAttribute('class')).toBe('foo');
    expect(domElement.getAttribute('bar')).toBe('foo');
    return expect(domElement.innerHTML).toBe('foo bar');
}));


// WidgetUI

describe('ContentTools.WidgetUI()', () => it('should return an instance of a WidgetUI', function() {

    const widget = new ContentTools.WidgetUI();
    return expect(widget instanceof ContentTools.WidgetUI).toBe(true);
}));


describe('ContentTools.WidgetUI.attach()', () => it('should attach a widget as a child of another widget and mount it', function() {

    const parent = new ContentTools.WidgetUI();
    const child = new ContentTools.WidgetUI();
    spyOn(child, 'mount');
    parent.attach(child);

    // Check the widget was added as a child
    expect(parent.children()).toEqual([child]);

    // Check `mount` was called against the widget
    return expect(child.mount).toHaveBeenCalledWith();
}));


describe('ContentTools.WidgetUI.detach()', () => it('should detach a child widget and unmount it', function() {

    const parent = new ContentTools.WidgetUI();
    const child = new ContentTools.WidgetUI();
    spyOn(child, 'unmount');
    parent.attach(child);

    // Widgets can't mount themselves so we have to fake this by associating
    // a DOM element with the widget manually.
    const domElement = document.createElement('div');
    document.body.appendChild(domElement);
    parent._domElement = domElement;
    parent.detach(child);

    // Check the widget was removed as a child
    expect(parent.children()).toEqual([]);

    // Check `unmount` was called against the widget
    return expect(child.unmount).toHaveBeenCalled();
}));


describe('ContentTools.WidgetUI.show()', () => it('should add the `--active` CSS modifier class to a widget', function(done) {

    const widget = new ContentTools.WidgetUI();

    // Widgets can't mount themselves so we have to fake this by associating
    // a DOM element with the widget manually.
    const domElement = document.createElement('div');
    document.body.appendChild(domElement);
    widget._domElement = domElement;

    // Attach a fake mount method to allow the widget to remount itself
    widget.mount = () => widget._domElement = domElement;

    // Show the widget (there's a delay to allow any CSS transitions to
    // activate).
    widget.show();

    const checkShown = function() {
        const classes = widget.domElement().getAttribute('class').split(' ');
        expect(classes.indexOf('ct-widget--active') > -1).toBe(true);
        return done();
    };

    return setTimeout(checkShown, 500);
}));


describe('ContentTools.WidgetUI.hide()', function() {

    let widget = null;

    beforeEach(function() {
        // Create a widget
        widget = new ContentTools.WidgetUI();

        // Widgets can't mount themselves so we have to fake this by associating
        // a DOM element with the widget manually.
        const domElement = document.createElement('div');
        domElement.setAttribute('class', 'ct-widget');
        document.body.appendChild(domElement);
        return widget._domElement = domElement;
    });

    it(`should remove the \`--active\` CSS modifier class from a \
widget`, function() {

        widget.hide();

        const classes = (widget.domElement().getAttribute('class') || '').split(' ');
        return expect(classes.indexOf('ct-widget--active') === -1).toBe(true);
    });

    return it('should unmount the component after X seconds', function(done) {

        widget.hide();

        const checkUnmounted = function() {
            expect(widget.isMounted()).toBe(false);
            return done();
        };

        return setTimeout(checkUnmounted, 500);
    });
});


// AnchoredComponentUI

describe('ContentTools.AnchoredComponentUI()', () => it('should return an instance of a AnchoredComponentUI', function() {

    const anchored = new ContentTools.AnchoredComponentUI();
    return expect(anchored instanceof ContentTools.AnchoredComponentUI).toBe(true);
}));


describe('ContentTools.AnchoredComponentUI.mount()', () => it('should mount the component to a DOM element', function() {

    const domElement = document.createElement('div');
    const parentDOMElement = document.createElement('div');

    const anchored = new ContentTools.AnchoredComponentUI();

    // Components can't mount themselves so we have to fake this by
    // associating a DOM element with the component manually.
    anchored._domElement = domElement;

    anchored.mount(parentDOMElement);

    return expect(anchored.domElement().parentNode).toEqual(parentDOMElement);
}));