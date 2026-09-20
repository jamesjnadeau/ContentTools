import FSM from './fsm.js';
import HTMLString from './namespace.js';
import {rootContext} from '../../src/core/root-context.js';

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS202: Simplify dynamic range loops
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const Cls$strings = (HTMLString.String = class String {
    static initClass() {
    
        // A string of HTML
    
        this._parser = null;
    }

    constructor(html, preserveWhitespace) {
        if (preserveWhitespace == null) { preserveWhitespace = false; }
        this._preserveWhitespace = preserveWhitespace;

        if (html) {
            // For performance we only initialize the parser once and only the
            // first time a HTMLString instances is initialized with html.
            if (HTMLString.String._parser === null) {
                HTMLString.String._parser = new _Parser();
            }

            this.characters = HTMLString.String._parser.parse(
                html,
                this._preserveWhitespace
                ).characters;
        } else {
            this.characters = [];
        }
    }

    // Read-only properties

    isWhitespace() {
        // Return true if the string consists entirely of whitespace characters
        for (var c of Array.from(this.characters)) {
            if (!c.isWhitespace()) {
                return false;
            }
        }
        return true;
    }

    length() {
        // Return the length of the string
        return this.characters.length;
    }

    preserveWhitespace() {
        // Return true if the string is flagged to preserve whitespace
        return this._preserveWhitespace;
    }

    // Methods

    capitalize() {
        // Return a copy of the string with the first letter capitalized
        const newString = this.copy();
        if (newString.length()) {
            const c = newString.characters[0]._c.toUpperCase();
            newString.characters[0]._c = c;
        }
        return newString;
    }

    charAt(index) {
        // Return a single character from the string at the specified index
        return this.characters[index].copy();
    }

    concat(...args) {
        // Combine 2 or more strings and returns a new string. Optionally you
        // can specify whether the strings each inherit the previous strings
        // format (default true).

        // Check if the last argument was a string or the `inheritFormat` flag
        let adjustedLength = Math.max(args.length, 1), strings = args.slice(0, adjustedLength - 1), inheritFormat = args[adjustedLength - 1];
        if (!((typeof inheritFormat === 'undefined') ||
                (typeof inheritFormat === 'boolean'))) {

            strings.push(inheritFormat);
            inheritFormat = true;
        }

        // Concat the strings
        const newString = this.copy();
        for (var string of Array.from(strings)) {

            // Skip empty strings
            var c;
            if (string.length === 0) {
                continue;
            }

            // If the string is supplied as text then convert it to an unformatted
            // string.
            var tail = string;
            if (typeof string === 'string') {
                tail = new HTMLString.String(string, this._preserveWhitespace);
            }

            // Inherit the format of the existing string
            if (inheritFormat && newString.length()) {
                var indexChar = newString.charAt(newString.length() - 1);
                var inheritedTags = indexChar.tags();

                // Don't inherit self-closing tags
                if (indexChar.isTag()) {
                    inheritedTags.shift();
                }

                if (typeof string !== 'string') {
                    tail = tail.copy();
                }

                for (c of Array.from(tail.characters)) {
                    c.addTags.apply(c, inheritedTags);
                }
            }

            // Build the new string
            for (c of Array.from(tail.characters)) {
                newString.characters.push(c);
            }
        }

        return newString;
    }

    contains(substring) {
        // Return true if the string contains the specified sub-string

        // Compare to text
        if (typeof substring === 'string') {
            return this.text().indexOf(substring) > -1;
        }

        // Compare to html string
        let from = 0;
        while (from <= (this.length() - substring.length())) {
            var found = true;
            for (var i = 0; i < substring.characters.length; i++) {
                var c = substring.characters[i];
                if (!c.eq(this.characters[i + from])) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return true;
            }
            from++;
        }

        return false;
    }

    endsWith(substring) {
        // Return true if the string ends with the specified sub-string

        // Compare to text
        if (typeof substring === 'string') {
            return ((substring === '') ||
                    (this.text().slice(-substring.length) === substring));
        }

        // Compare to html string
        const characters = this.characters.slice().reverse();
        const iterable = substring.characters.slice().reverse();
        for (let i = 0; i < iterable.length; i++) {
            var c = iterable[i];
            if (!c.eq(characters[i])) {
                return false;
            }
        }

        return true;
    }

    format(from, to, ...tags) {
        // Apply the specified tags to a range (from, to) of characters in the
        // string.

        // Support for negative indexes on from/to
        if (to < 0) {
            to = this.length() + to + 1;
        }

        if (from < 0) {
            from = this.length() + from;
        }

        const newString = this.copy();
        for (let i = from, end = to, asc = from <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            var c = newString.characters[i];
            c.addTags.apply(c, tags);
        }

        return newString;
    }

    hasTags(...args) {
        // Return true if the specified tags are applied to some or all
        // (strict=true) characters within the string (default false).

        // Check if the last argument was a tag or the `strict` flag
        let adjustedLength = Math.max(args.length, 1), tags = args.slice(0, adjustedLength - 1), strict = args[adjustedLength - 1];
        if (!((typeof strict === 'undefined') ||
                (typeof strict === 'boolean'))) {
            tags.push(strict);
            strict = false;
        }

        let found = false;
        for (var c of Array.from(this.characters)) {
            if (c.hasTags.apply(c, tags)) {
                found = true;
            } else {
                if (strict) {
                    return false;
                }
            }
        }

        return found;
    }

    html() {
        // Return a HTML version of the string

        let tag;
        let html = '';
        const openTags = [];
        const openHeads = [];
        let closingTags = [];

        for (var c of Array.from(this.characters)) {

            // Close tags
            var head;
            closingTags = [];
            for (var openTag of Array.from(openTags.slice().reverse())) {
                closingTags.push(openTag);
                if (!c.hasTags(openTag)) {
                    for (var closingTag of Array.from(closingTags)) {
                        html += closingTag.tail();
                        openTags.pop();
                        openHeads.pop();
                    }
                    closingTags = [];
                }
            }

            // Open tags
            for (tag of Array.from(c._tags)) {
                if (openHeads.indexOf(tag.head()) === -1) {
                    if (!tag.selfClosing()) {
                        head = tag.head();
                        html += head;
                        openTags.push(tag);
                        openHeads.push(head);
                    }
                }
            }

            // If the character is a self-closing tag add it to the HTML after
            // all other tags.
            if ((c._tags.length > 0) && c._tags[0].selfClosing()) {
                html += c._tags[0].head();
            }

            html += c.c();
        }

        for (tag of Array.from(openTags.reverse())) {
            html += tag.tail();
        }

        return html;
    }

    indexOf(substring, from) {
        // Return the index of the first occurrence of the specified sub-string,
        // -1 is returned if no match is found.

        if (from == null) { from = 0; }
        if (from < 0) {
            from = 0;
        }

        // Find text
        if (typeof substring === 'string') {
            return this.text().indexOf(substring, from);
        }

        // Find html string
        while (from <= (this.length() - substring.length())) {
            var found = true;
            for (var i = 0; i < substring.characters.length; i++) {
                var c = substring.characters[i];
                if (!c.eq(this.characters[i + from])) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return from;
            }
            from++;
        }

        return -1;
    }

    insert(index, substring, inheritFormat) {
        // Insert the specified sub-string at the specified index

        let c;
        if (inheritFormat == null) { inheritFormat = true; }
        const head = this.slice(0, index);
        const tail = this.slice(index);

        if (index < 0) {
            index = this.length() + index;
        }

        // If the string is supplied as text then convert it to an unformatted
        // string.
        let middle = substring;
        if (typeof substring === 'string') {
            middle = new HTMLString.String(substring, this._preserveWhitespace);
        }

        // Inherit the format of the existing string
        if (inheritFormat && (index > 0)) {
            const indexChar = this.charAt(index - 1);
            const inheritedTags = indexChar.tags();

            // Don't inherit self-closing tags
            if (indexChar.isTag()) {
                inheritedTags.shift();
            }

            if (typeof substring !== 'string') {
                middle = middle.copy();
            }

            for (c of Array.from(middle.characters)) {
                c.addTags.apply(c, inheritedTags);
            }
        }

        // Build the new string
        const newString = head;
        for (c of Array.from(middle.characters)) {
            newString.characters.push(c);
        }
        for (c of Array.from(tail.characters)) {
            newString.characters.push(c);
        }
        return newString;
    }

    lastIndexOf(substring, from) {
        // Return the index of the last occurrence of the specified sub-string,
        // -1 is returned if no match is found.

        let c, found, i;
        if (from == null) { from = 0; }
        if (from < 0) {
            from = 0;
        }

        const characters = this.characters.slice(from).reverse();

        // The from offset is applied by the slice so we reset it to 0
        from = 0;

        // Find text
        if (typeof substring === 'string') {

            // Check the this string contains the specified string before
            // perform a full search.
            if (!this.contains(substring)) {
                return -1;
            }

            // Find text
            substring = substring.split('').reverse();
            while (from <= (characters.length - substring.length)) {
                found = true;
                var skip = 0;
                for (i = 0; i < substring.length; i++) {
                    c = substring[i];
                    if (characters[i + from].isTag()) {
                        skip += 1;
                    }
                    if (c !== characters[skip + i + from].c()) {
                        found = false;
                        break;
                    }
                }
                if (found) {
                    return from;
                }
                from++;
            }

            return -1;
        }

        // Find html string
        substring = substring.characters.slice().reverse();
        while (from <= (characters.length - substring.length)) {
            found = true;
            for (i = 0; i < substring.length; i++) {
                c = substring[i];
                if (!c.eq(characters[i + from])) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return from;
            }
            from++;
        }

        return -1;
    }

    optimize() {
        // Optimize the string so that tags are stacked in order of run length
        let c, tag;
        const openTags = [];
        const openHeads = [];
        let lastC = null; // Last character

        for (c of Array.from(this.characters.slice().reverse())) {
            c._runLengthMap = {};
            c._runLengthMapSize = 0;

            // Close tags
            var closingTags = [];
            for (var openTag of Array.from(openTags.slice().reverse())) {
                closingTags.push(openTag);
                if (!c.hasTags(openTag)) {
                    for (var closingTag of Array.from(closingTags)) {
                        openTags.pop();
                        openHeads.pop();
                    }
                    closingTags = [];
                }
            }

            // Open tags
            for (tag of Array.from(c._tags)) {
                if (openHeads.indexOf(tag.head()) === -1) {
                    if (!tag.selfClosing()) {
                        openTags.push(tag);
                        openHeads.push(tag.head());
                    }
                }
            }

            // Calculate the run length of each tag
            for (tag of Array.from(openTags)) {
                var head = tag.head();

                // If this is the first character set the run length to 1 and
                // continue.
                if (!lastC) {
                    c._runLengthMap[head] = [tag, 1];
                    continue;
                }

                // If there isn't one already add an entry for the tag against
                // the character.
                if (!c._runLengthMap[head]) {
                    c._runLengthMap[head] = [tag, 0];
                }

                // Check to see if the last character also had this tag applied
                // and if so use the run length as a basis.
                var run_length = 0;
                if (lastC._runLengthMap[head]) {
                    run_length = lastC._runLengthMap[head][1];
                }

                // Increment the run length for this character and tag
                c._runLengthMap[head][1] = run_length + 1;
            }

            lastC = c;
        }

        // Order the tags for each character based on their run length
        const runLengthSort = (a, b) => b[1] - a[1];

        return (() => {
            const result = [];
            for (c of Array.from(this.characters)) {
            // Check for characters where there's only a single tag applied in
            // which case there's no need to apply a re-order.
                var len = c._tags.length;
                if (((len > 0) && c._tags[0].selfClosing() && (len < 3)) || (len < 2)) {
                    continue;
                }

                // Build a list of tags and sort them in order or run length
                var runLengths = [];
                for (tag in c._runLengthMap) {
                    var runLength = c._runLengthMap[tag];
                    runLengths.push(runLength);
                }
                runLengths.sort(runLengthSort);

                // Re-add the characters tags in run length order
                for (tag of Array.from(c._tags.slice())) {
                    if (!tag.selfClosing()) {
                        c.removeTags(tag);
                    }
                }
                result.push(c.addTags.apply(c, (Array.from(runLengths).map((t) => t[0]))));
            }
            return result;
        })();
    }

    slice(from, to) {
        // Extract a section of the string and return a new string
        const newString = new HTMLString.String('', this._preserveWhitespace);
        newString.characters = (Array.from(this.characters.slice(from, to)).map((c) => c.copy()));
        return newString;
    }

    split(separator, limit) {
        // Split the string by the separator and return a list of sub-strings

        // Build a list of indexes for the separator in the string
        if (separator == null) { separator = ''; }
        if (limit == null) { limit = 0; }
        let lastIndex = 0;
        const count = 0;
        const indexes = [0];
        while (true) {
            if ((limit > 0) && (count > limit)) {
                break;
            }
            var index = this.indexOf(separator, lastIndex);
            if (index === -1) {
                break;
            }
            indexes.push(index);
            lastIndex = index + 1;
        }

        indexes.push(this.length());

        // Build a list of sub-strings based on the split indexes
        const substrings = [];
        for (let i = 0, end1 = indexes.length - 2, asc = 0 <= end1; asc ? i <= end1 : i >= end1; asc ? i++ : i--) {
            var start = indexes[i];
            if (i > 0) {
                start += 1;
            }
            var end = indexes[i + 1];
            substrings.push(this.slice(start, end));
        }

        return substrings;
    }

    startsWith(substring) {
        // Return true if the string starts with the specified substring

        // Compare to text
        if (typeof substring === 'string') {
            return this.text().slice(0, substring.length) === substring;
        }

        // Compare to html string
        for (let i = 0; i < substring.characters.length; i++) {
            var c = substring.characters[i];
            if (!c.eq(this.characters[i])) {
                return false;
            }
        }

        return true;
    }

    substr(from, length) {
        // Return a subset of a string between from and length, if length isn't
        // specified it will default to the end of the string.

        // Check for zero or negative length selections
        if (length <= 0) {
            return new HTMLString.String('', this._preserveWhitespace);
        }

        if (from < 0) {
            from = this.length() + from;
        }

        if (length === undefined) {
            length = this.length() - from;
        }

        return this.slice(from, from + length);
    }

    substring(from, to) {
        // Return a subset of a string between from and to, if to isn't
        // specified it will default to the end of the string.
        if (to === undefined) {
            to = this.length();
        }

        return this.slice(from, to);
    }

    text() {
        // Return a text version of the string
        let text = '';
        for (var c of Array.from(this.characters)) {

            // Handle tag characters
            if (c.isTag()) {

                // Handle line breaks
                if (c.isTag('br')) {
                    text += '\n';
                }
                continue;
            }

            // Prevent multiple spaces (other than &nbsp;)
            if (c.c() === '&nbsp;') {
                text += c.c();
                continue;
            }

            text += c.c();
        }

        return this.constructor.decode(text);
    }

    toLowerCase() {
        // Return a copy of the string converted to lower case
        const newString = this.copy();
        for (var c of Array.from(newString.characters)) {
            if (c._c.length === 1) {
                c._c = c._c.toLowerCase();
            }
        }
        return newString;
    }

    toUpperCase() {
        // Return a copy of the string converted to upper case
        const newString = this.copy();
        for (var c of Array.from(newString.characters)) {
            if (c._c.length === 1) {
                c._c = c._c.toUpperCase();
            }
        }
        return newString;
    }

    trim() {
        // Return a copy of the string with whitespace trimmed from either end

        // Find the first non-whitespace character
        let from, to;
        let c;
        for (from = 0; from < this.characters.length; from++) {
            c = this.characters[from];
            if (!c.isWhitespace()) {
                break;
            }
        }

        // Find the last non-whitespace character
        const iterable = this.characters.slice().reverse();
        for (to = 0; to < iterable.length; to++) {
            c = iterable[to];
            if (!c.isWhitespace()) {
                break;
            }
        }

        to = this.length() - to - 1;

        const newString = new HTMLString.String('', this._preserveWhitespace);
        newString.characters = ((() => {
            const result = [];
            for (c of Array.from(this.characters.slice(from, +to + 1 || undefined))) {                 result.push(c.copy());
            }
            return result;
        })());

        return newString;
    }

    trimLeft() {
        // Return a copy of the string with whitespaces trimmed from the left
        let from;
        let c;
        const to = this.length() - 1;

        // Find the first non-whitespace character
        for (from = 0; from < this.characters.length; from++) {
            c = this.characters[from];
            if (!c.isWhitespace()) {
                break;
            }
        }

        const newString = new HTMLString.String('', this._preserveWhitespace);
        newString.characters = ((() => {
            const result = [];
            for (c of Array.from(this.characters.slice(from, +to + 1 || undefined))) {                 result.push(c.copy());
            }
            return result;
        })());

        return newString;
    }

    trimRight() {
        // Return a copy of the string with whitespaces trimmed from the right
        let to;
        let c;
        const from = 0;

        // Find the last non-whitespace character
        const iterable = this.characters.slice().reverse();
        for (to = 0; to < iterable.length; to++) {
            c = iterable[to];
            if (!c.isWhitespace()) {
                break;
            }
        }

        to = this.length() - to - 1;

        const newString = new HTMLString.String('', this._preserveWhitespace);
        newString.characters = ((() => {
            const result = [];
            for (c of Array.from(this.characters.slice(from, +to + 1 || undefined))) {                 result.push(c.copy());
            }
            return result;
        })());

        return newString;
    }

    unformat(from, to, ...tags) {
        // Remove the specified tags from a range (from, to) of characters in
        // the string. Specifying no tags will clear all formatting form the
        // selection.

        // Support for negative indexes on from/to
        if (to < 0) {
            to = this.length() + to + 1;
        }

        if (from < 0) {
            from = this.length() + from;
        }

        const newString = this.copy();
        for (let i = from, end = to, asc = from <= end; asc ? i < end : i > end; asc ? i++ : i--) {
            var c = newString.characters[i];
            c.removeTags.apply(c, tags);
        }

        return newString;
    }

    copy() {
        // Return a copy of the string
        const stringCopy = new HTMLString.String('', this._preserveWhitespace);
        stringCopy.characters = (Array.from(this.characters).map((c) => c.copy()));
        return stringCopy;
    }

    // Class methods

    static decode(string) {
        // Decode entities within the specified string
        const textarea = rootContext().createElement('textarea');
        textarea.innerHTML = string;
        return textarea.textContent;
    }

    static encode(string) {
        // Encode entities within the specified string
        const textarea = rootContext().createElement('textarea');
        textarea.textContent = string;
        return textarea.innerHTML;
    }

    static join(separator, strings) {
        // Join a list of strings together
        let joined = strings.shift();
        for (var s of Array.from(strings)) {
            joined = joined.concat(separator, s);
        }
        return joined;
    }
});
Cls$strings.initClass();


// Constants

// Define character sets
const ALPHA_CHARS = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz-_$'.split('');
const ALPHA_NUMERIC_CHARS = ALPHA_CHARS.concat('1234567890'.split(''));
const ATTR_NAME_CHARS = ALPHA_NUMERIC_CHARS.concat([':']);
const ENTITY_CHARS = ALPHA_NUMERIC_CHARS.concat(['#']);
const TAG_NAME_CHARS = ALPHA_NUMERIC_CHARS.concat([':']);

// Define the parser states
const CHAR_OR_ENTITY_OR_TAG = 1;
const ENTITY = 2;
const OPENNING_OR_CLOSING_TAG = 3;
const OPENING_TAG = 4;
const CLOSING_TAG = 5;
const TAG_NAME_OPENING = 6;
const TAG_NAME_CLOSING = 7;
const TAG_OPENING_SELF_CLOSING = 8;
const TAG_NAME_MUST_CLOSE = 9;
const ATTR_OR_TAG_END = 10;
const ATTR_NAME = 11;
const ATTR_NAME_FIND_VALUE = 12;
const ATTR_DELIM = 13;
const ATTR_VALUE_SINGLE_DELIM = 14;
const ATTR_VALUE_DOUBLE_DELIM = 15;
const ATTR_VALUE_NO_DELIM = 16;
const ATTR_ENTITY_NO_DELIM = 17;
const ATTR_ENTITY_SINGLE_DELIM = 18;
const ATTR_ENTITY_DOUBLE_DELIM = 19;


class _Parser {

    // A HTML parser for creating HTML strings

    constructor() {

        // Build the parser FSM
        this.fsm = new FSM.Machine(this);
        this.fsm.setInitialState(CHAR_OR_ENTITY_OR_TAG);

        // Character or tag
        this.fsm.addTransitionAny(CHAR_OR_ENTITY_OR_TAG, null, function(c) {
            return this._pushChar(c);
        });

        this.fsm.addTransition('<', CHAR_OR_ENTITY_OR_TAG, OPENNING_OR_CLOSING_TAG);
        this.fsm.addTransition('&', CHAR_OR_ENTITY_OR_TAG, ENTITY);

        // Entity
        this.fsm.addTransitions(ENTITY_CHARS, ENTITY, null, function(c) {
            return this.entity += c;
        });

        this.fsm.addTransition(';', ENTITY, CHAR_OR_ENTITY_OR_TAG, function() {
            this._pushChar(`&${ this.entity };`);
            return this.entity = '';
        });

        // Opening or closing Tag
        this.fsm.addTransitions([' ', '\n'], OPENNING_OR_CLOSING_TAG);
        this.fsm.addTransitions(ALPHA_CHARS, OPENNING_OR_CLOSING_TAG, OPENING_TAG, function() {
            return this._back();
        });

        this.fsm.addTransition('/', OPENNING_OR_CLOSING_TAG, CLOSING_TAG);

        // Opening tag
        this.fsm.addTransitions([' ', '\n'], OPENING_TAG);
        this.fsm.addTransitions(ALPHA_CHARS, OPENING_TAG, TAG_NAME_OPENING, function() {
            return this._back();
        });

        // Closing tag
        this.fsm.addTransitions([' ', '\n'], CLOSING_TAG);
        this.fsm.addTransitions(ALPHA_CHARS, CLOSING_TAG, TAG_NAME_CLOSING, function() {
            return this._back();
        });

        // Tag name opening
        this.fsm.addTransitions(TAG_NAME_CHARS, TAG_NAME_OPENING, null, function(c) {
            return this.tagName += c;
        });

        this.fsm.addTransitions([' ', '\n'], TAG_NAME_OPENING, ATTR_OR_TAG_END);
        this.fsm.addTransition('/', TAG_NAME_OPENING, TAG_OPENING_SELF_CLOSING, function() {
            return this.selfClosing = true;
        });

        this.fsm.addTransition('>', TAG_NAME_OPENING, CHAR_OR_ENTITY_OR_TAG, function() {
            return this._pushTag();
        });

        this.fsm.addTransitions([' ', '\n'], TAG_OPENING_SELF_CLOSING);
        this.fsm.addTransition('>', TAG_OPENING_SELF_CLOSING, CHAR_OR_ENTITY_OR_TAG, function() {
            return this._pushTag();
        });

        this.fsm.addTransitions([' ', '\n'], ATTR_OR_TAG_END);
        this.fsm.addTransition('/', ATTR_OR_TAG_END, TAG_OPENING_SELF_CLOSING, function() {
            return this.selfClosing = true;
        });

        this.fsm.addTransition('>', ATTR_OR_TAG_END, CHAR_OR_ENTITY_OR_TAG, function() {
            return this._pushTag();
        });

        this.fsm.addTransitions(ALPHA_CHARS, ATTR_OR_TAG_END, ATTR_NAME, function() {
            return this._back();
        });

        // Tag name closing
        this.fsm.addTransitions(TAG_NAME_CHARS, TAG_NAME_CLOSING, null, function(c) {
            return this.tagName += c;
        });

        this.fsm.addTransitions([' ', '\n'], TAG_NAME_CLOSING, TAG_NAME_MUST_CLOSE);
        this.fsm.addTransition('>', TAG_NAME_CLOSING, CHAR_OR_ENTITY_OR_TAG, function() {
            return this._popTag();
        });

        this.fsm.addTransitions([' ', '\n'], TAG_NAME_MUST_CLOSE);
        this.fsm.addTransition('>', TAG_NAME_MUST_CLOSE, CHAR_OR_ENTITY_OR_TAG, function() {
            return this._popTag();
        });

        // Attribute name
        this.fsm.addTransitions(ATTR_NAME_CHARS, ATTR_NAME, null, function(c) {
            return this.attributeName += c;
        });

        this.fsm.addTransitions([' ', '\n'], ATTR_NAME, ATTR_NAME_FIND_VALUE);
        this.fsm.addTransition('=', ATTR_NAME, ATTR_DELIM);
        this.fsm.addTransitions([' ', '\n'], ATTR_NAME_FIND_VALUE);
        this.fsm.addTransition('=', ATTR_NAME_FIND_VALUE, ATTR_DELIM);

        this.fsm.addTransitions('>', ATTR_NAME, ATTR_OR_TAG_END, function() {
            this._pushAttribute();
            return this._back();
        });

        this.fsm.addTransitionAny(ATTR_NAME_FIND_VALUE, ATTR_OR_TAG_END, function() {
            this._pushAttribute();
            return this._back();
        });

        // Attribute delimiter
        this.fsm.addTransitions([' ', '\n'], ATTR_DELIM);
        this.fsm.addTransition('\'', ATTR_DELIM, ATTR_VALUE_SINGLE_DELIM);
        this.fsm.addTransition('"', ATTR_DELIM, ATTR_VALUE_DOUBLE_DELIM);

        // Fix for browsers (including IE) that output quoted attributes
        this.fsm.addTransitions(ALPHA_NUMERIC_CHARS.concat(['&'], ATTR_DELIM, ATTR_VALUE_NO_DELIM, function() {
            return this._back();
        })
        );

        this.fsm.addTransition(' ', ATTR_VALUE_NO_DELIM, ATTR_OR_TAG_END, function() {
            return this._pushAttribute();
        });

        this.fsm.addTransitions(['/', '>'], ATTR_VALUE_NO_DELIM, ATTR_OR_TAG_END, function() {
            this._back();
            return this._pushAttribute();
        });

        this.fsm.addTransition('&', ATTR_VALUE_NO_DELIM, ATTR_ENTITY_NO_DELIM);
        this.fsm.addTransitionAny(ATTR_VALUE_NO_DELIM, null, function(c) {
            return this.attributeValue += c;
        });

        // Attribute value single delimiter
        this.fsm.addTransition('\'', ATTR_VALUE_SINGLE_DELIM, ATTR_OR_TAG_END, function() {
            return this._pushAttribute();
        });

        this.fsm.addTransition('&', ATTR_VALUE_SINGLE_DELIM, ATTR_ENTITY_SINGLE_DELIM);
        this.fsm.addTransitionAny(ATTR_VALUE_SINGLE_DELIM, null, function(c) {
            return this.attributeValue += c;
        });

        // Attribte value double delimiter
        this.fsm.addTransition('"', ATTR_VALUE_DOUBLE_DELIM, ATTR_OR_TAG_END, function() {
            return this._pushAttribute();
        });

        this.fsm.addTransition('&', ATTR_VALUE_DOUBLE_DELIM, ATTR_ENTITY_DOUBLE_DELIM);
        this.fsm.addTransitionAny(ATTR_VALUE_DOUBLE_DELIM, null, function(c) {
            return this.attributeValue += c;
        });

        // Entity in attribute value
        this.fsm.addTransitions(ENTITY_CHARS, ATTR_ENTITY_NO_DELIM, null, function(c) {
            return this.entity += c;
        });

        this.fsm.addTransitions(ENTITY_CHARS, ATTR_ENTITY_SINGLE_DELIM, function(c) {
            return this.entity += c;
        });

        this.fsm.addTransitions(ENTITY_CHARS, ATTR_ENTITY_DOUBLE_DELIM, null, function(c) {
            return this.entity += c;
        });

        this.fsm.addTransition(';', ATTR_ENTITY_NO_DELIM, ATTR_VALUE_NO_DELIM, function() {
            this.attributeValue += `&${ this.entity };`;
            return this.entity = '';
        });

        this.fsm.addTransition(';', ATTR_ENTITY_SINGLE_DELIM, ATTR_VALUE_SINGLE_DELIM, function() {
            this.attributeValue += `&${ this.entity };`;
            return this.entity = '';
        });

        this.fsm.addTransition(';', ATTR_ENTITY_DOUBLE_DELIM, ATTR_VALUE_DOUBLE_DELIM, function() {
            this.attributeValue += `&${ this.entity };`;
            return this.entity = '';
        });
    }

    // Parsing methods

    _back() {
        // Move the parsing head back one characters
        return this.head--;
    }

    _pushAttribute() {
        // Remember an attribute for the current tag

        this.attributes[this.attributeName] = this.attributeValue;

        // Reset the attribute
        this.attributeName = '';
        return this.attributeValue = '';
    }

    _pushChar(c) {
        // Push a character on to the string
        const character = new HTMLString.Character(c, this.tags);

        // Do we need to preserve whitespace?
        if (this._preserveWhitespace) {
            this.string.characters.push(character);
            return;
        }

        // If the character is whitespace only add it if the last character
        // isn't (e.g don't build strings containing extra unused spaces).
        if (this.string.length() && !character.isTag() &&
                !character.isEntity() && character.isWhitespace()) {

            const lastCharacter = this.string.characters[this.string.length() - 1];
            if (lastCharacter.isWhitespace() && !lastCharacter.isTag() &&
                    !lastCharacter.isEntity()) {
                return;
            }
        }

        return this.string.characters.push(character);
    }

    _pushTag() {
        // Push a tag on to the stack applied to characters

        // Push the Tag on to the stack
        const tag = new HTMLString.Tag(this.tagName, this.attributes);
        this.tags.push(tag);

        // Adding an empty character for self closing tags
        if (tag.selfClosing()) {
            this._pushChar('');
            this.tags.pop();

            // Check if the tag was self closed and if not update the FSM to
            // close it.
            if (!this.selfClosed && Array.from(HTMLString.Tag.SELF_CLOSING).includes(this.tagName)) {
                this.fsm.reset();
            }
        }

        // Reset the tag buffers
        this.tagName = '';
        this.selfClosed = false;
        return this.attributes = {};
    }

    _popTag() {
        // Pop a tag from the stack applied to characters

        // Balanced the tags
        while (true) {
            var tag = this.tags.pop();

            // Push whitespace at the end of a tag out
            if (this.string.length()) {
                var character = this.string.characters[this.string.length() - 1];
                if (!character.isTag() &&
                        !character.isEntity() &&
                        character.isWhitespace()) {
                    character.removeTags(tag);
                }
            }

            if (tag.name() === this.tagName.toLowerCase()) { break; }
        }

        // Reset the tag buffers
        return this.tagName = '';
    }

    // Methods

    parse(html, preserveWhitespace) {
        // Parse a HTML string
        this._preserveWhitespace = preserveWhitespace;

        // Prepare for parsing
        this.reset();
        html = this.preprocess(html);
        this.fsm.parser = this;

        // Parse the HTML
        while (this.head < html.length) {
            var character = html[this.head];
            try {
                this.fsm.process(character);
            } catch (error) {
                throw new Error(`Error at char ${this.head} >> ${error}`);
            }

            this.head++;
        }

        return this.string;
    }

    preprocess(html) {
        // Preprocess a HTML string to prepare it for parsing

        // Normalize line endings
        html = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Remove any comments
        html = html.replace(/<!--[\s\S]*?-->/g, '');

        // Replace multiple spaces with a single space
        if (!this._preserveWhitespace) {
            html = html.replace(/\s+/g, ' ');
        }

        return html;
    }

    reset() {
        // Reset the parser ready to parse a HTML string
        this.fsm.reset();

        // The index of the character we're currently parsing
        this.head = 0;

        // Temporary properties to store the current parser state
        this.string = new HTMLString.String();
        this.entity = '';
        this.tags = [];
        this.tagName = '';
        this.selfClosing = false;
        this.attributes = {};
        this.attributeName = '';
        return this.attributeValue = '';
    }
}
