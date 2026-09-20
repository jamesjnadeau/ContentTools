/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
// Add a DOM element used to anchor editable content against during the tests
const testDomElement = document.createElement('div');
testDomElement.setAttribute('id', 'test');
document.body.appendChild(testDomElement);


// Node

describe('ContentEdit.Node()', () => it('should create `ContentEdit.Node` instance', function() {
    const node = new ContentEdit.Node();
    return expect(node instanceof ContentEdit.Node).toBe(true);
}));


describe('ContentEdit.Node.lastModified()', () => it('should return a date last modified if the node has been tainted', function() {
    const node = new ContentEdit.Node();

    // Initially the node should not be marked as modified
    expect(node.lastModified()).toBe(null);

    // Mark the node as modified
    node.taint();

    return expect(node.lastModified()).not.toBe(null);
}));


describe('ContentEdit.Node.parent()', () => it('should return the parent node collection for the node', function() {

    // Create a collection and add a node to it
    const collection = new ContentEdit.NodeCollection();
    const node = new ContentEdit.Node();
    collection.attach(node);

    return expect(node.parent()).toBe(collection);
}));


describe('ContentEdit.Node.parents()', () => it('should return an ascending list of all the node\'s parents', function() {

    // Create a node with 2 parents
    const grandParent = new ContentEdit.NodeCollection();
    const parent = new ContentEdit.NodeCollection();
    grandParent.attach(parent);
    const node = new ContentEdit.Node();
    parent.attach(node);

    return expect(node.parents()).toEqual([parent, grandParent]);
}));


describe('ContentEdit.Node.html()', () => it('should raise a not implemented error', function() {
    const node = new ContentEdit.Node();
    return expect(node.html).toThrow(new Error('`html` not implemented'));
}));


describe('ContentEdit.Node.type()', () => it('should return \'Node\'', function() {

    // Create a collection and add a node to it
    const node = new ContentEdit.Node();

    return expect(node.type()).toBe('Node');
}));


describe('ContentEdit.Node.bind()', () => it(`should bind a function so that it\'s called whenever the event is \
triggered`, function() {

    // Create a function to call when the event is triggered
    const foo = {
        handleFoo() {
        }
    };
    spyOn(foo, 'handleFoo');

    // Create a node and bind the function to an event
    const node = new ContentEdit.Node();
    node.bind('foo', foo.handleFoo);

    // Trigger the event
    node.trigger('foo');

    return expect(foo.handleFoo).toHaveBeenCalled();
}));


describe('ContentEdit.Node.trigger()', () => it(`should trigger an event against the node with specified \
arguments`, function() {

    // Create a function to call when the event is triggered
    const foo = {
        handleFoo() {
        }
    };
    spyOn(foo, 'handleFoo');

    // Create a node and bind the function to an event
    const node = new ContentEdit.Node();
    node.bind('foo', foo.handleFoo);

    // Trigger the event
    node.trigger('foo', 123);

    return expect(foo.handleFoo).toHaveBeenCalledWith(123);
}));


describe('ContentEdit.Node.unbind()', () => it(`should unbind a function previously bound for an event from the \
node`, function() {

    // Create a function to call when the event is triggered
    const foo = {
        handleFoo() {
        }
    };
    spyOn(foo, 'handleFoo');

    // Create a node and bind the function to an event
    const node = new ContentEdit.Node();
    node.bind('foo', foo.handleFoo);

    // Unbind the function
    node.unbind('foo', foo.handleFoo);

    // Trigger the event
    node.trigger('foo');

    return expect(foo.handleFoo).not.toHaveBeenCalled();
}));


describe('ContentEdit.Node.commit()', function() {

    let node = null;

    beforeEach(function() {
        // Create a tainted node
        node = new ContentEdit.Node();
        return node.taint();
    });

    it('should set the last modified date of the node to null', function() {
        node.commit();
        return expect(node.lastModified()).toBe(null);
    });

    return it('should trigger the commit event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the commit event
        const root = ContentEdit.Root.get();
        root.bind('commit', foo.handleFoo);

        // Commit the node
        node.commit();
        return expect(foo.handleFoo).toHaveBeenCalledWith(node);
    });
});


describe('ContentEdit.Node.taint()', function() {

    it(`should set the last modified date of the node, it\'s parents and the \
root`, function() {

        // Create a collection and add a node to it
        const collection = new ContentEdit.NodeCollection();
        const node = new ContentEdit.Node();
        collection.attach(node);

        // Taint the node
        node.taint();

        expect(node.lastModified()).not.toBe(null);
        expect(node.parent().lastModified()).toBe(node.lastModified());
        return expect(ContentEdit.Root.get().lastModified()).toBe(node.lastModified());
    });

    return it('should trigger the taint event against the root', function() {

        // Create a node
        const node = new ContentEdit.Node();

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the taint event
        const root = ContentEdit.Root.get();
        root.bind('taint', foo.handleFoo);

        // Commit the node
        node.taint();
        return expect(foo.handleFoo).toHaveBeenCalledWith(node);
    });
});


describe('ContentEdit.Node.closest()', () => it(`should return the first ancestor (ascending order) to match the that \
returns true for the specified test function.`, function() {

    // Create a node with 2 parents
    const grandParent = new ContentEdit.NodeCollection();
    const parent = new ContentEdit.NodeCollection();
    grandParent.attach(parent);
    const node = new ContentEdit.Node();
    parent.attach(node);

    // Mark the parents with attributes we can test for
    grandParent.foo = true;
    parent.bar = true;

    expect(node.closest(node => node.foo)).toBe(grandParent);
    return expect(node.closest(node => node.bar)).toBe(parent);
}));


describe('ContentEdit.Node.next()', () => it('should return the node next to this node in the tree', function() {

    // Create a node tree
    const collectionA = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Node();
    collectionA.attach(nodeA);

    const collectionB = new ContentEdit.NodeCollection();
    const nodeB = new ContentEdit.Node();
    collectionA.attach(collectionB);
    collectionB.attach(nodeB);

    expect(nodeA.next()).toBe(collectionB);
    return expect(nodeA.next().next()).toBe(nodeB);
}));


describe('ContentEdit.Node.nextContent()', () => it(`should return the next node in the tree that supports the \`content\` \
attribute`, function() {

    // Create a node tree containing a text element (e.g has a `content`
    // attribute).
    const collectionA = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Node();
    collectionA.attach(nodeA);

    const collectionB = new ContentEdit.NodeCollection();
    const nodeB = new ContentEdit.Text('p', {}, 'testing');
    collectionA.attach(collectionB);
    collectionB.attach(nodeB);

    return expect(collectionA.nextContent()).toBe(nodeB);
}));


describe('ContentEdit.Node.nextSibling()', () => it('should return the node next to this node with the same parent', function() {

    // Create a collection with 2 child nodes
    const collection = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Node();
    collection.attach(nodeA);
    const nodeB = new ContentEdit.Node();
    collection.attach(nodeB);

    return expect(nodeA.nextSibling()).toBe(nodeB);
}));


describe('ContentEdit.Node.nextWithTest()', () => it(`should return the next node in the tree that matches or \`undefined\` \
if there are none`, function() {

    // Create a node tree containing
    const collectionA = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Node();
    collectionA.attach(nodeA);

    const collectionB = new ContentEdit.NodeCollection();
    const nodeB = new ContentEdit.Node();
    collectionA.attach(collectionB);
    collectionB.attach(nodeB);

    // Mark the node with attributes we can test for
    nodeB.foo = true;

    expect(collectionA.nextWithTest(node => node.foo)).toBe(nodeB);
    return expect(
        nodeB.nextWithTest(node => node.foo)
        ).toBe(undefined);
}));


describe('ContentEdit.Node.previous()', () => it('should return the node previous to this node in the tree', function() {

    // Create a node tree
    const collectionA = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Node();
    collectionA.attach(nodeA);

    const collectionB = new ContentEdit.NodeCollection();
    const nodeB = new ContentEdit.Node();
    collectionA.attach(collectionB);
    collectionB.attach(nodeB);

    expect(nodeB.previous()).toBe(collectionB);
    return expect(nodeB.previous().previous()).toBe(nodeA);
}));


describe('ContentEdit.Node.nextContent()', () => it(`should return the previous node in the tree that supports the \`content\` \
attribute`, function() {

    // Create a node tree containing a text element (e.g has a `content`
    // attribute).
    const collectionA = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Text('p', {}, 'testing');
    collectionA.attach(nodeA);

    const collectionB = new ContentEdit.NodeCollection();
    const nodeB = new ContentEdit.Node();
    collectionA.attach(collectionB);
    collectionB.attach(nodeB);

    return expect(nodeB.previousContent()).toBe(nodeA);
}));


describe('ContentEdit.Node.previousSibling()', () => it('should return the node previous to this node with the same parent', function() {

    // Create a collection with 2 child nodes
    const collection = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Node();
    collection.attach(nodeA);
    const nodeB = new ContentEdit.Node();
    collection.attach(nodeB);

    return expect(nodeB.previousSibling()).toBe(nodeA);
}));


describe('ContentEdit.Node.previousWithTest()', () => it(`should return the previous node in the tree that matches or \`undefined\` \
if there are none`, function() {

    // Create a node tree
    const collectionA = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Node();
    collectionA.attach(nodeA);

    const collectionB = new ContentEdit.NodeCollection();
    const nodeB = new ContentEdit.Node();
    collectionA.attach(collectionB);
    collectionB.attach(nodeB);

    // Mark the node with attributes we can test for
    nodeA.foo = true;

    expect(nodeB.previousWithTest(node => node.foo)).toBe(nodeA);
    return expect(
        collectionA.previousWithTest(node => node.foo)
        ).toBe(undefined);
}));


describe('ContentEdit.Node.@fromDOMElement()', () => it('should raise a not implemented error', () => expect(
    ContentEdit.Node.fromDOMElement
    ).toThrow(new Error('`fromDOMElement` not implemented'))));


// NodeCollection

describe('ContentEdit.NodeCollection()', () => it('should create `ContentEdit.NodeCollection` instance', function() {
    const collection = new ContentEdit.NodeCollection();
    return expect(collection instanceof ContentEdit.NodeCollection).toBe(true);
}));


describe('ContentEdit.NodeCollection.descendants()', () => it(`should return a (flat) list of all the descendants for the \
collection`, function() {

    // Create a node tree
    const collectionA = new ContentEdit.NodeCollection();
    const nodeA = new ContentEdit.Node();
    collectionA.attach(nodeA);

    const collectionB = new ContentEdit.NodeCollection();
    const nodeB = new ContentEdit.Node();
    collectionA.attach(collectionB);
    collectionB.attach(nodeB);

    return expect(collectionA.descendants()).toEqual([nodeA, collectionB, nodeB]);
}));


describe('ContentEdit.NodeCollection.isMounted()', () => it('should always return false', function() {
    const collection = new ContentEdit.NodeCollection();
    return expect(collection.isMounted()).toBe(false);
}));


describe('ContentEdit.NodeCollection.type()', () => it('should return \'NodeCollection\'', function() {

    // Create a collection and add a node to it
    const collection = new ContentEdit.NodeCollection();

    return expect(collection.type()).toBe('NodeCollection');
}));


describe('ContentEdit.NodeCollection.attach()', function() {

    it('should attach a node to a node collection', function() {

        // Create a collection and add a node to it
        const collection = new ContentEdit.NodeCollection();
        const node = new ContentEdit.Node();
        collection.attach(node);

        return expect(collection.children[0]).toBe(node);
    });

    it('should attach a node to a node collection at the specified index', function() {

        // Create a collection and add some nodes to it
        const collection = new ContentEdit.NodeCollection();

        for (let i = 0; i < 5; i++) {
            var otherNode = new ContentEdit.Node();
            collection.attach(otherNode);
        }

        // Inser a node at a specific index
        const node = new ContentEdit.Node();
        collection.attach(node, 2);

        return expect(collection.children[2]).toBe(node);
    });

    return it('should trigger the attach event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the attach event
        const root = ContentEdit.Root.get();
        root.bind('attach', foo.handleFoo);

        // Create a collection and add a node to it
        const collection = new ContentEdit.NodeCollection();
        const node = new ContentEdit.Node();
        collection.attach(node);

        return expect(foo.handleFoo).toHaveBeenCalledWith(collection, node);
    });
});


describe('ContentEdit.NodeCollection.commit()', function() {

    let collectionA = null;
    let collectionB = null;
    let node = null;

    beforeEach(function() {
        // Create a node tree
        collectionA = new ContentEdit.NodeCollection();
        collectionB = new ContentEdit.NodeCollection();
        node = new ContentEdit.Node();
        collectionA.attach(collectionB);
        return collectionB.attach(node);
    });

    it(`should set the last modified date of the node and it\'s descendants to \
null`, function() {

        // Taint all the nodes by tainting the deepest descendent
        node.taint();
        expect(collectionA.lastModified()).not.toBe(null);

        node.commit();
        return expect(node.lastModified()).toBe(null);
    });

    return it('should trigger the commit event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for commit event
        const root = ContentEdit.Root.get();
        root.bind('commit', foo.handleFoo);

        // Commit the node
        collectionA.commit();
        return expect(foo.handleFoo).toHaveBeenCalledWith(collectionA);
    });
});


describe('ContentEdit.NodeCollection.detach()', function() {

    let collection = null;
    let node = null;

    beforeEach(function() {
        collection = new ContentEdit.NodeCollection();
        node = new ContentEdit.Node();
        return collection.attach(node);
    });

    it('should detach a node from the node collection', function() {

        // Detach the node
        collection.detach(node);
        expect(collection.children.length).toBe(0);
        return expect(node.parent()).toBe(null);
    });

    return it('should trigger the detach event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the detach event
        const root = ContentEdit.Root.get();
        root.bind('detach', foo.handleFoo);

        // Detach the node
        collection.detach(node);
        return expect(foo.handleFoo).toHaveBeenCalledWith(collection, node);
    });
});


// Element

describe('ContentEdit.Element()', () => it('should create `ContentEdit.Element` instance', function() {
    const element = new ContentEdit.Element('div', {'class': 'foo'});
    return expect(element instanceof ContentEdit.Element).toBe(true);
}));


describe('ContentEdit.Element.attributes()', () => it('should return a copy of the elements attributes', function() {
    const element = new ContentEdit.Element(
        'div',
        {'class': 'foo', 'data-test': ''}
        );
    return expect(element.attributes()).toEqual({
        'class': 'foo',
        'data-test': ''
        });
}));


describe('ContentEdit.Element.cssTypeName()', () => it('should return \'element\'', function() {
    const element = new ContentEdit.Element('div', {'class': 'foo'});
    return expect(element.cssTypeName()).toBe('element');
}));


describe('ContentEdit.Element.domElement()', () => it('should return a DOM element if mounted', function() {

    // We can't test this directly against an Element instance as they can't
    // be mounted so instead we use a Text element.
    const element = new ContentEdit.Text('p');
    expect(element.domElement()).toBe(null);

    // Mount the element
    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(element);

    return expect(element.domElement()).not.toBe(null);
}));


describe('ContentEdit.Element.isFocused()', () => it('should return true if element is focused', function() {

    // Create an element to give focus to
    const element = new ContentEdit.Element('div');
    expect(element.isFocused()).toBe(false);

    // Focus on the element
    element.focus();
    return expect(element.isFocused()).toBe(true);
}));


describe('ContentEdit.Element.isMounted()', () => it('should return true if the element is mounted in the DOM', function() {

    // We can't test this directly against an Element instance as they can't
    // be mounted so instead we use a Text element.
    const element = new ContentEdit.Text('p');
    expect(element.isMounted()).toBe(false);

    // Mount the element
    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(element);

    return expect(element.isMounted()).toBe(true);
}));


describe('ContentEdit.Element.type()', () => it('should return \'Element\'', function() {

    // Create a collection and add a node to it
    const element = new ContentEdit.Element('div', {'class': 'foo'});

    return expect(element.type()).toBe('Element');
}));


describe('`ContentEdit.Element.typeName()`', () => it('should return \'Element\'', function() {
    const element = new ContentEdit.Element('div', {'class': 'foo'});
    return expect(element.typeName()).toBe('Element');
}));


describe('ContentEdit.Element.addCSSClass()', () => it('should add a CSS class to the element', function() {

    // Create an element and add a CSS class to it
    const element = new ContentEdit.Element('div');
    element.addCSSClass('foo');
    expect(element.hasCSSClass('foo')).toBe(true);

    // Add another class
    element.addCSSClass('bar');
    return expect(element.hasCSSClass('bar')).toBe(true);
}));


describe('ContentEdit.Element.attr()', () => it('should set/get an attribute for the element', function() {

    const element = new ContentEdit.Element('div');
    element.attr('foo', 'bar');
    return expect(element.attr('foo')).toBe('bar');
}));


describe('ContentEdit.Element.blur()', function() {

    it('should blur an element', function() {

        // Create and focus an element
        const element = new ContentEdit.Element('div');
        element.focus();
        expect(element.isFocused()).toBe(true);

        // Blur the element
        element.blur();
        return expect(element.isFocused()).toBe(false);
    });

    return it('should trigger the `blur` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the blur event
        const root = ContentEdit.Root.get();
        root.bind('blur', foo.handleFoo);

        // Detach the node
        const element = new ContentEdit.Element('div');
        element.focus();
        element.blur();
        return expect(foo.handleFoo).toHaveBeenCalledWith(element);
    });
});

describe('ContentEdit.Element.can()', () => it('should set/get whether a behaviour is allowed for the element', function() {

    const element = new ContentEdit.Element('div');

    // Expect the remove behaviour to be true initially (all behaviours are
    // are initially allowed by default against elements).
    expect(element.can('remove')).toBe(true);

    // Set the behaviour for remove to not allowed
    element.can('remove', false);
    return expect(element.can('remove')).toBe(false);
}));

describe('ContentEdit.Element.createDraggingDOMElement()', () => it('should create a helper DOM element', function() {
    const element = new ContentEdit.Element('div');
    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(element);

    // Get the helper DOM element
    const helper = element.createDraggingDOMElement();

    expect(helper).not.toBe(null);
    return expect(helper.tagName.toLowerCase()).toBe('div');
}));


describe('ContentEdit.Element.drag()', function() {

    it('should call `startDragging` against the root element', function() {

        const element = new ContentEdit.Element('div');

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));
        region.attach(element);

        // Spy on the startDragging method of root
        const root = ContentEdit.Root.get();
        spyOn(root, 'startDragging');

        // Drag the element
        element.drag(0, 0);

        expect(root.startDragging).toHaveBeenCalledWith(element, 0, 0);
        return root.cancelDragging();
    });

    it('should trigger the `drag` event against the root', function() {

        const element = new ContentEdit.Element('div');

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));
        region.attach(element);

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the unmount event
        const root = ContentEdit.Root.get();
        root.bind('drag', foo.handleFoo);

        // Mount the element
        element.drag(0, 0);
        expect(foo.handleFoo).toHaveBeenCalledWith(element);
        return root.cancelDragging();
    });

    return it('should do nothing if the `drag` behavior is not allowed', function() {

        const element = new ContentEdit.Element('div');

        // Disallow dragging of the element
        element.can('drag', false);

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));
        region.attach(element);

        // Spy on the startDragging method of root
        const root = ContentEdit.Root.get();
        spyOn(root, 'startDragging');

        // Attempt to drag the element
        element.drag(0, 0);

        return expect(root.startDragging).not.toHaveBeenCalled();
    });
});


describe('ContentEdit.Element.drop()', function() {

    it(`should select a function from the elements droppers map for the element \
being dropped on to this element`, function() {

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));

        // Create 2 elements that can be dropped on each other (we can't use
        // Element instances so we use Image elements instead).
        const imageA = new ContentEdit.Image();
        region.attach(imageA);

        const imageB = new ContentEdit.Image();
        region.attach(imageB);

        // Spy on the dropper function
        spyOn(ContentEdit.Image.droppers, 'Image');

        // Drop the image
        imageA.drop(imageB, ['below', 'center']);
        return expect(
            ContentEdit.Image.droppers['Image']
            ).toHaveBeenCalledWith(imageA, imageB, ['below', 'center']);
    });

    it('should trigger the `drop` event against the root', function() {

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));

        // Create 2 elements that can be dropped on each other (we can't use
        // Element instances so we use Image elements instead).
        const imageA = new ContentEdit.Image();
        region.attach(imageA);

        const imageB = new ContentEdit.Image();
        region.attach(imageB);

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the unmount event
        const root = ContentEdit.Root.get();
        root.bind('drop', foo.handleFoo);

        // Drop the image on valid target
        imageA.drop(imageB, ['below', 'center']);
        expect(foo.handleFoo).toHaveBeenCalledWith(
            imageA,
            imageB,
            ['below', 'center']
            );

        // Drop the image on invalid target
        imageA.drop(null, ['below', 'center']);
        return expect(foo.handleFoo).toHaveBeenCalledWith(imageA, null, null);
    });

    return it('should do nothing if the `drop` behavior is not allowed', function() {

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));

        // Create 2 elements that can be dropped on each other (we can't use
        // Element instances so we use Image elements instead).
        const imageA = new ContentEdit.Image();
        region.attach(imageA);

        const imageB = new ContentEdit.Image();
        region.attach(imageB);

        // Disallow imageA accepting drops
        imageA.can('drop', false);

        // Spy on the dropper function
        spyOn(ContentEdit.Image.droppers, 'Image');

        // Drop the image
        imageA.drop(imageB, ['below', 'center']);
        return expect(ContentEdit.Image.droppers['Image']).not.toHaveBeenCalled();
    });
});


describe('ContentEdit.Element.focus()', function() {

    it('should focus an element', function() {

        // Create and focus an element
        const element = new ContentEdit.Element('div');
        element.focus();
        return expect(element.isFocused()).toBe(true);
    });

    return it('should trigger the `focus` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the focus event
        const root = ContentEdit.Root.get();
        root.bind('focus', foo.handleFoo);

        // Detach the node
        const element = new ContentEdit.Element('div');
        element.focus();
        return expect(foo.handleFoo).toHaveBeenCalledWith(element);
    });
});


describe('ContentEdit.Element.hasCSSClass()', () => it('should return true if the element has the specified class', function() {

    // Create an element and add some classes
    const element = new ContentEdit.Element('div');
    element.addCSSClass('foo');
    element.addCSSClass('bar');

    expect(element.hasCSSClass('foo')).toBe(true);
    return expect(element.hasCSSClass('bar')).toBe(true);
}));


describe('ContentEdit.Element.merge()', function() {

    it(`should select a function from the elements mergers map for the element \
being merged with this element`, function() {

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));

        // Create 2 elements that can be merged with each other (we can't use
        // Element instances so we use text elements instead).
        const textA = new ContentEdit.Text('p', {}, 'a');
        region.attach(textA);

        const textB = new ContentEdit.Text('p', {}, 'b');
        region.attach(textB);

        // Spy on the merger function
        spyOn(ContentEdit.Text.mergers, 'Text');

        // Drop the image
        textA.merge(textB);

        return expect(
            ContentEdit.Text.mergers['Text']
            ).toHaveBeenCalledWith(textB, textA);
    });

    return it('should do nothing if the `merge` behavior is not allowed', function() {

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));

        // Create 2 elements that can be merged with each other (we can't use
        // Element instances so we use text elements instead).
        const textA = new ContentEdit.Text('p', {}, 'a');
        region.attach(textA);

        const textB = new ContentEdit.Text('p', {}, 'b');
        region.attach(textB);

        // Disallow merge for textA
        textA.can('merge', false);

        // Spy on the merger function
        spyOn(ContentEdit.Text.mergers, 'Text');

        // Drop the image
        textA.merge(textB);

        return expect(ContentEdit.Text.mergers['Text']).not.toHaveBeenCalled();
    });
});


describe('ContentEdit.Element.mount()', function() {

    let element = null;
    let region = null;

    beforeEach(function() {
        element = new ContentEdit.Element('p');

        // Mount the element
        region = new ContentEdit.Region(document.createElement('div'));
        region.attach(element);
        return element.unmount();
    });

    it('should mount the element to the DOM', function() {
        element.mount();
        return expect(element.isMounted()).toBe(true);
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

        // Mount the element
        element.mount();
        return expect(foo.handleFoo).toHaveBeenCalledWith(element);
    });
});


describe('ContentEdit.Element.removeAttr()', () => it('should remove an attribute from the element', function() {
    // Create a node and set an attribute against it
    const element = new ContentEdit.Element('div');
    element.attr('foo', 'bar');
    expect(element.attr('foo')).toBe('bar');

    element.removeAttr('foo');
    return expect(element.attr('foo')).toBe(undefined);
}));


describe('ContentEdit.Element.removeCSSClass()', () => it('should remove a CSS class from the element', function() {

    // Create an element and add CSS classes to it
    const element = new ContentEdit.Element('div');
    element.addCSSClass('foo');
    element.addCSSClass('bar');
    expect(element.hasCSSClass('foo')).toBe(true);
    expect(element.hasCSSClass('bar')).toBe(true);

    // Remove the classes from the element
    element.removeCSSClass('foo');
    element.hasCSSClass('foo');

    element.removeCSSClass('bar');
    return expect(element.hasCSSClass('bar')).toBe(false);
}));


describe('ContentEdit.Element.tagName()', () => it('should set/get the tag name for the element', function() {

    const element = new ContentEdit.Element('div');
    expect(element.tagName()).toBe('div');

    // Change the tag name
    element.tagName('dt');
    return expect(element.tagName()).toBe('dt');
}));


describe('ContentEdit.Element.unmount()', function() {

    let element = null;
    let region = null;

    beforeEach(function() {
        element = new ContentEdit.Element('p');

        // Mount the element
        region = new ContentEdit.Region(document.createElement('div'));
        return region.attach(element);
    });

    it('should unmount the element from the DOM', function() {
        element.unmount();
        return expect(element.isMounted()).toBe(false);
    });

    return it('should trigger the `unmount` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the unmount event
        const root = ContentEdit.Root.get();
        root.bind('unmount', foo.handleFoo);

        // Mount the element
        element.unmount();
        return expect(foo.handleFoo).toHaveBeenCalledWith(element);
    });
});


describe('ContentEdit.Element.@getDOMElementAttributes()', () => it('should return attributes from a DOM element as a dictionary', function() {

    // Create a DOM element and set a number of attributes
    const domElement = document.createElement('div');
    domElement.setAttribute('class', 'foo');
    domElement.setAttribute('id', 'bar');
    domElement.setAttribute('contenteditable', '');

    const attributes = ContentEdit.Element.getDOMElementAttributes(domElement);
    return expect(attributes).toEqual({
        'class': 'foo',
        'id': 'bar',
        'contenteditable': ''
        });
}));


// ElementCollection

describe('ContentEdit.ElementCollection()', () => it('should create `ContentEdit.ElementCollection` instance`', function() {
    const collection = new ContentEdit.ElementCollection('dl', {'class': 'foo'});
    return expect(collection instanceof ContentEdit.ElementCollection).toBe(true);
}));


describe('ContentEdit.ElementCollection.cssTypeName()', () => it('should return \'element-collection\'', function() {
    const element = new ContentEdit.ElementCollection('div', {'class': 'foo'});
    return expect(element.cssTypeName()).toBe('element-collection');
}));


describe('ContentEdit.ElementCollection.isMounted()', () => it('should return true if the element is mounted in the DOM', function() {

    // We can't test this directly against an ElementColleciton instance as
    // they can't be mounted so instead we use a List element.
    const collection = new ContentEdit.List('ul');
    expect(collection.isMounted()).toBe(false);

    // Mount the element
    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(collection);

    return expect(collection.isMounted()).toBe(true);
}));


describe('ContentEdit.ElementCollection.html()', () => it('should return a HTML string for the collection', function() {

    const collection = new ContentEdit.ElementCollection('div', {'class': 'foo'});
    const text = new ContentEdit.Text('p', {}, 'test');
    collection.attach(text);

    const le = ContentEdit.LINE_ENDINGS;

    return expect(collection.html()).toBe(
        `<div class=\"foo\">${ le }` +
            `${ ContentEdit.INDENT }<p>${ le }` +
            `${ ContentEdit.INDENT }${ ContentEdit.INDENT }test${ le }` +
            `${ ContentEdit.INDENT }</p>${ le }` +
        '</div>'
        );
}));


describe('`ContentEdit.ElementCollection.type()`', () => it('should return \'ElementCollection\'', function() {
    const collection = new ContentEdit.ElementCollection('div', {'class': 'foo'});
    return expect(collection.type()).toBe('ElementCollection');
}));


describe('ContentEdit.ElementCollection.createDraggingDOMElement()', () => it('should create a helper DOM element', function() {
    // Mount a collection and text element
    const collection = new ContentEdit.ElementCollection('div');
    const element = new ContentEdit.Element('p');
    collection.attach(element);

    const region = new ContentEdit.Region(document.createElement('div'));
    region.attach(collection);

    // Get the helper DOM element
    const helper = collection.createDraggingDOMElement();

    expect(helper).not.toBe(null);
    return expect(helper.tagName.toLowerCase()).toBe('div');
}));


describe('ContentEdit.ElementCollection.detach()', function() {

    let collection = null;
    let elementA = null;
    let elementB = null;
    let region = null;

    beforeEach(function() {
        region = new ContentEdit.Region(document.createElement('div'));

        collection = new ContentEdit.ElementCollection('div');
        region.attach(collection);

        elementA = new ContentEdit.Element('p');
        collection.attach(elementA);

        elementB = new ContentEdit.Element('p');
        return collection.attach(elementB);
    });

    it('should detach an element from the element collection', function() {

        // Detach an element
        collection.detach(elementA);
        return expect(collection.children.length).toBe(1);
    });

    it('should remove the collection if it becomes empty', function() {

        // Detach both elements
        collection.detach(elementA);
        collection.detach(elementB);
        return expect(region.children.length).toBe(0);
    });

    return it('should trigger the detach event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the detach event
        const root = ContentEdit.Root.get();
        root.bind('detach', foo.handleFoo);

        // Detach the node
        collection.detach(elementA);
        return expect(foo.handleFoo).toHaveBeenCalledWith(collection, elementA);
    });
});


describe('ContentEdit.ElementCollection.mount()', function() {

    let collection = null;
    let element = null;
    let region = null;

    beforeEach(function() {
        collection = new ContentEdit.ElementCollection('div');
        element = new ContentEdit.Element('p');
        collection.attach(element);

        // Mount the element
        region = new ContentEdit.Region(document.createElement('div'));
        region.attach(collection);
        return element.unmount();
    });

    it('should mount the collection and it\'s children to the DOM', function() {
        collection.mount();
        expect(collection.isMounted()).toBe(true);
        return expect(element.isMounted()).toBe(true);
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

        // Mount the element
        collection.mount();
        expect(foo.handleFoo).toHaveBeenCalledWith(collection);
        return expect(foo.handleFoo).toHaveBeenCalledWith(element);
    });
});


describe('ContentEdit.ElementCollection.unmount()', function() {

    let collection = null;
    let element = null;
    let region = null;

    beforeEach(function() {
        collection = new ContentEdit.ElementCollection('div');
        element = new ContentEdit.Element('p');
        collection.attach(element);

        // Mount the element
        region = new ContentEdit.Region(document.createElement('div'));
        return region.attach(collection);
    });

    it('should unmount the collection and it\'s children from the DOM', function() {
        collection.unmount();
        expect(collection.isMounted()).toBe(false);
        return expect(element.isMounted()).toBe(false);
    });

    return it('should trigger the `unmount` event against the root', function() {

        // Create a function to call when the event is triggered
        const foo = {
            handleFoo() {
            }
        };
        spyOn(foo, 'handleFoo');

        // Bind the function to the root for the unmount event
        const root = ContentEdit.Root.get();
        root.bind('unmount', foo.handleFoo);

        // Mount the element
        collection.unmount();
        expect(foo.handleFoo).toHaveBeenCalledWith(collection);
        return expect(foo.handleFoo).toHaveBeenCalledWith(element);
    });
});


// ResizableElement

describe('ContentEdit.ResizableElement()', () => it('should create `ContentEdit.ResizableElement` instance`', function() {
    const element = new ContentEdit.ResizableElement('div', {'class': 'foo'});
    return expect(element instanceof ContentEdit.ResizableElement).toBe(true);
}));


describe('ContentEdit.ResizableElement.aspectRatio()', () => it('should return the 1', function() {
    const element = new ContentEdit.ResizableElement('div');
    return expect(element.aspectRatio()).toBe(1);
}));


describe('ContentEdit.ResizableElement.maxSize()', function() {

    let element = null;
    beforeEach(() => element = new ContentEdit.ResizableElement('div', {
        'height': 200,
        'width': 200
        }));

    it('should return the default maximum element size for an element', () => expect(element.maxSize()).toEqual([
        ContentEdit.DEFAULT_MAX_ELEMENT_WIDTH,
        ContentEdit.DEFAULT_MAX_ELEMENT_WIDTH
        ]));

    return it('should return the specified maximum element size for an element', function() {
        element.attr('data-ce-max-width', 1000);
        return expect(element.maxSize()).toEqual([1000, 1000]);
});
});


describe('ContentEdit.ResizableElement.minSize()', function() {

    let element = null;
    beforeEach(() => element = new ContentEdit.ResizableElement('div', {
        'height': 200,
        'width': 200
        }));

    it('should return the default minimum element size for an element', () => expect(element.minSize()).toEqual([
        ContentEdit.DEFAULT_MIN_ELEMENT_WIDTH,
        ContentEdit.DEFAULT_MIN_ELEMENT_WIDTH
        ]));

    return it('should return the specified minimum element size for an element', function() {
        element.attr('data-ce-min-width', 100);
        return expect(element.minSize()).toEqual([100, 100]);
});
});


describe('`ContentEdit.ResizableElement.type()`', () => it('should return \'ResizableElement\'', function() {
    const element = new ContentEdit.ResizableElement('div', {'class': 'foo'});
    return expect(element.type()).toBe('ResizableElement');
}));


describe('ContentEdit.ResizableElement.mount()', function() {

    let element = null;
    let region = null;

    beforeEach(function() {
        element = new ContentEdit.ResizableElement('div', {
            'height': 200,
            'width': 200
            });

        // Mount the element
        region = new ContentEdit.Region(document.createElement('div'));
        region.attach(element);
        return element.unmount();
    });

    it('should mount the element to the DOM and set the size attribute', function() {
        element.mount();
        expect(element.isMounted()).toBe(true);

        const size = element.domElement().getAttribute('data-ce-size');
        return expect(size).toBe('w 200 × h 200');
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

        // Mount the element
        element.mount();
        return expect(foo.handleFoo).toHaveBeenCalledWith(element);
    });
});


describe('ContentEdit.Element.resize()', function() {

    it('should call `startResizing` against the root element', function() {

        const element = new ContentEdit.ResizableElement('div', {
            'height': 200,
            'width': 200
            });

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));
        region.attach(element);

        // Spy on the startDragging method of root
        const root = ContentEdit.Root.get();
        spyOn(root, 'startResizing');

        // Drag the element
        element.resize(['top', 'left'], 0, 0);

        return expect(root.startResizing).toHaveBeenCalledWith(
            element,
            ['top', 'left'],
            0,
            0,
            true // Fixed aspect ratio
            );
    });

    return it('should do nothing if the `resize` behavior is not allowed', function() {

        const element = new ContentEdit.ResizableElement('div', {
            'height': 200,
            'width': 200
            });

        // Disallow resizing of the element
        element.can('resize', false);

        // Mount the element
        const region = new ContentEdit.Region(document.createElement('div'));
        region.attach(element);

        // Spy on the startDragging method of root
        const root = ContentEdit.Root.get();
        spyOn(root, 'startResizing');

        // Drag the element
        element.resize(['top', 'left'], 0, 0);

        return expect(root.startResizing).not.toHaveBeenCalled();
    });
});


describe('ContentEdit.Element.size()', () => it('should set/get the size of the element', function() {

    const element = new ContentEdit.ResizableElement('div', {
        'height': 200,
        'width': 200
        });

    // Get the size
    expect(element.size()).toEqual([200, 200]);

    // Set the size of the element
    element.size([100, 100]);
    return expect(element.size()).toEqual([100, 100]);
}));