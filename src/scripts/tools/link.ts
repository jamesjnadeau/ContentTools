import HTMLString from '../../../vendor-src/html-string/namespace.js';
import ContentSelect from '../../../vendor-src/content-select/content-select.js';
import ContentTools from '../namespace.js';

const Cls$tools: any = (ContentTools.Tools.Link = class Link extends ContentTools.Tools.Bold {
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
