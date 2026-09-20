import HTMLString from '../../html-string/namespace.js';
import ContentSelect from '../../content-select/content-select.js';
import ContentEdit from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS204: Change includes calls to have a more natural evaluation order
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let Cls$lists = (ContentEdit.List = class List extends ContentEdit.ElementCollection {
    static initClass() {
    
        // Class properties
    
        this.droppers = {
            'Image': ContentEdit.Element._dropBoth,
            'ImageFixture': ContentEdit.Element._dropVert,
            'List': ContentEdit.Element._dropVert,
            'PreText': ContentEdit.Element._dropVert,
            'Static': ContentEdit.Element._dropVert,
            'Text': ContentEdit.Element._dropVert,
            'Video': ContentEdit.Element._dropBoth
        };
    }

    // An editable list (e.g <ol>, <ul>).

    constructor(tagName, attributes) {
        super(tagName, attributes);
    }

    // Read-only properties

    cssTypeName() {
        return 'list';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'List';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'List';
    }

    // Event handlers

    _onMouseOver(ev) {
        // Only support dropping on to the element if it sits at the top level
        if (this.parent().type() === 'ListItem') {
            return;
        }

        super._onMouseOver(ev);

        // Don't highlight that we're over the element
        return this._removeCSSClass('ce-element--over');
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type

        // Create the list
        const list = new (this)(
            domElement.tagName,
            this.getDOMElementAttributes(domElement)
            );

        // Create a list if child nodes we can safely remove whilst iterating
        // through them.
        const childNodes = (Array.from(domElement.childNodes));

        // Parse each item <li> in the list
        for (var childNode of Array.from(childNodes)) {

            // Filter out non-elements
            if (childNode.nodeType !== 1) { // ELEMENT_NODE
                continue;
            }

            // Filter out non-<li> elements
            if (childNode.tagName.toLowerCase() !== 'li') {
                continue;
            }

            // Parse the item
            list.attach(ContentEdit.ListItem.fromDOMElement(childNode));
        }

        // If the list is empty then don't create it
        if (list.children.length === 0) {
            return null;
        }

        return list;
    }
});
Cls$lists.initClass();


// Register `ContentEdit.List` the class with associated tag names
ContentEdit.TagNames.get().register(ContentEdit.List, 'ol', 'ul');


ContentEdit.ListItem = class ListItem extends ContentEdit.ElementCollection {

    // An editable list item (e.g <li>).
    //
    // NOTE: The list item element is a collection of at most 2 elements, an
    // `ContentEdit.ListItemText` and optionally a `ContentEdit.List` item.

    constructor(attributes) {
        super('li', attributes);

        // Add the indent behaviour for list items
        this._behaviours['indent'] = true;
    }

    // Read-only properties

    cssTypeName() {
        return 'list-item';
    }

    list() {
        // Return the list associated with this list item (if there is one)
        if (this.children.length === 2) {
            return this.children[1];
        }
        return null;
    }

    listItemText() {
        // Return the list item text associated with this list item (if there is
        // one).
        if (this.children.length > 0) {
            return this.children[0];
        }
        return null;
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'ListItem';
    }

    // Methods

    html(indent) {
        if (indent == null) { indent = ''; }
        const lines = [
            `${ indent }<li${ this._attributesToString() }>`
            ];
        if (this.listItemText()) {
            lines.push(this.listItemText().html(indent + ContentEdit.INDENT));
        }
        if (this.list()) {
            lines.push(this.list().html(indent + ContentEdit.INDENT));
        }
        lines.push(`${ indent }</li>`);
        return lines.join(ContentEdit.LINE_ENDINGS);
    }

    indent() {
        // Indent the list item
        if (!this.can('indent')) {
            return;
        }

        // The first item in a list can't be indented
        if (this.parent().children.indexOf(this) === 0) {
            return;
        }

        // Add the item to the previous items list, if the previous item doesn't
        // have a list add one.
        const sibling = this.previousSibling();
        if (!sibling.list()) {
            sibling.attach(new ContentEdit.List(sibling.parent().tagName()));
        }

        this.listItemText().storeState();

        this.parent().detach(this);
        sibling.list().attach(this);

        return this.listItemText().restoreState();
    }

    remove() {
        // Remove the item from the list
        if (!this.parent()) {
            return;
        }

        const index = this.parent().children.indexOf(this);

        // If the list item has children move them into the parent list
        if (this.list()) {
            // NOTE: `slice` used to create a copy for safe iteration
            // over a changing list.
            const iterable = this.list().children.slice();
            for (let i = 0; i < iterable.length; i++) {
                var child = iterable[i];
                child.parent().detach(child);
                this.parent().attach(child, i + index);
            }
        }
        return this.parent().detach(this);
    }

    unindent() {
        // Unindent the list item
        let sibling;
        if (!this.can('indent')) {
            return;
        }

        const parent = this.parent();
        const grandParent = parent.parent();

        // Extract a list of all the siblings that follow the item
        const siblings = parent.children.slice(
            parent.children.indexOf(this) + 1,
            parent.children.length
            );

        if (grandParent.type() === 'ListItem') {
            // Move the item to the same level as it's parent
            this.listItemText().storeState();

            // Move the item into it's parents list
            parent.detach(this);
            grandParent.parent().attach(
                this,
                grandParent.parent().children.indexOf(grandParent) + 1
                );

            // Indent all the siblings that follow the item so that they become
            // it's children.
            if (siblings.length && !this.list()) {
                this.attach(new ContentEdit.List(parent.tagName()));
            }

            for (sibling of Array.from(siblings)) {
                sibling.parent().detach(sibling);
                this.list().attach(sibling);
            }

            return this.listItemText().restoreState();

        } else {
            // Cast the item as a text element (<P>)
            let child, list;
            const text = new ContentEdit.Text(
                'p',
                this.attr('class') ? {'class': this.attr('class')} : {},
                this.listItemText().content
                );

            // Remember the current selection (if focused so we can restore after
            // performing the indent.
            let selection = null;
            if (this.listItemText().isFocused()) {
                selection = ContentSelect.Range.query(
                    this.listItemText().domElement()
                    );
            }

            // Before we remove the list item determine the index to insert the
            // replacement text element at.
            const parentIndex = grandParent.children.indexOf(parent);
            const itemIndex = parent.children.indexOf(this);

            // First or only - insert the new text element before the grand
            // parent.
            if (itemIndex === 0) {

                // If this is the only element in the list remove the list else
                // just the item.
                list = null;
                if (parent.children.length === 1) {
                    // If there are children then we need to create a new list to
                    // insert them into once the items parent has been detached.
                    if (this.list()) {
                        list = new ContentEdit.List(parent.tagName());
                    }

                    grandParent.detach(parent);

                } else {
                    parent.detach(this);
                }

                // Insert the converted text element (and new list if there is
                // one).
                grandParent.attach(text, parentIndex);
                if (list) {
                    grandParent.attach(list, parentIndex + 1);
                }

                // If the list item has children move them into the parent list
                if (this.list()) {
                    // NOTE: `slice` used to create a copy for safe iteration
                    // over a changing list.
                    const iterable = this.list().children.slice();
                    for (let i = 0; i < iterable.length; i++) {
                        child = iterable[i];
                        child.parent().detach(child);
                        if (list) {
                            list.attach(child);
                        } else {
                            parent.attach(child, i);
                        }
                    }
                }

            // Last - insert the new text element after the grand parent
            } else if (itemIndex === (parent.children.length - 1)) {

                // Insert the converted text element
                parent.detach(this);
                grandParent.attach(text, parentIndex + 1);

                // If the list item has children insert them as a new list in the
                // grand parent.
                if (this.list()) {
                    grandParent.attach(this.list(), parentIndex + 2);
                }

            // Middle - split the parent list and insert the element between
            } else {

                // Insert the converted text element
                parent.detach(this);
                grandParent.attach(text, parentIndex + 1);

                // Move the children and siblings to a new list after the new
                // text element
                list = new ContentEdit.List(parent.tagName());
                grandParent.attach(list, parentIndex + 2);

                // Children
                if (this.list()) {
                    // NOTE: `slice` used to create a copy for safe iteration
                    // over a changing list.
                    for (child of Array.from(this.list().children.slice())) {
                        child.parent().detach(child);
                        list.attach(child);
                    }
                }

                // Siblings
                for (sibling of Array.from(siblings)) {
                    sibling.parent().detach(sibling);
                    list.attach(sibling);
                }
            }

            // Restore selection
            if (selection) {
                text.focus();
                return selection.select(text.domElement());
            }
        }
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

        // Create the list item
        const listItem = new (this)(this.getDOMElementAttributes(domElement));

        // Build the text content for the list item by iterating over the nodes
        // and ignoring any lists. If we do find lists, keep a reference to the
        // first one (we only allow one list per list item) so that we can add it
        // next.
        let content = '';
        let listDOMElement = null;
        for (var childNode of Array.from(domElement.childNodes)) {
            if (childNode.nodeType === 1) { // ELEMENT_NODE

                // Check for lists
                var needle;
                if ((needle = childNode.tagName.toLowerCase(), ['ul', 'ol', 'li'].includes(needle))) {

                    // Keep a reference to the first list found
                    if (!listDOMElement) {
                        listDOMElement = childNode;
                    }

                } else {
                    content += childNode.outerHTML;
                }
            } else {
                content += HTMLString.String.encode(childNode.textContent);
            }
        }

        content = content.replace(/^\s+|\s+$/g, '');

        const listItemText = new ContentEdit.ListItemText(content);
        listItem.attach(listItemText);

        // List
        if (listDOMElement) {
            const listElement = ContentEdit.List.fromDOMElement(listDOMElement);
            listItem.attach(listElement);
        }

        return listItem;
    }
};


Cls$lists = (ContentEdit.ListItemText = class ListItemText extends ContentEdit.Text {
    static initClass() {
    
        // Class properties
    
        this.droppers = {
    
            'ListItemText'(element, target, placement) {
                const elementParent = element.parent();
                const targetParent = target.parent();
    
                // Remove the list item from the
                elementParent.remove();
                elementParent.detach(element);
                const listItem = new ContentEdit.ListItem(elementParent._attributes);
                listItem.attach(element);
    
                // If the drop target has children and we're dropping below add it as
                // the first item in the associated list.
                if (targetParent.list() && (placement[0] === 'below')) {
                    targetParent.list().attach(listItem, 0);
                    return;
                }
    
                // Get the position of the target element we're dropping on to
                let insertIndex = targetParent.parent().children.indexOf(targetParent);
    
                // Determine which side of the target to drop the element
                if (placement[0] === 'below') {
                    insertIndex += 1;
                }
    
                // Drop the element into it's new position
                return targetParent.parent().attach(listItem, insertIndex);
            },
    
            'Text'(element, target, placement) {
                // Text > ListItem
                let cssClass, insertIndex;
                if (element.type() === 'Text') {
                    const targetParent = target.parent();
    
                    // Remove the text element
                    element.parent().detach(element);
    
                    // Convert the text item to a list item
                    cssClass = element.attr('class');
                    const listItem = new ContentEdit.ListItem(
                        cssClass ? {'class': cssClass} : {}
                        );
                    listItem.attach(new ContentEdit.ListItemText(element.content));
    
                    // If the drop target has children and we're dropping below add
                    // it as the first item in the associated list.
                    if (targetParent.list() && (placement[0] === 'below')) {
                        targetParent.list().attach(listItem, 0);
                        return;
                    }
    
                    // Get the position of the target element we're dropping on to
                    insertIndex = targetParent.parent().children.indexOf(
                        targetParent
                        );
    
                    // Determine which side of the target to drop the element
                    if (placement[0] === 'below') {
                        insertIndex += 1;
                    }
    
                    // Drop the element into it's new position
                    targetParent.parent().attach(listItem, insertIndex);
    
                    // Focus the new text element and set the text caret position
                    listItem.listItemText().focus();
                    if (element._savedSelection) {
                        return element._savedSelection.select(
                            listItem.listItemText().domElement()
                            );
                    }
    
                // ListItem > Text
                } else {
                    // Convert the list item text to a text element
                    cssClass = element.attr('class');
                    const text = new ContentEdit.Text(
                        'p',
                        cssClass ? {'class': cssClass} : {},
                        element.content
                        );
    
                    // Remove the list item
                    element.parent().remove();
    
                    // Insert the text element
                    insertIndex = target.parent().children.indexOf(target);
    
                    // Determine which side of the target to drop the element
                    if (placement[0] === 'below') {
                        insertIndex += 1;
                    }
    
                    // Drop the element into it's new position
                    target.parent().attach(text, insertIndex);
    
                    // Focus the new text element and set the text caret position
                    text.focus();
                    if (element._savedSelection) {
                        return element._savedSelection.select(text.domElement());
                    }
                }
            }
        };
    
        this.mergers = {
             // ListItemText + Text
            'ListItemText'(element, target) {
    
                // Remember the target's length so we can offset the text caret to
                // the merge point.
                const offset = target.content.length();
    
                // Add the element's content to the end of the target's
                if (element.content.length()) {
                    target.content = target.content.concat(element.content);
                }
    
                // Update the targets HTML
                if (target.isMounted()) {
                    target._domElement.innerHTML = target.content.html();
                }
    
                // Focus the target and set the text caret position
                target.focus();
                new ContentSelect.Range(offset, offset).select(target._domElement);
    
                // Text > ListItemText - just remove the existing text element
                if (element.type() === 'Text') {
                    if (element.parent()) {
                        element.parent().detach(element);
                    }
    
                // ListItemText > Text - cater for removing the list item
                } else {
                    element.parent().remove();
                }
    
                return target.taint();
            }
        };
    }

    // The text component of an editable list item (e.g <li> -> TEXT_NODE).

    constructor(content) {
        super('div', {}, content);
    }

    // Read-only properties

    cssTypeName() {
        // Return the CSS type modifier name for the element
        // (e.g ce-element--type-list-item-text).
        return 'list-item-text';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'ListItemText';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'List item';
    }

    // Methods

    blur() {
        // Remove focus from the element

        // Remove editing focus from this element
        if (this.content.isWhitespace() && this.can('remove')) {

            // Remove parent list item if empty
            this.parent().remove();

        } else if (this.isMounted()) {
            // Blur the DOM element
            this._domElement.blur();

            // Stop the element from being editable
            this._domElement.removeAttribute('contenteditable');
        }

        return ContentEdit.Element.prototype.blur.call(this);
    }

    can(behaviour, allowed) {
        // The allowed behaviour for a ListItemText instance reflects its parent
        // ListItem and can not be set directly.
        if (allowed) {
            throw new Error('Cannot set behaviour for ListItemText');
        }

        return this.parent().can(behaviour);
    }

    html(indent) {
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

        // Lists support dragging of list items or the root list. The drag is
        // initialized by clicking and holding the mouse down on a list item text
        // element, how long the user holds the mouse down determines which
        // element is dragged (the parent list item or the list root).
        var initDrag = () => {
            if (ContentEdit.Root.get().dragging() === this) {
                // We're currently dragging the list item so switch to dragging
                // the list root.

                // Cancel dragging the list item
                ContentEdit.Root.get().cancelDragging();

                // Find the list root and start dragging it
                const listRoot = this.closest(node => node.parent().type() === 'Region');
                return listRoot.drag(ev.pageX, ev.pageY);

            } else {
                // We're not currently dragging anything so start dragging the
                // list item.
                this.drag(ev.pageX, ev.pageY);

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

    _onMouseMove(ev) {
        // If we're waiting to see if the user wants to drag the element, stop
        // waiting they don't.
        if (this._dragTimeout) {
            clearTimeout(this._dragTimeout);
        }

        return ContentEdit.Element.prototype._onMouseMove.call(this, ev);
    }

    _onMouseUp(ev) {
        // If we're waiting to see if the user wants to drag the element, stop
        // waiting they don't.
        if (this._dragTimeout) {
            clearTimeout(this._dragTimeout);
        }

        return ContentEdit.Element.prototype._onMouseUp.call(this, ev);
    }

    // Key handlers

    _keyTab(ev) {
        ev.preventDefault();

        // Indent/Unindent the list item
        if (ev.shiftKey) {
            return this.parent().unindent();
        } else {
            return this.parent().indent();
        }
    }

    _keyReturn(ev) {
        ev.preventDefault();

        // If the element only contains whitespace unindent it
        if (this.content.isWhitespace()) {
            this.parent().unindent();
            return;
        }

        // Check if we're allowed to spawn new elements
        if (!this.can('spawn')) {
            return;
        }

        // Split the element at the text caret
        ContentSelect.Range.query(this._domElement);
        let selection = ContentSelect.Range.query(this._domElement);
        const tip = this.content.substring(0, selection.get()[0]);
        const tail = this.content.substring(selection.get()[1]);

        // If the user has selected all the list items content then we unindent
        // it. This is the behaviour of a number of mainstream word processors
        // and so we follow their lead here.
        if ((tip.length() + tail.length()) === 0) {
            this.parent().unindent();
            return;
        }

        // Update the contents of this element
        this.content = tip.trim();
        this.updateInnerHTML();

        // Attach the new element
        const grandParent = this.parent().parent();
        const listItem = new ContentEdit.ListItem(
            this.attr('class') ? {'class': this.attr('class')} : {}
            );
        grandParent.attach(
            listItem,
            grandParent.children.indexOf(this.parent()) + 1
            );
        listItem.attach(new ContentEdit.ListItemText(tail.trim()));

        // Move any associated list to the new list item
        const list = this.parent().list();
        if (list) {
            this.parent().detach(list);
            listItem.attach(list);
        }

        // Move the focus and text caret based on the split
        if (tip.length()) {
            listItem.listItemText().focus();
            selection = new ContentSelect.Range(0, 0);
            selection.select(listItem.listItemText().domElement());
        } else {
            selection = new ContentSelect.Range(0, tip.length());
            selection.select(this._domElement);
        }

        return this.taint();
    }
});
Cls$lists.initClass();

// Duplicate mergers for other element types
const _mergers = ContentEdit.ListItemText.mergers;
_mergers['Text'] = _mergers['ListItemText'];
