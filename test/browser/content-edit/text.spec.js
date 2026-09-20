/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Text

describe('`ContentEdit.Text()`', function() {

    afterEach(() => ContentEdit.TRIM_WHITESPACE = true);

    it('should return an instance of Text`', function() {
        const text = new ContentEdit.Text('p', {}, 'foo <b>bar</b>');
        return expect(text instanceof ContentEdit.Text).toBe(true);
    });

    it('should trim whitespace by default`', function() {
        const text = new ContentEdit.Text('p', {}, '&nbsp;foo <b>bar</b><br>');
        return expect(text.html()).toBe('<p>\n' +
                `${ ContentEdit.INDENT }foo <b>bar</b>\n` +
            '</p>'
        );
    });

    return it('should preserve whitespace if `TRIM_WHITESPACE` is false`', function() {
        ContentEdit.TRIM_WHITESPACE = false;
        const text = new ContentEdit.Text('p', {}, '&nbsp;foo <b>bar</b><br>');
        return expect(text.html()).toBe('<p>\n' +
                `${ ContentEdit.INDENT }&nbsp;foo <b>bar</b><br>\n` +
            '</p>'
        );
    });
});


describe('`ContentEdit.Text.cssTypeName()`', () => it('should return \'text\'', function() {
    const text = new ContentEdit.Text('p', {}, 'foo');
    return expect(text.cssTypeName()).toBe('text');
}));


describe('`ContentEdit.Text.type()`', () => it('should return \'Text\'', function() {
    const text = new ContentEdit.Text('p', {}, 'foo <b>bar</b>');
    return expect(text.type()).toBe('Text');
}));


describe('`ContentEdit.Text.typeName()`', () => it('should return \'Text\'', function() {
    const text = new ContentEdit.Text('p', {}, 'foo <b>bar</b>');
    return expect(text.typeName()).toBe('Text');
}));


describe('ContentEdit.Text.blur()', function() {

    const root = ContentEdit.Root.get();
    let text = null;
    let region = null;

    beforeEach(function() {
        // Mount a text element to a region
        text = new ContentEdit.Text('p', {}, 'foo');
        region = new ContentEdit.Region(document.getElementById('test'));
        region.attach(text);
        return text.focus();
    });

    afterEach(() => region.detach(text));

    it('should blur the text element', function() {
        text.blur();
        return expect(text.isFocused()).toBe(false);
    });

    it('should remove the text element if it\'s just whitespace', function() {
        text.domElement().innerHTML = '';
        text.content = new HTMLString.String('');
        text.blur();
        return expect(text.parent()).toBe(null);
    });

    it('should trigger the `blur` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the blur event
        root.bind('blur', foo.handleFoo);

        // Detach the node
        text.blur();
        return expect(foo.handleFoo).toHaveBeenCalledWith(text);
    });

    return it(`should not remove the text element if it\'s just whitespace but remove \
behaviour is disallowed`, function() {

        // Disallow remove
        text.can('remove', false);

        text.domElement().innerHTML = '';
        text.content = new HTMLString.String('');
        text.blur();
        return expect(text.parent()).not.toBe(null);
    });
});


describe('`ContentEdit.Text.createDraggingDOMElement()`', () => it('should create a helper DOM element', function() {
    // Mount an image to a region
    const text = new ContentEdit.Text('p', {}, 'foo <b>bar</b>');
    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(text);

    // Get the helper DOM element
    const helper = text.createDraggingDOMElement();

    expect(helper).not.toBe(null);
    expect(helper.tagName.toLowerCase()).toBe('div');
    return expect(helper.innerHTML).toBe('foo bar');
}));


describe('ContentEdit.Text.drag()', function() {

    const root = ContentEdit.Root.get();
    let text = null;

    beforeEach(function() {
        // Mount a text element
        text = new ContentEdit.Text('p', {}, 'foo');
        const region = new ContentEdit.Region(document.createElement('div'));
        return region.attach(text);
    });

    afterEach(() => root.cancelDragging());

    it('should call `storeState` against the text element', function() {
        // Spy on the storeState method of root
        spyOn(text, 'storeState');

        // Drag the text element
        text.drag(0, 0);

        return expect(text.storeState).toHaveBeenCalled();
    });

    return it('should call `startDragging` against the root element', function() {
        // Spy on the startDragging method of root
        spyOn(root, 'startDragging');

        // Drag the text element
        text.drag(0, 0);

        return expect(root.startDragging).toHaveBeenCalledWith(text, 0, 0);
    });
});


describe('ContentEdit.Text.drop()', () => it('should call the `restoreState` against the text element', function() {
    // Mount a text element
    const textA = new ContentEdit.Text('p', {}, 'foo');
    const textB = new ContentEdit.Text('p', {}, 'bar');
    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(textA);
    region.attach(textB);

    // Spy on the startDragging method of root
    spyOn(textA, 'restoreState');

    // Drag the text element
    textA.storeState();
    textA.drop(textB, ['above', 'center']);

    return expect(textA.restoreState).toHaveBeenCalled();
}));


describe('ContentEdit.Text.focus()', function() {

    const root = ContentEdit.Root.get();
    let text = null;
    let region = null;

    beforeEach(function() {
        // Mount a text element to a region
        text = new ContentEdit.Text('p', {}, 'foo');
        region = new ContentEdit.Region(document.getElementById('test'));
        region.attach(text);
        return text.blur();
    });

    afterEach(() => region.detach(text));

    it('should focus the text element', function() {
        text.focus();
        return expect(text.isFocused()).toBe(true);
    });

    return it('should trigger the `focus` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the focus event
        root.bind('focus', foo.handleFoo);

        // Detach the node
        text.focus();
        return expect(foo.handleFoo).toHaveBeenCalledWith(text);
    });
});


describe('ContentEdit.Text.html()', () => it('should return a HTML string for the text element', function() {
    const text = new ContentEdit.Text('p', {'class': 'foo'}, 'bar <b>zee</b>');
    return expect(text.html()).toBe('<p class="foo">\n' +
            `${ ContentEdit.INDENT }bar <b>zee</b>\n` +
        '</p>'
    );
}));


describe('ContentEdit.Text.mount()', function() {

    let text = null;
    let region = null;

    beforeEach(function() {
        text = new ContentEdit.Text('p', {}, 'foo');

        // Mount the text element
        region = new ContentEdit.Region(document.createElement('div'));
        region.attach(text);
        return text.unmount();
    });

    it('should mount the text element to the DOM', function() {
        text.mount();
        return expect(text.isMounted()).toBe(true);
    });

    it('should call `updateInnerHTML` against the text element', function() {
        // Spy on the startDragging method of root
        spyOn(text, 'updateInnerHTML');
        text.mount();

        return expect(text.updateInnerHTML).toHaveBeenCalled();
    });

    return it('should trigger the `mount` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the mount event
        const root = ContentEdit.Root.get();
        root.bind('mount', foo.handleFoo);

        // Mount the text element
        text.mount();
        return expect(foo.handleFoo).toHaveBeenCalledWith(text);
    });
});


describe('ContentEdit.Text.restoreState()', () => it(`should restore a text elements state after it has been \
remounted`, function() {

    // Mount a text element to a region
    const text = new ContentEdit.Text('p', {}, 'foo');
    const region = new ContentEdit.Region(document.getElementById('test'));
    region.attach(text);

    // Select some text
    text.focus();
    new ContentSelect.Range(1, 2).select(text.domElement());

    // Store the text elements state and unmount it
    text.storeState();
    text.unmount();

    // Remount and restore the state
    text.mount();
    text.restoreState();

    const selection = ContentSelect.Range.query(text.domElement());
    expect(selection.get()).toEqual([1, 2]);

    // Clean up
    return region.detach(text);
}));


describe('ContentEdit.Text.selection()', () => it('should get/set the content selection for the element', function() {

    // Mount a text element to a region
    const text = new ContentEdit.Text('p', {}, 'foobar');
    const region = new ContentEdit.Region(document.getElementById('test'));
    region.attach(text);

    // Set/Get the content selection for the text element
    text.selection(new ContentSelect.Range(1, 2));
    expect(text.selection().get()).toEqual([1, 2]);

    // Clean up
    return region.detach(text);
}));


describe('ContentEdit.Text.storeState()', () => it('should store the text elements state so it can be restored', function() {

    // Mount a text element to a region
    const text = new ContentEdit.Text('p', {}, 'foo');
    const region = new ContentEdit.Region(document.getElementById('test'));
    region.attach(text);

    // Select some text
    text.focus();
    new ContentSelect.Range(1, 2).select(text.domElement());

    // Store the text elements state and unmount it
    text.storeState();
    expect(text._savedSelection.get()).toEqual([1, 2]);

    text.unmount();

    // Remount and restore the state
    text.mount();
    text.restoreState();

    const selection = ContentSelect.Range.query(text.domElement());
    expect(selection.get()).toEqual([1, 2]);

    // Clean up
    return region.detach(text);
}));


describe('ContentEdit.Text.updateInnerHTML()', () => it(`should update the contents of the text elements related DOM \
element`, function() {

    // Mount a text element to a region
    const text = new ContentEdit.Text('p', {}, 'foo');
    const region = new ContentEdit.Region(document.getElementById('test'));
    region.attach(text);

    text.content = text.content.concat(' bar');
    text.updateInnerHTML();

    // Check the text elements DOM elements content was updated
    expect(text.domElement().innerHTML).toBe('foo bar');

    // Clean up
    return region.detach(text);
}));


describe('`ContentEdit.Text.fromDOMElement()`', () => it(`should convert the following DOM elements into a text element: \
<address>, <h1>, <h2>, <h3>, <h4>, <h5>, <h6>, <p>`, function() {

    const {
        INDENT
    } = ContentEdit;

    // address
    const domAddress = document.createElement('address');
    domAddress.innerHTML = 'foo';
    const address = ContentEdit.Text.fromDOMElement(domAddress);
    expect(address.html()).toBe(`<address>\n${ INDENT }foo\n</address>`);

    // h1
    for (let i = 1; i < 7; i++) {
        var domH = document.createElement(`h${ i }`);
        domH.innerHTML = 'foo';
        var h = ContentEdit.Text.fromDOMElement(domH);
        expect(h.html()).toBe(`<h${ i }>\n${ INDENT }foo\n</h${ i }>`);
    }

    // p
    const domP = document.createElement('p');
    domP.innerHTML = 'foo';
    const p = ContentEdit.Text.fromDOMElement(domP);
    return expect(p.html()).toBe(`<p>\n${ INDENT }foo\n</p>`);
}));


// Key events

describe('`ContentEdit.Text` key events`', function() {

    const {
        INDENT
    } = ContentEdit;
    const ev = {preventDefault() {  }};
    let region = null;
    const root = ContentEdit.Root.get();

    beforeEach(function() {
        region = new ContentEdit.Region(document.getElementById('test'));
        return ['foo', 'bar', 'zee'].map((content) =>
            region.attach(new ContentEdit.Text('p', {}, content)));
    });

    afterEach(() => region.children.slice().map((child) =>
        region.detach(child)));

    it('should support down arrow nav to next content element', function() {
        const text = region.children[0];
        text.focus();
        new ContentSelect.Range(3, 3).select(text.domElement());
        text._keyDown(ev);

        return expect(root.focused()).toBe(region.children[1]);
});

    it('should support left arrow nav to previous content element', function() {
        const text = region.children[1];
        text.focus();
        new ContentSelect.Range(0, 0).select(text.domElement());
        text._keyLeft(ev);

        return expect(root.focused()).toBe(region.children[0]);
});

    it('should support right arrow nav to next content element', function() {
        const text = region.children[0];
        text.focus();
        new ContentSelect.Range(3, 3).select(text.domElement());
        text._keyRight(ev);

        return expect(root.focused()).toBe(region.children[1]);
});

    it('should support up arrow nav to previous content element', function() {
        const text = region.children[1];
        text.focus();
        new ContentSelect.Range(0, 0).select(text.domElement());
        text._keyUp(ev);

        return expect(root.focused()).toBe(region.children[0]);
});

    it('should support delete merge with next content element', function() {
        const text = region.children[0];
        text.focus();
        new ContentSelect.Range(3, 3).select(text.domElement());
        text._keyDelete(ev);

        return expect(text.content.text()).toBe('foobar');
    });

    it('should support backspace merge with previous content element', function() {
        const text = region.children[1];
        text.focus();
        new ContentSelect.Range(0, 0).select(text.domElement());
        text._keyBack(ev);

        return expect(region.children[0].content.text()).toBe('foobar');
    });

    it('should support return splitting the element into 2', function() {
        const text = region.children[0];
        text.focus();
        new ContentSelect.Range(2, 2).select(text.domElement());
        text._keyReturn(ev);

        expect(region.children[0].content.text()).toBe('fo');
        return expect(region.children[1].content.text()).toBe('o');
    });

    it('should support shift+return inserting a line break', function() {
        const text = region.children[0];
        text.focus();
        new ContentSelect.Range(2, 2).select(text.domElement());
        ev.shiftKey = true;
        text._keyReturn(ev);

        return expect(region.children[0].content.html()).toBe('fo<br>o');
    });

    return it(`should not split the element into 2 on return if spawn is \
disallowed`, function() {

        const childCount = region.children.length;
        const text = region.children[0];

        // Disallow spawning of new elements
        text.can('spawn', false);

        text.focus();
        new ContentSelect.Range(2, 2).select(text.domElement());
        text._keyReturn(ev);

        return expect(region.children.length).toBe(childCount);
    });
});


// Test the behaviour of the return key if the `PREFER_LINE_BREAKS` has been
// set to true.

describe('`ContentEdit.Text` key events with prefer line breaks`', function() {

    const {
        INDENT
    } = ContentEdit;
    const ev = {preventDefault() {  }};
    let region = null;
    const root = ContentEdit.Root.get();

    beforeEach(function() {
        ContentEdit.PREFER_LINE_BREAKS = true;
        region = new ContentEdit.Region(document.getElementById('test'));
        return ['foo', 'bar', 'zee'].map((content) =>
            region.attach(new ContentEdit.Text('p', {}, content)));
    });

    afterEach(function() {
        ContentEdit.PREFER_LINE_BREAKS = false;
        return region.children.slice().map((child) =>
            region.detach(child));
    });

    it('should support return inserting a line break', function() {
        const text = region.children[0];
        text.focus();
        new ContentSelect.Range(2, 2).select(text.domElement());
        text._keyReturn(ev);

        return expect(region.children[0].content.html()).toBe('fo<br>o');
    });

    return it('should support shift+return splitting the element into 2', function() {
        const text = region.children[0];
        text.focus();
        new ContentSelect.Range(2, 2).select(text.domElement());
        ev.shiftKey = true;
        text._keyReturn(ev);

        expect(region.children[0].content.text()).toBe('fo');
        return expect(region.children[1].content.text()).toBe('o');
    });
});


// Droppers

describe('`ContentEdit.Text` drop interactions`', function() {

    let region = null;
    let text = null;

    beforeEach(function() {
        region = new ContentEdit.Region(document.createElement('div'));
        text = new ContentEdit.Text('p', {}, 'foo');
        return region.attach(text);
    });

    it('should support dropping on Text', function() {
        const otherText = new ContentEdit.Text('p', {}, 'bar');
        region.attach(otherText);

        // Check the initial order
        expect(text.nextSibling()).toBe(otherText);

        // Check the order after dropping the element after
        text.drop(otherText, ['below', 'center']);
        expect(otherText.nextSibling()).toBe(text);

        // Check the order after dropping the element before
        text.drop(otherText, ['above', 'center']);
        return expect(text.nextSibling()).toBe(otherText);
    });

    it('should support dropping on Static', function() {
        const staticElm = ContentEdit.Static.fromDOMElement(
            document.createElement('div')
            );
        region.attach(staticElm);

        // Check the initial order
        expect(text.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element after
        text.drop(staticElm, ['below', 'center']);
        expect(staticElm.nextSibling()).toBe(text);

        // Check the order after dropping the element before
        text.drop(staticElm, ['above', 'center']);
        return expect(text.nextSibling()).toBe(staticElm);
    });

    return it('should support being dropped on by `moveable` Static', function() {
        const staticElm = new ContentEdit.Static('div', {'data-ce-moveable': 'data-ce-moveable'}, 'foo');
        region.attach(staticElm, 0);

        // Check the initial order
        expect(staticElm.nextSibling()).toBe(text);

        // Check the order after dropping the element below
        staticElm.drop(text, ['below', 'center']);
        expect(text.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element above
        staticElm.drop(text, ['above', 'center']);
        return expect(staticElm.nextSibling()).toBe(text);
    });
});


// Mergers

describe('`ContentEdit.Text` merge interactions`', function() {

    let text = null;
    let region = null;

    beforeEach(function() {
        region = new ContentEdit.Region(document.getElementById('test'));
        text = new ContentEdit.Text('p', {}, 'foo');
        return region.attach(text);
    });

    afterEach(() => region.children.slice().map((child) =>
        region.detach(child)));

    return it('should support merging with Text', function() {
        const otherText = new ContentEdit.Text('p', {}, 'bar');
        region.attach(otherText);

        // Merge the text
        text.merge(otherText);
        expect(text.html()).toBe(`<p>\n${ ContentEdit.INDENT }foobar\n</p>`);
        return expect(otherText.parent()).toBe(null);
    });
});


// PreText

describe('`ContentEdit.PreText()`', () => it('should return an instance of PreText`', function() {
    const preText = new ContentEdit.PreText('pre', {}, 'foo <b>bar</b>');
    return expect(preText instanceof ContentEdit.PreText).toBe(true);
}));


describe('`ContentEdit.PreText.cssTypeName()`', () => it('should return \'pre-text\'', function() {
    const preText = new ContentEdit.PreText('pre', {}, 'foo <b>bar</b>');
    return expect(preText.cssTypeName()).toBe('pre-text');
}));


describe('`ContentEdit.PreText.type()`', () => it('should return \'PreText\'', function() {
    const preText = new ContentEdit.PreText('pre', {}, 'foo <b>bar</b>');
    return expect(preText.type()).toBe('PreText');
}));


describe('`ContentEdit.PreText.typeName()`', () => it('should return \'Preformatted\'', function() {
    const preText = new ContentEdit.PreText('pre', {}, 'foo <b>bar</b>');
    return expect(preText.typeName()).toBe('Preformatted');
}));


describe('ContentEdit.PreText.html()', () => it('should return a HTML string for the pre-text element', function() {
    const I = ContentEdit.INDENT;

    const preText = new ContentEdit.PreText(
        'pre',
        // NOTE: the 4-space indent is significant and was lost in conversion.
        // CoffeeScript block strings strip only the COMMON leading indent, and
        // here the outer lines sit at column 0, so `    test` kept its spaces.
        // decaffeinate stripped them anyway -- a real conversion bug, caught by
        // this spec.
        {'class': 'foo'}, `\
&lt;div&gt;
    test &amp; test
&lt;/div&gt;\
`);

    return expect(preText.html()).toBe(`<pre class="foo">&lt;div&gt;
${ ContentEdit.INDENT }test &amp; test
&lt;/div&gt;</pre>`
    );
}));

describe('`ContentEdit.PreText.fromDOMElement()`', () => it('should convert a <pre> DOM element into a preserved text element', function() {
    const I = ContentEdit.INDENT;

    // pre
    const domDiv = document.createElement('div');
    domDiv.innerHTML = `<pre>&lt;div&gt;
${ ContentEdit.INDENT }test &amp; test
&lt;/div&gt;</pre>`;

    const preText = ContentEdit.PreText.fromDOMElement(domDiv.childNodes[0]);

    return expect(preText.html()).toBe(`<pre>&lt;div&gt;
${ ContentEdit.INDENT }test &amp; test
&lt;/div&gt;</pre>`
    );
}));


// Key events

describe('`ContentEdit.PreText` key events`', function() {

    const I = ContentEdit.INDENT;
    const ev = {preventDefault() {  }};
    let region = null;
    let preText = null;
    const root = ContentEdit.Root.get();

    beforeEach(function() {
        region = new ContentEdit.Region(document.getElementById('test'));
        preText = new ContentEdit.PreText(
            'pre',
            {'class': 'foo'}, `&lt;div&gt;
${ ContentEdit.INDENT }test &amp; test
&lt;/div&gt;`
            );
        return region.attach(preText);
    });

    afterEach(() => region.children.slice().map((child) =>
        region.detach(child)));

    it('should support return adding a newline', function() {
        preText.focus();
        new ContentSelect.Range(13, 13).select(preText.domElement());
        preText._keyReturn(ev);

        return expect(preText.html()).toBe(`<pre class="foo">&lt;div&gt;
${ ContentEdit.INDENT }tes
t &amp; test
&lt;/div&gt;</pre>`
        );
    });

    it('should support tab indenting a single line', function() {
        preText.focus();
        new ContentSelect.Range(10, 10).select(preText.domElement());
        preText._keyTab(ev);

        return expect(preText.html()).toBe(`<pre class="foo">&lt;div&gt;
${ ContentEdit.INDENT }${ ContentEdit.PreText.TAB_INDENT }test &amp; test
&lt;/div&gt;</pre>`
        );
    });

    it('should support tab indenting multiple lines', function() {
        preText.focus();
        new ContentSelect.Range(10, 24).select(preText.domElement());
        preText._keyTab(ev);

        return expect(preText.html()).toBe(`<pre class="foo">&lt;div&gt;
${ ContentEdit.INDENT }${ ContentEdit.PreText.TAB_INDENT }test &amp; test
${ ContentEdit.PreText.TAB_INDENT }&lt;/div&gt;</pre>`
        );
    });

    return it('should support tab unindenting multiple lines', function() {
        preText.focus();
        new ContentSelect.Range(10, 24).select(preText.domElement());
        ev.shiftKey = true;
        preText._keyTab(ev);

        return expect(preText.html()).toBe(`<pre class="foo">&lt;div&gt;
test &amp; test
&lt;/div&gt;</pre>`
        );
    });
});


// Droppers

describe('`ContentEdit.PreText` drop interactions`', function() {

    let region = null;
    let preText = null;

    beforeEach(function() {
        region = new ContentEdit.Region(document.createElement('div'));
        preText = new ContentEdit.PreText('p', {}, 'foo');
        return region.attach(preText);
    });

    it('should support dropping on PreText', function() {
        const otherPreText = new ContentEdit.PreText('pre', {}, '');
        region.attach(otherPreText);

        // Check the initial order
        expect(preText.nextSibling()).toBe(otherPreText);

        // Check the order after dropping the element after
        preText.drop(otherPreText, ['below', 'center']);
        expect(otherPreText.nextSibling()).toBe(preText);

        // Check the order after dropping the element before
        preText.drop(otherPreText, ['above', 'center']);
        return expect(preText.nextSibling()).toBe(otherPreText);
    });

    it('should support dropping on Static', function() {
        const staticElm = ContentEdit.Static.fromDOMElement(
            document.createElement('div')
            );
        region.attach(staticElm);

        // Check the initial order
        expect(preText.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element after
        preText.drop(staticElm, ['below', 'center']);
        expect(staticElm.nextSibling()).toBe(preText);

        // Check the order after dropping the element before
        preText.drop(staticElm, ['above', 'center']);
        return expect(preText.nextSibling()).toBe(staticElm);
    });

    it('should support being dropped on by `moveable` Static', function() {
        const staticElm = new ContentEdit.Static('div', {'data-ce-moveable': 'data-ce-moveable'}, 'foo');
        region.attach(staticElm, 0);

        // Check the initial order
        expect(staticElm.nextSibling()).toBe(preText);

        // Check the order after dropping the element below
        staticElm.drop(preText, ['below', 'center']);
        expect(preText.nextSibling()).toBe(staticElm);

        // Check the order after dropping the element above
        staticElm.drop(preText, ['above', 'center']);
        return expect(staticElm.nextSibling()).toBe(preText);
    });

    it('should support dropping on Text', function() {
        const text = new ContentEdit.Text('p');
        region.attach(text);

        // Check the initial order
        expect(preText.nextSibling()).toBe(text);

        // Check the order after dropping the element below
        preText.drop(text, ['below', 'center']);
        expect(text.nextSibling()).toBe(preText);

        // Check the order after dropping the element above
        preText.drop(text, ['above', 'center']);
        return expect(preText.nextSibling()).toBe(text);
    });

    return it('should support being dropped on by Text', function() {
        const text = new ContentEdit.Text('p');
        region.attach(text, 0);

        // Check the initial order
        expect(text.nextSibling()).toBe(preText);

        // Check the order after dropping the element below
        text.drop(preText, ['below', 'center']);
        expect(preText.nextSibling()).toBe(text);

        // Check the order after dropping the element above
        text.drop(preText, ['above', 'center']);
        return expect(text.nextSibling()).toBe(preText);
    });
});