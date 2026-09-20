import HTMLString from '../../html-string/namespace.js';
import ContentSelect from '../../content-select/content-select.js';
import ContentEdit from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS102: Remove unnecessary code created because of implicit returns
 * DS202: Simplify dynamic range loops
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let Cls$text = (ContentEdit.Text = class Text extends ContentEdit.Element {
    static initClass() {
    
        // Class properties
    
        this.droppers = {
            'Static': ContentEdit.Element._dropVert,
            'Text': ContentEdit.Element._dropVert
        };
    
        this.mergers = {
    
            'Text'(element, target) {
    
                // Remember the target's length so we can offset the text caret to
                // the merge point.
                const offset = target.content.length();
    
                // Add the element's content to the end of the target's
                if (element.content.length()) {
                    target.content = target.content.concat(element.content);
                }
    
                // Update the targets HTML
                if (target.isMounted()) {
                    target.updateInnerHTML();
                }
    
                // Focus the target and set the text caret position
                target.focus();
                new ContentSelect.Range(offset, offset).select(target._domElement);
    
                // Remove the element
                if (element.parent()) {
                    element.parent().detach(element);
                }
    
                // Taint both elements
                return target.taint();
            }
        };
    }

    // An editable body of text (e.g <address>, <blockquote>, <h1-h6>, <p>).

    constructor(tagName, attributes, content) {
        super(tagName, attributes);

        // The content of the text element
        if (content instanceof HTMLString.String) {
            this.content = content;
        } else {
            // Parse the content
            if (ContentEdit.TRIM_WHITESPACE) {
                this.content = new HTMLString.String(content).trim();
            } else {
                this.content = new HTMLString.String(content, true);
            }
        }
    }

    // Read-only properties

    cssTypeName() {
        // Return the CSS type modifier name for the element
        // (e.g ce-element--type-text).
        return 'text';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'Text';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'Text';
    }

    // Methods

    blur() {
        // Remove editing focus from this element

        // Last chance - check for changes in the content not captured before
        // this point.
        if (this.isMounted()) {
            this._syncContent();
        }

        if (this.content.isWhitespace() && this.can('remove')) {
            // Detatch element from parent if empty
            if (this.parent()) {
                this.parent().detach(this);
            }

        } else if (this.isMounted()) {
            // Blur the DOM element

            // HACK: Do nothing if this in InternetExporer which doesn't allow
            // blur to be triggered against the contentediable element
            // programatically and will trigger the following error:
            //
            // `Unexpected call to method or property access.`
            //
            // Which in later versions of the browser (IE11+) cannot be captured.
            if (!document.documentMode &&
                    !/Edge/.test(navigator.userAgent)) {
                this._domElement.blur();
            }

            // Stop the element from being editable
            this._domElement.removeAttribute('contenteditable');
        }

        return super.blur();
    }

    createDraggingDOMElement() {
        // Create a DOM element that visually aids the user in dragging the
        // element to a new location in the editiable tree structure.
        if (!this.isMounted()) {
            return;
        }

        const helper = super.createDraggingDOMElement();

        // Use the body of the node to create the helper but limit the text to
        // something sensible.
        let text = HTMLString.String.encode(this._domElement.textContent);
        if (text.length > ContentEdit.HELPER_CHAR_LIMIT) {
            text = text.substr(0, ContentEdit.HELPER_CHAR_LIMIT);
        }

        helper.innerHTML = text;

        return helper;
    }

    drag(x, y) {
        // Drag the element to a new position
        this.storeState();

        // Prevent content editing whilst the element is being dragged
        this._domElement.removeAttribute('contenteditable');
        return super.drag(x, y);
    }

    drop(element, placement) {
        // Drop the element into a new position in the editable structure
        super.drop(element, placement);
        return this.restoreState();
    }

    focus(supressDOMFocus) {
        // Focus this element for editing

        // Make the element editable if mounted
        if (this.isMounted()) {
            this._domElement.setAttribute('contenteditable', '');
        }

        return super.focus(supressDOMFocus);
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

        const le = ContentEdit.LINE_ENDINGS;
        const attributes = this._attributesToString();
        return `${ indent }<${ this._tagName }${ attributes }>${le}` +
            `${ indent }${ ContentEdit.INDENT }${ this._cached }${le}` +
            `${ indent }</${ this._tagName }>`;
    }

    mount() {
        // Mount the element on to the DOM

        // Create the DOM element to mount
        this._domElement = document.createElement(this._tagName);

        // Set the attributes
        for (var name in this._attributes) {
            var value = this._attributes[name];
            this._domElement.setAttribute(name, value);
        }

        // Set the content in the document
        this.updateInnerHTML();

        return super.mount();
    }

    restoreState() {
        // Restore the text elements state after storeState has been called
        if (!this._savedSelection) {
            return;
        }

        if (!this.isMounted() || !this.isFocused()) {
            this._savedSelection = undefined;
            return;
        }

        this._domElement.setAttribute('contenteditable', '');
        this._addCSSClass('ce-element--focused');

        // If we're restoring the selection state then we need to make sure the
        // element has focus.
        if (document.activeElement !== this.domElement()) {
            this.domElement().focus();
        }

        this._savedSelection.select(this._domElement);
        return this._savedSelection = undefined;
    }

    selection(selection) {
        // Get/Set the content selection for the element
        if (selection === undefined) {
            if (this.isMounted()) {
                return ContentSelect.Range.query(this._domElement);
            } else {
                return new ContentSelect.Range(0, 0);
            }
        }

        return selection.select(this._domElement);
    }

    storeState() {
        // Save the state of the text element so that it can be restored after
        // being unmounted and re-mounted.
        if (!this.isMounted() || !this.isFocused()) {
            return;
        }

        return this._savedSelection = ContentSelect.Range.query(this._domElement);
    }

    unmount() {
        // Unmount the element on from the DOM

        // Remove the contenteditable attribute
        this._domElement.removeAttribute('contenteditable');

        return super.unmount();
    }

    updateInnerHTML() {
        // Update the inner HTML of the DOM element with the elements content
        this._domElement.innerHTML = this.content.html();
        ContentSelect.Range.prepareElement(this._domElement);
        return this._flagIfEmpty();
    }

    // Event handlers

    _onKeyDown(ev) {
        // Handle special key events
        switch (ev.keyCode) {

            // Navigation
            case 40: return this._keyDown(ev);
            case 37: return this._keyLeft(ev);
            case 39: return this._keyRight(ev);
            case 38: return this._keyUp(ev);
            case 9: return this._keyTab(ev);

            // Merging
            case 8: return this._keyBack(ev);
            case 46: return this._keyDelete(ev);

            // Splitting
            case 13: return this._keyReturn(ev);
        }
    }

    _onKeyUp(ev) {
        super._onKeyUp(ev);
        return this._syncContent();
    }

    _onMouseDown(ev) {
        // Give the element focus
        super._onMouseDown(ev);

        // If the user holds the mouse down for an extended period then start
        // dragging the element.
        clearTimeout(this._dragTimeout);
        this._dragTimeout = setTimeout(
            () => {
                return this.drag(ev.pageX, ev.pageY);
            },
            ContentEdit.DRAG_HOLD_DURATION
            );

        // HACK: If the content of the element is empty and it already has focus
        // then supress the event to stop odd behaviour in FireFox. See issue:
        // https://github.com/GetmeUK/ContentTools/issues/118
        //
        // Anthony Blackshaw <ant@getme.co.uk>, 2016-01-30
        if ((this.content.length() === 0) && (ContentEdit.Root.get().focused() === this)) {
            ev.preventDefault();
            if (document.activeElement !== this._domElement) {
                this._domElement.focus();
            }
            return new ContentSelect.Range(0, 0).select(this._domElement);
        }
    }

    _onMouseMove(ev) {
        // If we're waiting to see if the user wants to drag the element, stop
        // waiting they don't.
        if (this._dragTimeout) {
            clearTimeout(this._dragTimeout);
        }

        return super._onMouseMove(ev);
    }

    _onMouseOut(ev) {
        // If we're waiting to see if the user wants to drag the element, stop
        // waiting they don't.
        if (this._dragTimeout) {
            clearTimeout(this._dragTimeout);
        }

        return super._onMouseOut(ev);
    }

    _onMouseUp(ev) {
        // If we're waiting to see if the user wants to drag the element, stop
        // waiting they don't.
        if (this._dragTimeout) {
            clearTimeout(this._dragTimeout);
        }

        return super._onMouseUp(ev);
    }

    // Key handlers

    _keyBack(ev) {
        const selection = ContentSelect.Range.query(this._domElement);
        if ((selection.get()[0] !== 0) || !selection.isCollapsed()) {
            return;
        }

        ev.preventDefault();

        // If we're at the start of the element attempt to find the previous text
        // element and merge with it.
        const previous = this.previousContent();

        // We need to sync the content as this event can occur without a
        // corresponding key up event (e.g the back key was held down).
        this._syncContent();

        if (previous) {
            return previous.merge(this);
        }
    }

    _keyDelete(ev) {
        const selection = ContentSelect.Range.query(this._domElement);
        if (!this._atEnd(selection)|| !selection.isCollapsed()) {
            return;
        }

        ev.preventDefault();

        // If we're at the end of the element attempt to find the next text
        // element and merge with it.
        const next = this.nextContent();
        if (next) {
            return this.merge(next);
        }
    }

    _keyDown(ev) {
        return this._keyRight(ev);
    }

    _keyLeft(ev) {
        let selection = ContentSelect.Range.query(this._domElement);
        if ((selection.get()[0] !== 0) || !selection.isCollapsed()) {
            return;
        }

        // If we're at the start of the element and the selection is collapsed we
        // should navigate to the previous text node.
        ev.preventDefault();

        // Attempt to find and select the previous content element
        const previous = this.previousContent();
        if (previous) {
            previous.focus();
            selection = new ContentSelect.Range(
                previous.content.length(),
                previous.content.length()
                );
            return selection.select(previous.domElement());
        } else {
            // If no element was found this must be the last content node found
            // so trigger an event for external code to manage a region switch.
            return ContentEdit.Root.get().trigger(
                'previous-region',
                this.closest(node => (node.type() === 'Fixture') || (node.type() === 'Region'))
                );
        }
    }

    _keyReturn(ev) {
        ev.preventDefault();

        // If the element only contains whitespace and we're not being asked to
        // insert a line break.
        if (this.content.isWhitespace() &&
                (!ev.shiftKey ^ ContentEdit.PREFER_LINE_BREAKS)) {
            return;
        }

        // Split the element at the text caret
        let selection = ContentSelect.Range.query(this._domElement);
        const tip = this.content.substring(0, selection.get()[0]);
        const tail = this.content.substring(selection.get()[1]);

        // If the shift key is held down or if the preference is to insert
        // line-breaks over new paragraphs then insert a line-break instead of
        // creating a new paragraph.
        if (ev.shiftKey ^ ContentEdit.PREFER_LINE_BREAKS) {
            let insertAt = selection.get()[0];

            // Check if this is the last character in the row
            let lineBreakStr = '<br>';
            if (this.content.length() === insertAt) {
                // HACK: If this is the last character then we'll need to insert
                // two `<br>` if the current last character is not a `<br>`. This
                // appears to be the only way to get the browsers to consistently
                // provide the expected behaviour (see issue #101 on
                // ContentTools).
                if ((this.content.length() === 0) ||
                        !this.content.characters[insertAt - 1].isTag('br')) {
                    lineBreakStr = '<br><br>';
                }
            }

            // Rejoin the content with a line-break
            this.content = this.content.insert(
                insertAt,
                new HTMLString.String(lineBreakStr, true),
                true
                );
            this.updateInnerHTML();

            // Reset the caret's position
            insertAt += 1;
            selection = new ContentSelect.Range(insertAt, insertAt);
            selection.select(this.domElement());

            this.taint();

            return;
        }

        // Check if we're allowed to spawn new elements
        if (!this.can('spawn')) {
            return;
        }

        // Update the contents of this element
        this.content = tip.trim();
        this.updateInnerHTML();

        // Attach the new element
        const element = new this.constructor('p', {}, tail.trim());
        this.parent().attach(element, this.parent().children.indexOf(this) + 1);

        // Move the focus and text caret based on the split
        if (tip.length()) {
            element.focus();
            selection = new ContentSelect.Range(0, 0);
            selection.select(element.domElement());
        } else {
            selection = new ContentSelect.Range(0, tip.length());
            selection.select(this._domElement);
        }

        return this.taint();
    }

    _keyRight(ev) {
        let selection = ContentSelect.Range.query(this._domElement);
        if (!this._atEnd(selection) || !selection.isCollapsed()) {
            return;
        }

        // If we're at the end of the element and the selection is collapsed we
        // should navigate to the next text node.
        ev.preventDefault();

        // Attempt to find and select the next text element
        const next = this.nextContent();
        if (next) {
            next.focus();
            selection = new ContentSelect.Range(0, 0);
            return selection.select(next.domElement());
        } else {
            // If no element was found this must be the last content node found
            // so trigger an event for external code to manage a region switch.
            return ContentEdit.Root.get().trigger(
                'next-region',
                this.closest(node => (node.type() === 'Fixture') || (node.type() === 'Region'))
                );
        }
    }

    _keyTab(ev) {
        ev.preventDefault();

        // If this is a fixture element then we trigger a switch region event to
        // allow external code to manage.
        if (this.isFixed()) {

            // If the shift key is held down then we reverse the switch to the
            // `previous-region` event.
            if (ev.shiftKey) {
                return ContentEdit.Root.get().trigger(
                    'previous-region',
                    this.closest(node => (node.type() === 'Fixture') || (node.type() === 'Region'))
                    );

            } else {
                return ContentEdit.Root.get().trigger(
                    'next-region',
                    this.closest(node => (node.type() === 'Fixture') || (node.type() === 'Region'))
                    );
            }
        }
    }

    _keyUp(ev) {
        return this._keyLeft(ev);
    }

    // Private methods

    _atEnd(selection) {
        // Determine if the cursor/caret starts at the end of the content
        return selection.get()[0] >= this.content.length();
    }

    _flagIfEmpty() {
        // Flag the element as empty if there's no content
        if (this.content.length() === 0) {
            return this._addCSSClass('ce-element--empty');
        } else {
            return this._removeCSSClass('ce-element--empty');
        }
    }

    _syncContent(ev) {
        // Keep the content in sync with the HTML and check if it's been modified
        // by the key events.
        const snapshot = this.content.html();
        this.content = new HTMLString.String(
            this._domElement.innerHTML,
            this.content.preserveWhitespace()
            );

        // If the snap-shot has changed mark the node as modified
        const newSnapshot = this.content.html();
        if (snapshot !== newSnapshot) {
            this.taint();
        }

        return this._flagIfEmpty();
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type
        return new (this)(
            domElement.tagName,
            this.getDOMElementAttributes(domElement),
            domElement.innerHTML.replace(/^\s+|\s+$/g, '')
            );
    }
});
Cls$text.initClass();


// Register `ContentEdit.Text` the class with associated tag names
ContentEdit.TagNames.get().register(
    ContentEdit.Text,
    'address',
    'blockquote',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p'
    );


Cls$text = (ContentEdit.PreText = class PreText extends ContentEdit.Text {
    static initClass() {
    
        // An editable body of preserved text (e.g <pre>).
    
        this.TAB_INDENT = '    ';
    
        // Class properties
    
        this.droppers = {
            'PreText': ContentEdit.Element._dropVert,
            'Static': ContentEdit.Element._dropVert,
            'Text': ContentEdit.Element._dropVert
        };
    
        this.mergers = {};
    }

    constructor(tagName, attributes, content) {
        // The CoffeeScript bypassed Text's constructor entirely and ran
        // Element's directly (`ContentEdit.Element.call(this, ...)`,
        // text.coffee:559), because Text's would trim and re-parse the content
        // and a <pre> must preserve whitespace. An ES class must call its own
        // super, so call it and then restore the untrimmed content -- Text's
        // constructor does nothing else, so the resulting state is identical.
        // The only cost is one redundant HTMLString parse.
        super(tagName, attributes, content);

        // The content of the text element, preserved verbatim.
        if (content instanceof HTMLString.String) {
            this.content = content;
        } else {
            this.content = new HTMLString.String(content, true);
        }
    }

    // Read-only properties

    cssTypeName() {
        // Return the CSS type modifier name for the element
        // (e.g ce-element--type-text).
        return 'pre-text';
    }

    type() {
        // Return the type of element (this should be the same as the class name)
        return 'PreText';
    }

    typeName() {
        // Return the name of the element type (e.g Image, List item)
        return 'Preformatted';
    }

    // Methods

    blur() {
        if (this.isMounted()) {
            this._domElement.innerHTML = this.content.html();
        }

        return super.blur();
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

            // Optimize the content for output
            const content = this.content.copy();
            content.optimize();

            this._lastCached = Date.now();
            this._cached = content.html();
        }

        return `${ indent }<${ this._tagName }${ this._attributesToString() }>` +
            `${ this._cached }</${ this._tagName }>`;
    }

    updateInnerHTML() {
        // Update the inner HTML of the DOM element with the elements content
        const html = this.content.html();
        this._domElement.innerHTML = html;
        this._ensureEndZWS();
        ContentSelect.Range.prepareElement(this._domElement);
        return this._flagIfEmpty();
    }

    // Event handlers

    _keyBack(ev) {

        // If the selection is within the known content behave as normal...
        const selection = ContentSelect.Range.query(this._domElement);
        if (selection.get()[0] <= this.content.length()) {
            return super._keyBack(ev);
        }

        // ...if not set the selection to the end of the string (not the
        // contents).
        selection.set(this.content.length(), this.content.length());
        return selection.select(this._domElement);
    }

    // Key events

    _keyReturn(ev) {
        ev.preventDefault();

        // Insert a `\n` character at the current position
        const selection = ContentSelect.Range.query(this._domElement);
        let cursor = selection.get()[0] + 1;

        // Depending on the selection determine how best to insert the content
        if ((selection.get()[0] === 0) && selection.isCollapsed()) {
            this.content = new HTMLString.String('\n', true).concat(this.content);

        } else if (this._atEnd(selection) && selection.isCollapsed()) {
            this.content = this.content.concat(new HTMLString.String('\n', true));

        } else if ((selection.get()[0] === 0) &&
                    (selection.get()[1] === this.content.length())) {
            this.content = new HTMLString.String('\n', true);
            cursor = 0;

        } else {
            const tip = this.content.substring(0, selection.get()[0]);
            const tail = this.content.substring(selection.get()[1]);
            this.content = tip.concat(new HTMLString.String('\n', true), tail);
        }

        this.updateInnerHTML();

        // Restore the selection
        selection.set(cursor, cursor);
        selection.select(this._domElement);

        return this.taint();
    }

    _keyTab(ev) {
        let i, indentHTML, selectionOffset;
        ev.preventDefault();

        // Measure the length of the block before the indentation
        const blockLength = this.content.length();

        // Indent/Unindent the selected block of text
        const indentText = ContentEdit.PreText.TAB_INDENT;
        let indentLength = indentText.length;

        // Split the current content into lines
        const lines = this.content.split('\n');

        // Determine the first and last line within the selection
        const selection = this.selection().get();

        // Ensure the selection doesn't overshoot the block content
        selection[0] = Math.min(selection[0], blockLength);
        selection[1] = Math.min(selection[1], blockLength);

        let charIndex = 0;
        let startLine = -1;
        let endLine = -1;
        for (i = 0; i < lines.length; i++) {
            // We add +1 to the line length to account for the new line character
            var line = lines[i];
            var lineLength = (line.length() + 1);

            if (selection[0] < (charIndex + lineLength)) {
                if (startLine === -1) {
                    startLine = i;
                }
            }

            if (selection[1] < (charIndex + lineLength)) {
                if (endLine === -1) {
                    endLine = i;
                }
            }

            if ((startLine > -1) && (endLine > -1)) {
                break;
            }

            charIndex += lineLength;
        }

        if (startLine === endLine) {
            // If a single line is selected then indent from the start of the
            // current selection to the nearest indent multiple.

            // Modify the indent length to indent the line to the next indent
            // point.
            indentLength -= (selection[0] - charIndex) % indentLength;
            indentHTML = new HTMLString.String(
                Array(indentLength + 1).join(' '),
                true
                );

            // Insert the indent within the string
            const tip = lines[startLine].substring(0, selection[0] - charIndex);
            const tail = lines[startLine].substring(selection[1] - charIndex);
            lines[startLine] = tip.concat(indentHTML, tail);

            // Set the selection offset to the full/partial indent length
            selectionOffset = indentLength;

        } else {
            // If multiple lines are selected then indent/unindent the start of
            // each line.
            if (ev.shiftKey) {
                // Remove a tab indent worth of spaces from the start of each
                // line.
                let asc, end;
                let firstLineShift = 0;
                for (i = startLine, end = endLine, asc = startLine <= end; asc ? i <= end : i >= end; asc ? i++ : i--) {
                    var j;
                    var iterable = lines[i].characters.slice();
                    for (j = 0; j < iterable.length; j++) {
                        var c = iterable[j];
                        if (j > (indentLength - 1)) {
                            break;
                        }
                        if (!c.isWhitespace()) {
                            break;
                        }

                        // Not strictly a nice approach but it's more efficient
                        // than using `substring`.
                        lines[i].characters.shift();
                    }

                    // Store the indent applied to the first line as we need it
                    // to determine the selection start shift.
                    if (i === startLine) {
                        firstLineShift = j;
                    }
                }

                // Flip the `indentLength` to reverse the change in selection
                // direction.
                selectionOffset = Math.max(-indentLength, -firstLineShift);

            } else {
                // Add a tab indent worth of spaces to the start of each line
                let asc1, end1;
                indentHTML = new HTMLString.String(indentText, true);
                for (i = startLine, end1 = endLine, asc1 = startLine <= end1; asc1 ? i <= end1 : i >= end1; asc1 ? i++ : i--) {
                    lines[i] = indentHTML.concat(lines[i]);
                }

                // Set the selection offset to the full indent length
                selectionOffset = indentLength;
            }
        }

        // Update the content in the DOM
        this.content = HTMLString.String.join(
            new HTMLString.String('\n', true),
            lines
            );
        this.updateInnerHTML();

        // Restore the selection
        const selectionLength = this.content.length() - blockLength;
        return new ContentSelect.Range(
            selection[0] + selectionOffset,
            selection[1] + selectionLength
            ).select(this._domElement);
    }

    // Private methods

    _syncContent(ev) {
        this._ensureEndZWS();

        // Keep the content in sync with the HTML and check if it's been modified
        // by the key events.
        const snapshot = this.content.html();
        this.content = new HTMLString.String(
            this._domElement.innerHTML.replace(/\u200B$/g, ''),
            this.content.preserveWhitespace()
            );

        // If the snap-shot has changed mark the node as modified
        const newSnapshot = this.content.html();
        if (snapshot !== newSnapshot) {
            this.taint();
        }

        return this._flagIfEmpty();
    }

    _ensureEndZWS() {
        // HACK: Append an zero-width-space (ZWS) character to the DOM elements
        // inner HTML to ensure the caret position moves when a newline is added
        // to the end of the content (e.g if the user hits the return key - see
        // issue #54).

        // Check we need to add the ZWS
        if (!this._domElement.lastChild) {
            return;
        }

        const html = this._domElement.innerHTML;
        if (html[html.length - 1] === '\u200B') {
            if (html.indexOf('\u200B') < (html.length - 1)) {
                return;
            }
        }

        // Add the ZWS and restore the state (only if the state isn't already
        // set).
        const _addZWS = () => {
            // Clear any erroneous ZWS characters
            if (html.indexOf('\u200B') > -1) {
                this._domElement.innerHTML = html.replace(/\u200B/g, '');
            }

            // Add the ZWS character as a text node to the end of the element's
            // HTML.
            return this._domElement.lastChild.textContent += '\u200B';
        };

        // Check to see if the state of the element has already been captured or
        // if we need to capture it before updating the the contents.
        if (this._savedSelection) {
            return _addZWS();

        } else {
            this.storeState();
            _addZWS();
            return this.restoreState();
        }
    }

    // Class methods

    static fromDOMElement(domElement) {
        // Convert an element (DOM) to an element of this type
        return new (this)(
            domElement.tagName,
            this.getDOMElementAttributes(domElement),
            domElement.innerHTML
            );
    }
});
Cls$text.initClass();


// Register `ContentEdit.PreText` the class with associated tag names
ContentEdit.TagNames.get().register(ContentEdit.PreText, 'pre');
