import ContentTools from './namespace.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */

const Cls$clean_html = (ContentTools.HTMLCleaner = class HTMLCleaner {
    static initClass() {
    
        // A class for cleaning (sanitizing) HTML.
        //
        // This class is specifically designed for cleaning HTML so that it can be
        // safely convert to ContentEdit elements, it use outside of ContentTools/
        // Edit is probably limited.
        //
        // The class itself was inspired by Alok Menghrajani's code snippet for
        // sanitizing HTML which can be found here:
        //
        // ~ https://www.quaxio.com/html_white_listed_sanitizer/
    
        // A table of tags and the list of attributes we consider safe for them
        this.DEFAULT_ATTRIBUTE_WHITELIST = {
            'a': ['href'],
            'td': ['colspan']
        };
    
        // A default list of tags we consider safe
        this.DEFAULT_TAG_WHITELIST = [
            'a',
            'address',
            'b',
            'blockquote',
            'code',
            'del',
            'em',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'i',
            'ins',
            'li',
            'ol',
            'p',
            'pre',
            'strong',
            'sup',
            'table',
            'tbody',
            'td',
            'tfoot',
            'th',
            'thead',
            'tr',
            'u',
            'ul',
            '#text'
        ];
    
        this.NO_CONTENT_TAGS = [
            'head',
            'meta',
            'style',
            'script',
            'title'
        ];
    }

    constructor(tagWhitelist, attributeWhitelist) {
        // List of tags we consider safe
        this.tagWhitelist = tagWhitelist || this.constructor.DEFAULT_TAG_WHITELIST;

        // Table of tags and the attributes we consider safe
        this.attributeWhitelist = attributeWhitelist ||
                this.constructor.DEFAULT_ATTRIBUTE_WHITELIST;
    }

    clean(html) {
        // Return a clean version of the given string of HTML

        // See https://github.com/GetmeUK/ContentTools/issues/542 for details,
        // thanks to https://github.com/cyclaero for the additional information
        // and workaround.
        let c;
        html = html.replace(
            /<span( class="Apple-converted-space")?> <\/span>/g,
            ' '
        );

        const sandbox = document.implementation.createHTMLDocument();
        const wrapper = sandbox.createElement('div');
        wrapper.innerHTML = html;

        const stack = ((() => {
            const result = [];
            for (c of Array.from(wrapper.childNodes)) {                 result.push(c);
            }
            return result;
        })());
        while (stack.length > 0) {
            var node = stack.shift();
            var nodeName = node.nodeName.toLowerCase();

            // Remove any non-whitelisted tags
            if (this.tagWhitelist.indexOf(nodeName) < 0) {

                if (this.constructor.NO_CONTENT_TAGS.indexOf(nodeName) > -1) {
                    node.remove();
                    continue;
                }

                // Add the children of the tag to the stack to be processed
                for (var childNode of Array.from(node.childNodes)) {
                    if (!childNode) {
                        continue;
                    }

                    childNode = childNode.cloneNode(true);
                    var childNodeName = childNode.nodeName.toLowerCase();
                    node.parentNode.insertBefore(childNode, node);
                    stack.push(childNode);
                }

                node.remove();
                continue;
            }

            // Remove any tag with no children or only whitespace children with
            // the exception of text or <br> tags.
            if (nodeName !== '#text') {
                if (node.textContent.trim() === '') {
                    if ((node.textContent === '') || (node.parentNode === wrapper)) {
                        // If the element is empty or top level remove it...
                        node.remove();

                    } else {
                        // ...replace it with a space
                        node.parentNode.replaceChild(
                            sandbox.createTextNode(' '),
                            node
                        );
                    }

                    continue;
                }
            }

            // Remove paragraphs from table cells and list items (we see this
            // when copying in from LibreOffice office documents).
            //
            // We use a rather unforgiving approach to resolve the problem
            // simply setting the inner HTML of the table cell to the text
            // content value.
            if ((nodeName === 'td') || (nodeName === 'th') || (nodeName === 'li')) {
                if (node.querySelector('p')) {
                    node.innerHTML = node.textContent;
                }
            }

            // Remove any non-whilelisted attributes
            if (node.attributes) {

                var safeAttributes = this.attributeWhitelist[nodeName] || [];
                var rawAttributes = (Array.from(node.attributes));
                for (var attribute of Array.from(rawAttributes)) {
                    if (safeAttributes.indexOf(attribute.name.toLowerCase()) < 0) {
                        node.removeAttribute(attribute.name);
                        continue;
                    }

                    // Handle href attributes with JS actions
                    if (attribute.name.toLowerCase() === 'href') {
                        var value = node.getAttribute(attribute.name);
                        if (value.startsWith('javascript:')) {
                            node.removeAttribute(attribute.name);
                            continue;
                        }
                    }
                }
            }

            // Add any children of the node to the stack to be cleaned
            stack.push.apply(stack, ((() => {
                const result1 = [];
                for (c of Array.from(node.childNodes)) {                     result1.push(c);
                }
                return result1;
            })()));
        }

        return wrapper.innerHTML;
    }
});
Cls$clean_html.initClass();
