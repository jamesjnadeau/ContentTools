/* Adaptations that decaffeinate cannot make, applied after conversion.
 *
 * Each one exists because an ES class behaves differently from the
 * function-and-prototype "class" CoffeeScript produced. They are corrections
 * to the CONVERSION, not changes to the library's behaviour -- the 455-test
 * suite is the check on that.
 */
import {readFileSync, writeFileSync} from 'node:fs';

const edits = [
    {
        file: 'vendor-src/content-edit/scripts/bases.js',
        what: 'Element.extend(): enumerability and precedence',
        find: `        // Instance properties
        let key, value;
        for (key in cls.prototype) {
            value = cls.prototype[key];
            if (key === 'constructor') {
                continue;
            }
            this.prototype[key] = value;
        }

        // Class properties
        for (key in cls) {
            value = cls[key];
            if (Array.from('__super__').includes(key)) {
                continue;
            }
            this.prototype[key] = value;
        }
`,
        replace: `        // Two CoffeeScript-vs-ES-class differences bite here, and between them
        // they accounted for ~50 test failures.
        //
        // 1. ENUMERABILITY. CoffeeScript built prototypes by plain assignment,
        //    so methods were enumerable and \`for...in\` saw them. ES class
        //    methods are non-enumerable, so the original loop copied NOTHING
        //    and every mixin silently vanished.
        //
        // 2. PRECEDENCE. \`@extend\` sat at the TOP of the CoffeeScript class
        //    body (bases.coffee:1055), so it ran before the class's own
        //    methods were assigned and they overwrote the mixin's. decaffeinate
        //    hoists class-body statements into \`static initClass()\`, which runs
        //    after the whole class exists -- inverting that. Skipping keys the
        //    class already defines itself restores the original order.
        let key, value;
        const own = Object.prototype.hasOwnProperty;
        for (key of Object.getOwnPropertyNames(cls.prototype)) {
            value = cls.prototype[key];
            if (key === 'constructor' || own.call(this.prototype, key)) {
                continue;
            }
            this.prototype[key] = value;
        }

        // Class properties. \`length\`, \`name\` and \`prototype\` are skipped
        // because they are non-enumerable on a CoffeeScript class function too,
        // so the original \`for...in\` never yielded them. \`initClass\` is a
        // decaffeinate artifact that was never a member of the original class.
        for (key of Object.getOwnPropertyNames(cls)) {
            value = cls[key];
            if (key === 'length' || key === 'name' || key === 'prototype' ||
                    key === 'initClass') {
                continue;
            }
            // Faithful to the original, including its oddities: this is a
            // per-CHARACTER test against '__super__' (CoffeeScript's \`in\`
            // applied to a string), and class properties land on the PROTOTYPE.
            if (Array.from('__super__').includes(key)) {
                continue;
            }
            this.prototype[key] = value;
        }
`
    },
    {
        file: 'vendor-src/content-edit/scripts/bases.js',
        what: 'ElementCollection: inline the NodeCollection mixin constructor',
        find: `        ContentEdit.NodeCollection.prototype.constructor.call(this);`,
        replace: `        // CoffeeScript's mixin idiom \`NodeCollection::constructor.call(this)\`
        // (bases.coffee:1059), inlined: an ES class constructor cannot be
        // invoked as a plain function. NodeCollection's constructor runs
        // Node's init and then creates the child list. Re-running Node's init
        // is a no-op here -- it re-assigns the same fresh values super() set a
        // line earlier -- but it is reproduced for exactness.
        this._bindings = {};
        this._parent = null;
        this._modified = null;
        this.children = [];`
    },
    {
        file: 'vendor-src/content-edit/scripts/text.js',
        what: 'PreText: cannot call Element\'s constructor directly',
        find: `    constructor(tagName, attributes, content) {
        // The content of the text element
        if (content instanceof HTMLString.String) {
            this.content = content;
        } else {
            this.content = new HTMLString.String(content, true);
        }

        ContentEdit.Element.call(this, tagName, attributes);
    }`,
        replace: `    constructor(tagName, attributes, content) {
        // The CoffeeScript bypassed Text's constructor entirely and ran
        // Element's directly (\`ContentEdit.Element.call(this, ...)\`,
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
    }`
    }
];

let applied = 0;
for (const {file, what, find, replace} of edits) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes(find)) {
        console.error(`SKIPPED (pattern not found): ${what} [${file}]`);
        continue;
    }
    writeFileSync(file, src.replace(find, replace));
    console.log(`applied: ${what}`);
    applied++;
}
console.log(`${applied}/${edits.length} post-conversion adaptations applied`);
