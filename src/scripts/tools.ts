import HTMLString from '../../vendor-src/html-string/namespace.js';
import ContentSelect from '../../vendor-src/content-select/content-select.js';
import ContentEdit from '../../vendor-src/content-edit/scripts/namespace.js';
import ContentTools from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS202: Simplify dynamic range loops
 * DS204: Change includes calls to have a more natural evaluation order
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
let Cls$tools: any = (ContentTools.ToolShelf = class ToolShelf {
    static declare _tools: any;

    static initClass() {
    
        // The `ToolShelf` class allows tools to be stored using a name (string) as a
        // reference. Using a tools name makes is cleaner when defining a set of
        // tools to populate the `ToolboxUI` widget.
    
        this._tools = {};
    }

    static stow(cls, name) {
        // Stow a tool on the shelf

        return this._tools[name] = cls;
    }

    static fetch(name) {
        // Fetch a tool from the shelf by it's name
        if (!this._tools[name]) {
            throw new Error(`\`${name}\` has not been stowed on the tool shelf`);
        }

        return this._tools[name];
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tool = class Tool {
    static declare icon: any;
    static declare label: any;
    static declare requiresElement: any;

    static initClass() {
    
        // The `Tool` class defines a common API for editor tools. All tools should
        // inherit from the `Tool` class.
        //
        // Tools classes are designed to be used direct not as instances of the
        // class, every property and method for a tool is held against the class.
        //
        // A tool is effectively a collection of functions (class methods) with a set
        // of configuration settings (class properties). For this reason they are
        // defined using static classes.
    
        this.label = 'Tool';
        this.icon = 'tool';
    
        // Most tools require an element that they can be applied to, but there are
        // exceptions (such as undo/redo). In these cases you can set the
        // `requiresElement` flag to false so that the toolbox will not automatically
        // disable the tool because there is not element focused.
        this.requiresElement = true;
    }

    // Class methods

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the specified
        // element and selection.
        return false;
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the specified
        // element and selection.
        return false;
    }

    static apply(element, selection, callback) {
        // Apply the tool to the specified element and selection
        throw new Error('Not implemented');
    }

    static editor() {
        // Return an instance of the ContentTools.EditorApp
        return ContentTools.EditorApp.get();
    }

    static dispatchEditorEvent(name, detail) {
        // Dispatch an event against the editor
        return this.editor().dispatchEvent(this.editor().createEvent(name, detail));
    }

    // Private class methods

    static _insertAt(element) {
        // Find insert node and index for inserting an element after the
        // specified element.

        let insertNode = element;
        if (insertNode.parent().type() !== 'Region') {
            insertNode = element.closest(node => node.parent().type() === 'Region');
        }

        const insertIndex = insertNode.parent().children.indexOf(insertNode) + 1;

        return [insertNode, insertIndex];
    }
});
Cls$tools.initClass();


// Common tools

Cls$tools = (ContentTools.Tools.Bold = class Bold extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Make the current selection of text (non)bold (e.g <b>foo</b>).
    
        ContentTools.ToolShelf.stow(this, 'bold');
    
        this.label = 'Bold';
        this.icon = 'bold';
        this.tagName = 'b';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        if (!element.content) {
            return false;
        }

        return selection && !selection.isCollapsed();
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the current
        // element/selection.
        if ((element.content === undefined) || !element.content.length()) {
            return false;
        }

        let [from, to] = Array.from<any>(selection.get());
        if (from === to) {
            to += 1;
        }

        return element.content.slice(from, to).hasTags(this.tagName, true);
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        element.storeState();

        const [from, to] = Array.from<any>(selection.get());

        if (this.isApplied(element, selection)) {
            element.content = element.content.unformat(
                from,
                to,
                new HTMLString.Tag(this.tagName)
                );
        } else {
            element.content = element.content.format(
                from,
                to,
                new HTMLString.Tag(this.tagName)
                );
        }

        element.content.optimize();
        element.updateInnerHTML();
        element.taint();

        element.restoreState();

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Italic = class Italic extends ContentTools.Tools.Bold {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Make the current selection of text (non)italic (e.g <i>foo</i>).
    
        ContentTools.ToolShelf.stow(this, 'italic');
    
        this.label = 'Italic';
        this.icon = 'italic';
        this.tagName = 'i';
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Link = class Link extends ContentTools.Tools.Bold {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Insert/Remove a link.
    
        ContentTools.ToolShelf.stow(this, 'link');
    
        this.label = 'Link';
        this.icon = 'link';
        this.tagName = 'a';
    }

    static getAttr(attrName, element, selection) {
        // Get an attribute for the element and selection

        // Images
        if (element.type() === 'Image') {
            if (element.a) {
                return element.a[attrName];
            }

        // Fixtures
        } else if (element.isFixed() && (element.tagName() === 'a')) {
            return element.attr(attrName);

        // Text
        } else {
            // Find the first character in the selected text that has an `a` tag
            // and return the named attributes value.
            const [from, to] = Array.from<any>(selection.get());
            const selectedContent = element.content.slice(from, to);
            for (var c of Array.from<any>(selectedContent.characters)) {
                if (!c.hasTags('a')) {
                    continue;
                }

                for (var tag of Array.from<any>(c.tags())) {
                    if (tag.name() === 'a') {
                        return tag.attr(attrName);
                    }
                }
            }
        }

        return '';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        if (element.type() === 'Image') {
            return true;
        } else if (element.isFixed() && (element.tagName() === 'a')) {
            return true;
        } else {
            // Must support content
            if (!element.content) {
                return false;
            }

            // A selection must exist
            if (!selection) {
                return false;
            }

            // If the selection is collapsed then it must be within an existing
            // link.
            if (selection.isCollapsed()) {
                const character = element.content.characters[selection.get()[0]];
                if (!character || !character.hasTags('a')) {
                    return false;
                }
            }

            return true;
        }
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the current
        // element/selection.
        if (element.type() === 'Image') {
            return element.a;
        } else if (element.isFixed() && (element.tagName() === 'a')) {
            return true;
        } else {
            return super.isApplied(element, selection);
        }
    }

    static apply(element, selection, callback) {
        // Dispatch `apply` event
        let allowScrolling, characters, from, rect, selectTag, to, transparent;
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        let applied = false;

        // Prepare text elements for adding a link
        if (element.type() === 'Image') {
            // Images
            rect = element.domElement().getBoundingClientRect();

        } else if (element.isFixed() && (element.tagName() === 'a')) {
            // Fixtures
            rect = element.domElement().getBoundingClientRect();

        } else {
            // If the selection is collapsed then we need to select the entire
            // entire link.
            if (selection.isCollapsed()) {

                // Find the bounds of the link
                ({
                    characters
                } = element.content);
                let starts = selection.get(0)[0];
                let ends = starts;

                while ((starts > 0) && characters[starts - 1].hasTags('a')) {
                    starts -= 1;
                }

                while ((ends < characters.length) && characters[ends].hasTags('a')) {
                    ends += 1;
                }

                // Select the link in full
                selection = new ContentSelect.Range(starts, ends);
                selection.select(element.domElement());
            }

            // Text elements
            element.storeState();

            // Add a fake selection wrapper to the selected text so that it
            // appears to be selected when the focus is lost by the element.
            selectTag = new HTMLString.Tag('span', {'class': 'ct--pseudo-select'});
            [from, to] = Array.from<any>(selection.get());
            element.content = element.content.format(from, to, selectTag);
            element.updateInnerHTML();

            // Measure a rectangle of the content selected so we can position the
            // dialog centrally.
            const domElement = element.domElement();
            const measureSpan = domElement.getElementsByClassName('ct--pseudo-select');
            rect = measureSpan[0].getBoundingClientRect();
        }

        // Set-up the dialog
        const app = ContentTools.EditorApp.get();

        // Modal
        const modal = new ContentTools.ModalUI((transparent=true), (allowScrolling=true));

        // When the modal is clicked on the dialog should close
        modal.addEventListener('click', function() {
            this.unmount();
            dialog.hide();

            if (element.content) {
                // Remove the fake selection from the element
                element.content = element.content.unformat(from, to, selectTag);
                element.updateInnerHTML();

                // Restore the selection
                element.restoreState();
            }

            callback(applied);

            // Dispatch `applied` event
            if (applied) {
                return ContentTools.Tools.Link.dispatchEditorEvent(
                    'tool-applied',
                    toolDetail
                    );
            }
        });

        // Dialog
        var dialog = new ContentTools.LinkDialog(
            this.getAttr('href', element, selection),
            this.getAttr('target', element, selection)
            );

        // Get the scroll position required for the dialog
        const [scrollX, scrollY] = Array.from<any>(ContentTools.getScrollPosition());

        dialog.position([
            rect.left + (rect.width / 2) + scrollX,
            rect.top + (rect.height / 2) + scrollY
            ]);

        dialog.addEventListener('save', function(ev) {
            const detail = ev.detail();

            applied = true;

            // Add the link
            if (element.type() === 'Image') {

                // Images
                //
                // Note: When we add/remove links any alignment class needs to be
                // moved to either the link (on adding a link) or the image (on
                // removing a link). Alignment classes are mutually exclusive.
                let className;
                const alignmentClassNames = [
                    'align-center',
                    'align-left',
                    'align-right'
                    ];

                if (detail.href) {
                    element.a = {href: detail.href};

                    if (detail.target) {
                        element.a.target = detail.target;
                    }

                    for (className of Array.from<any>(alignmentClassNames)) {
                        if (element.hasCSSClass(className)) {
                            element.removeCSSClass(className);
                            element.a['class'] = className;
                            break;
                        }
                    }

                } else {
                    let linkClasses = [];
                    if (element.a['class']) {
                        linkClasses = element.a['class'].split(' ');
                    }
                    for (className of Array.from<any>(alignmentClassNames)) {
                        if (linkClasses.indexOf(className) > -1) {
                            element.addCSSClass(className);
                            break;
                        }
                    }
                    element.a = null;
                }

                element.unmount();
                element.mount();

            } else if (element.isFixed() && (element.tagName() === 'a')) {
                // Fixtures
                element.attr('href', detail.href);

            } else {
                // Text elements

                // Attempt to find any existing tag
                let firstATag = null;
                for (let i = from, end = to, asc = from <= end; asc ? i < end : i > end; asc ? i++ : i--) {
                    for (var tag of Array.from<any>(element.content.characters[i].tags())) {
                        if (tag.name() === 'a') {
                            firstATag = tag;
                            break;
                        }
                    }

                    if (firstATag) {
                        break;
                    }
                }

                // Clear any existing link
                element.content = element.content.unformat(from, to, 'a');

                // If specified add the new link
                if (detail.href) {

                    let a;
                    if (firstATag) {
                        a = firstATag.copy();
                    } else {
                        a = new HTMLString.Tag('a');
                    }

                    a.attr('href', detail.href);
                    if (detail.target) {
                        a.attr('target', detail.target);
                    } else {
                        a.removeAttr('target');
                    }

                    console.log(a);

                    element.content = element.content.format(from, to, a);
                    element.content.optimize();
                }

                element.updateInnerHTML();
            }

            // Make sure the element is marked as tainted
            element.taint();

            // Close the modal and dialog
            return modal.dispatchEvent(modal.createEvent('click'));
        });

        app.attach(modal);
        app.attach(dialog);
        modal.show();
        return dialog.show();
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Heading = class Heading extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Convert the current text block to a heading (e.g <h1>foo</h1>)
    
        ContentTools.ToolShelf.stow(this, 'heading');
    
        this.label = 'Heading';
        this.icon = 'heading';
        this.tagName = 'h1';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.

        if (element.isFixed()) {
            return false;
        }

        return (element.content !== undefined) &&
                (['Text', 'PreText'].indexOf(element.type()) !== -1);
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the current
        // element/selection.
        if (!element.content) {
            return false;
        }

        if (['Text', 'PreText'].indexOf(element.type()) === -1) {
            return false;
        }

        return element.tagName() === this.tagName;
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

        // Apply the tool to the current element
        element.storeState();

        // If the tag is a PreText tag then we need to handle the convert the
        // element not just the tag name.
        if (element.type() === 'PreText') {
            // Convert the element to a Text element first
            const content = element.content.html().replace(/&nbsp;/g, ' ');
            const textElement = new ContentEdit.Text(this.tagName, {}, content);

            // Remove the current element from the region
            const parent = element.parent();
            const insertAt = parent.children.indexOf(element);
            parent.detach(element);
            parent.attach(textElement, insertAt);

            // Restore selection
            element.blur();
            textElement.focus();
            textElement.selection(selection);

        } else {
            // Change the text elements tag name

            // Remove any CSS classes from the element
            element.removeAttr('class');

            // If the element already has the same tag name as the tool will
            // apply revert the element to a paragraph.
            if (element.tagName() === this.tagName) {
                element.tagName('p');
            } else {
                element.tagName(this.tagName);
            }

            element.restoreState();
        }

        // Dispatch `applied` event
        this.dispatchEditorEvent('tool-applied', toolDetail);

        return callback(true);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Subheading = class Subheading extends ContentTools.Tools.Heading {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Convert the current text block to a subheading (e.g <h2>foo</h2>)
    
        ContentTools.ToolShelf.stow(this, 'subheading');
    
        this.label = 'Subheading';
        this.icon = 'subheading';
        this.tagName = 'h2';
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Paragraph = class Paragraph extends ContentTools.Tools.Heading {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Convert the current text block to a paragraph (e.g <p>foo</p>)
    
        ContentTools.ToolShelf.stow(this, 'paragraph');
    
        this.label = 'Paragraph';
        this.icon = 'paragraph';
        this.tagName = 'p';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        if (element.isFixed()) {
            return false;
        }

        return element !== undefined;
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element
        const forceAdd = this.editor().ctrlDown();

        if (ContentTools.Tools.Heading.canApply(element) && !forceAdd) {
            // If the element is a top level text element and the user hasn't
            // indicated they want to force add a new paragraph convert it to a
            // paragraph in-place.
            return super.apply(element, selection, callback);
        } else {
            // Dispatch `apply` event
            const toolDetail = {
                'tool': this,
                'element': element,
                'selection': selection
                };
            if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
                return;
            }

            // If the element isn't a text element find the nearest top level
            // node and insert a new paragraph element after it.
            if (element.parent().type() !== 'Region') {
                element = element.closest(node => node.parent().type() === 'Region');
            }

            const region = element.parent();
            const paragraph = new ContentEdit.Text('p');
            region.attach(paragraph, region.children.indexOf(element) + 1);

            // Give the newely inserted paragraph focus
            paragraph.focus();

            callback(true);

            // Dispatch `applied` event
            return this.dispatchEditorEvent('tool-applied', toolDetail);
        }
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Preformatted = class Preformatted extends ContentTools.Tools.Heading {
    static declare icon: any;
    static declare label: any;
    static declare tagName: any;

    static initClass() {
    
        // Convert the current text block to a preformatted block (e.g <pre>foo</pre)
    
        ContentTools.ToolShelf.stow(this, 'preformatted');
    
        this.label = 'Preformatted';
        this.icon = 'preformatted';
        this.tagName = 'pre';
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // If the element is already a PreText element then convert it to a
        // paragraph instead.
        if (element.type() === 'PreText') {
            ContentTools.Tools.Paragraph.apply(element, selection, callback);
            return;
        }

        // Escape the contents of the existing element
        const text = element.content.text();

        // Create a new pre-text element using the current elements content
        const preText = new ContentEdit.PreText(
            'pre', {},
            HTMLString.String.encode(text)
            );

        // Remove the current element from the region
        const parent = element.parent();
        const insertAt = parent.children.indexOf(element);
        parent.detach(element);
        parent.attach(preText, insertAt);

        // Restore selection
        element.blur();
        preText.focus();
        preText.selection(selection);

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.AlignLeft = class AlignLeft extends ContentTools.Tool {
    static declare className: any;
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Apply a class to left align the contents of the current text block.
    
        ContentTools.ToolShelf.stow(this, 'align-left');
    
        this.label = 'Align left';
        this.icon = 'align-left';
        this.className = 'text-left';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return element.content !== undefined;
    }

    static isApplied(element, selection) {
        // Return true if the tool is currently applied to the current
        // element/selection.
        let needle;
        if (!this.canApply(element)) {
            return false;
        }

        // List items and table cells use child nodes to manage their content
        // which don't support classes, so we need to check the parent.
        if ((needle = element.type(), ['ListItemText', 'TableCellText'].includes(needle))) {
            element = element.parent();
        }

        return element.hasCSSClass(this.className);
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        let className, needle;
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // List items and table cells use child nodes to manage their content
        // which don't support classes, so we need to use the parent.
        if ((needle = element.type(), ['ListItemText', 'TableCellText'].includes(needle))) {
            element = element.parent();
        }

        // Remove any existing text alignment classes applied
        const alignmentClassNames = [
            ContentTools.Tools.AlignLeft.className,
            ContentTools.Tools.AlignCenter.className,
            ContentTools.Tools.AlignRight.className
            ];
        for (className of Array.from<any>(alignmentClassNames)) {
            if (element.hasCSSClass(className)) {
                element.removeCSSClass(className);

                // If we're removing the class associated with the tool then we
                // can return early (this allows the tool to be toggled on/off).
                if (className === this.className) {
                    return callback(true);
                }
            }
        }

        // Add the alignment class to the element
        element.addCSSClass(this.className);

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.AlignCenter = class AlignCenter extends ContentTools.Tools.AlignLeft {
    static declare className: any;
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Apply a class to center align the contents of the current text block.
    
        ContentTools.ToolShelf.stow(this, 'align-center');
    
        this.label = 'Align center';
        this.icon = 'align-center';
        this.className = 'text-center';
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.AlignRight = class AlignRight extends ContentTools.Tools.AlignLeft {
    static declare className: any;
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Apply a class to right align the contents of the current text block.
    
        ContentTools.ToolShelf.stow(this, 'align-right');
    
        this.label = 'Align right';
        this.icon = 'align-right';
        this.className = 'text-right';
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.UnorderedList = class UnorderedList extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare listTag: any;

    static initClass() {
    
        // Set an element as an unordered list.
    
        ContentTools.ToolShelf.stow(this, 'unordered-list');
    
        this.label = 'Bullet list';
        this.icon = 'unordered-list';
        this.listTag = 'ul';
    }

    static canApply(element, selection?) {

        let needle;
        if (element.isFixed()) {
            return false;
        }

        // Return true if the tool can be applied to the current
        // element/selection.
        return (element.content !== undefined) &&
                (needle = element.parent().type(), ['Region', 'ListItem'].includes(needle));
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        let list;
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        if (element.parent().type() === 'ListItem') {

            // Find the parent list and change it to an unordered list
            element.storeState();
            list = element.closest(node => node.type() === 'List');
            list.tagName(this.listTag);
            element.restoreState();

        } else {
            // Convert the element to a list

            // Create a new list using the current elements content
            const listItemText = new ContentEdit.ListItemText(element.content.copy());
            const listItem = new ContentEdit.ListItem();
            listItem.attach(listItemText);
            list = new ContentEdit.List(this.listTag, {});
            list.attach(listItem);

            // Remove the current element from the region
            const parent = element.parent();
            const insertAt = parent.children.indexOf(element);
            parent.detach(element);
            parent.attach(list, insertAt);

            // Restore selection
            listItemText.focus();
            listItemText.selection(selection);
        }

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.OrderedList = class OrderedList extends ContentTools.Tools.UnorderedList {
    static declare icon: any;
    static declare label: any;
    static declare listTag: any;

    static initClass() {
    
        // Set an element as an ordered list.
    
        ContentTools.ToolShelf.stow(this, 'ordered-list');
    
        this.label = 'Numbers list';
        this.icon = 'ordered-list';
        this.listTag = 'ol';
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Table = class Table extends ContentTools.Tool {
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


Cls$tools = (ContentTools.Tools.Indent = class Indent extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Indent a list item.
    
        ContentTools.ToolShelf.stow(this, 'indent');
    
        this.label = 'Indent';
        this.icon = 'indent';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.

        return (element.parent().type() === 'ListItem') &&
                (element.parent().parent().children.indexOf(element.parent()) > 0);
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // Indent the list item
        element.parent().indent();

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Unindent = class Unindent extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Unindent a list item.
    
        ContentTools.ToolShelf.stow(this, 'unindent');
    
        this.label = 'Unindent';
        this.icon = 'unindent';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return element.parent().type() === 'ListItem';
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // Indent the list item
        element.parent().unindent();

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.LineBreak = class LineBreak extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Insert a line break in to the current element at the specified selection.
    
        ContentTools.ToolShelf.stow(this, 'line-break');
    
        this.label = 'Line break';
        this.icon = 'line-break';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return element.content;
    }

    static apply(element, selection, callback) {
        // Apply the tool to the current element

        // Dispatch `apply` event
        const toolDetail = {
            'tool': this,
            'element': element,
            'selection': selection
            };
        if (!this.dispatchEditorEvent('tool-apply', toolDetail)) {
            return;
        }

        // Insert a BR at the current in index
        const cursor = selection.get()[0] + 1;

        const tip = element.content.substring(0, selection.get()[0]);
        const tail = element.content.substring(selection.get()[1]);
        const br = new HTMLString.String('<br>', element.content.preserveWhitespace());
        element.content = tip.concat(br, tail);
        element.updateInnerHTML();
        element.taint();

        // Restore the selection
        selection.set(cursor, cursor);
        element.selection(selection);

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Image = class Image extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Insert an image.
    
        ContentTools.ToolShelf.stow(this, 'image');
    
        this.label = 'Image';
        this.icon = 'image';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        if (element.isFixed()) {
            if (element.type() !== 'ImageFixture') {
                return false;
            }
        }
        return true;
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

        // Dialog
        const dialog = new ContentTools.ImageDialog();

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
            const detail = ev.detail();
            const {
                imageURL
            } = detail;
            const {
                imageSize
            } = detail;
            let {
                imageAttrs
            } = detail;

            if (!imageAttrs) {
                imageAttrs = {};
            }

            imageAttrs.height = imageSize[1];
            imageAttrs.src = imageURL;
            imageAttrs.width = imageSize[0];

            if (element.type() === 'ImageFixture') {
                // Configure the image source against the fixture
                element.src(imageURL);

            } else {
                // Create the new image
                const image = new ContentEdit.Image(imageAttrs);

                // Find insert position
                const [node, index] = Array.from<any>(this._insertAt(element));
                node.parent().attach(image, index);

                // Focus the new image
                image.focus();
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
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Video = class Video extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Insert a video.
    
        ContentTools.ToolShelf.stow(this, 'video');
    
        this.label = 'Video';
        this.icon = 'video';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return !element.isFixed();
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

        // Dialog
        const dialog = new ContentTools.VideoDialog();

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
            const {
                url
            } = ev.detail();

            if (url) {
                // Create the new video
                const video = new ContentEdit.Video(
                    'iframe', {
                        'frameborder': 0,
                        'height': ContentTools.DEFAULT_VIDEO_HEIGHT,
                        'src': url,
                        'width': ContentTools.DEFAULT_VIDEO_WIDTH
                        });

                // Find insert position
                const [node, index] = Array.from<any>(this._insertAt(element));
                node.parent().attach(video, index);

                // Focus the new video
                video.focus();

            } else {
                // Nothing to do restore state
                if (element.restoreState) {
                    element.restoreState();
                }
            }

            modal.hide();
            dialog.hide();

            const applied = url !== '';
            callback(applied);

            // Dispatch `applied` event
            if (applied) {
                return this.dispatchEditorEvent('tool-applied', toolDetail);
            }
        });

        // Show the dialog
        app.attach(modal);
        app.attach(dialog);
        modal.show();
        return dialog.show();
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Undo = class Undo extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare requiresElement: any;

    static initClass() {
    
        // Undo an action.
    
        ContentTools.ToolShelf.stow(this, 'undo');
    
        this.label = 'Undo';
        this.icon = 'undo';
        this.requiresElement = false;
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        const app = ContentTools.EditorApp.get();
        return app.history && app.history.canUndo();
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

        const app = this.editor();

        // Revert the document to the previous state
        app.history.stopWatching();
        const snapshot = app.history.undo();
        app.revertToSnapshot(snapshot);
        app.history.watch();

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Redo = class Redo extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;
    static declare requiresElement: any;

    static initClass() {
    
        // Redo an action.
    
        ContentTools.ToolShelf.stow(this, 'redo');
    
        this.label = 'Redo';
        this.icon = 'redo';
        this.requiresElement = false;
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        const app = ContentTools.EditorApp.get();
        return app.history && app.history.canRedo();
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

        const app = ContentTools.EditorApp.get();

        // Revert the document to the next state
        app.history.stopWatching();
        const snapshot = app.history.redo();
        app.revertToSnapshot(snapshot);
        app.history.watch();

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();


Cls$tools = (ContentTools.Tools.Remove = class Remove extends ContentTools.Tool {
    static declare icon: any;
    static declare label: any;

    static initClass() {
    
        // Remove the current element.
    
        ContentTools.ToolShelf.stow(this, 'remove');
    
        this.label = 'Remove';
        this.icon = 'remove';
    }

    static canApply(element, selection?) {
        // Return true if the tool can be applied to the current
        // element/selection.
        return !element.isFixed();
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

        // Apply the tool to the current element
        const app = this.editor();

        // Blur the element before it's removed otherwise it will retain focus
        // even when detached.
        element.blur();

        // Focus on the next element
        if (element.nextContent()) {
            element.nextContent().focus();
        } else if (element.previousContent()) {
            element.previousContent().focus();
        }

        // Check the element is still mounted (some elements may automatically
        // remove themselves when they lose focus, for example empty text
        // elements.
        if (!element.isMounted()) {
            callback(true);

            // Dispatch `applied` event
            this.dispatchEditorEvent('tool-applied', toolDetail);

            return;
        }

        // Remove the element
        switch (element.type()) {
            case 'ListItemText':
                // Delete the associated list or list item
                if (app.ctrlDown()) {
                    const list = element.closest(node => node.parent().type() === 'Region');
                    list.parent().detach(list);
                } else {
                    element.parent().parent().detach(element.parent());
                }
                break;
            case 'TableCellText':
                // Delete the associated table or table row
                if (app.ctrlDown()) {
                    const table = element.closest(node => node.type() === 'Table');
                    table.parent().detach(table);
                } else {
                    const row = element.parent().parent();
                    row.parent().detach(row);
                }
                break;
            default:
                element.parent().detach(element);
                break;
        }

        callback(true);

        // Dispatch `applied` event
        return this.dispatchEditorEvent('tool-applied', toolDetail);
    }
});
Cls$tools.initClass();
