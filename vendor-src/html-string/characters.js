/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
HTMLString.Character = class Character {

    // A HTML character

    constructor(c, tags) {
        this._c = c;

        // Entities are stored lower case
        if (c.length > 1) {
            this._c = c.toLowerCase();
        }

        // Add the tags
        this._tags = [];
        this.addTags.apply(this, tags);
    }

    // Read-only properties

    c() {
        // Return the native character string
        return this._c;
    }

    isEntity() {
        // Return true if the character is an entity
        return this._c.length > 1;
    }

    isTag(tagName) {
        // Return true if the character is a self-closing tag (e.g br, img),
        // optionally a tagName can be specified to match against.

        if ((this._tags.length === 0) || !this._tags[0].selfClosing()) {
            return false;
        }

        if (tagName && (this._tags[0].name() !== tagName)) {
            return false;
        }

        return true;
    }

    isWhitespace() {
        // Return true if the character represents a whitespace character
        return [' ', '\n', '&nbsp;'].includes(this._c) || this.isTag('br');
    }

    tags() {
        // Return the tags for this character
        return (Array.from(this._tags).map((t) => t.copy()));
    }

    // Methods

    addTags(...tags) {
        // Add tag(s) to the character
        return (() => {
            const result = [];
            for (var tag of Array.from(tags)) {

            // HACK: Fix for IE edge (see issue:
            // https://github.com/GetmeUK/ContentTools/issues/258#issuecomment-228931486
            //
            // ~ Anthony Blackshaw <ant@getme.co.uk>, 28th June 2016
                if (Array.isArray(tag)) {
                    continue;
                }

                // Any self closing tag has to be inserted as the first tag
                if (tag.selfClosing()) {
                    // You can't add a self closing tag to a character that is a tag
                    if (!this.isTag()) {
                        this._tags.unshift(tag.copy());
                    }

                    continue;
                }

                // Add the tag to the stack
                result.push(this._tags.push(tag.copy()));
            }
            return result;
        })();
    }

    eq(c) {
        // Return true if the specified character is equal to this character

        // Check characters are the same
        let tag;
        if (this.c() !== c.c()) {
            return false;
        }

        // Check the number of tags are the same
        if (this._tags.length !== c._tags.length) {
            return false;
        }

        // Check tags are the same
        const tags = {};
        for (tag of Array.from(this._tags)) {
            tags[tag.head()] = true;
        }

        for (tag of Array.from(c._tags)) {
            if (!tags[tag.head()]) {
                return false;
            }
        }

        return true;
    }

    hasTags(...tags) {
        // Return true if the tags specified format this character
        let tag;
        const tagNames = {};
        const tagHeads = {};
        for (tag of Array.from(this._tags)) {
            tagNames[tag.name()] = true;
            tagHeads[tag.head()] = true;
        }

        // If a tag is supplied as a string we test if a tag with that name is
        // characters tags, if a tag instance is supplied then we check for
        // exact tag.
        for (tag of Array.from(tags)) {
            if (typeof tag === 'string') {
                if (tagNames[tag] === undefined) {
                    return false;
                }
            } else {
                if (tagHeads[tag.head()] === undefined) {
                    return false;
                }
            }
        }

        return true;
    }

    removeTags(...tags) {
        // Remove tag(s) from the character

        // If no tags are provide we remove all tags
        if (tags.length === 0) {
            this._tags = [];
            return;
        }

        const names = {};
        const heads = {};
        for (var tag of Array.from(tags)) {
            if (typeof tag === 'string') {
                names[tag] = tag;
            } else {
                heads[tag.head()] = tag;
            }
        }

        const newTags = [];
        return this._tags = this._tags.filter(function(tag) {
            if (!heads[tag.head()] && !names[tag.name()]) {
                return tag;
            }
        });
    }

    copy() {
        // Return a copy of the character
        return new HTMLString.Character(this._c, (Array.from(this._tags).map((t) => t.copy())));
    }
};