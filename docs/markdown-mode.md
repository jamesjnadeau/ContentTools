# Markdown mode

ContentTools edits HTML. A git-backed CMS edits markdown, and every save becomes a pull request
somebody reads. Those two facts do not meet in the middle by converting HTML to markdown after
the fact — an HTML→markdown converter has to guess, and what it guesses wrong shows up as a diff
covering the whole file.

Markdown mode takes the other route: **constrain what the editor can produce so that serializing
it is a total function**, and **splice everything the user did not touch straight out of the
original bytes**.

Two independent pieces, usable separately:

| | What it is | Cost |
|---|---|---|
| **The mode** | `<content-tools-editor mode="markdown">` — a constraint profile. No parsing, no serializing. | Nothing; it is plain frozen data in the main entry. |
| **The document** | `@jamesjnadeau/content-tools/markdown` — parse, render, splice. | ~97 kB gzipped, behind its own subpath. |

A shell that stores HTML can use the mode alone. Nothing in the editor or the element imports the
markdown entry.

---

## The mode

```html
<content-tools-editor mode="markdown" regions="[data-editable]" naming-prop="data-name">
  <div data-editable data-name="body">…</div>
</content-tools-editor>
```

Imperatively:

```js
import ContentTools, {MARKDOWN_PROFILE} from '@jamesjnadeau/content-tools';

const app = ContentTools.EditorApp.get();
app.profile(MARKDOWN_PROFILE);   // before init(), so the toolbox is built filtered
app.init('[data-editable]', 'data-name');
```

`mode` defaults to `html`, and an unrecognised value falls back to it rather than leaving the
element dead on the page. Changing `mode` on a connected element rebuilds the editor; changing it
while editing is refused with a warning, exactly as `content-scope` is.

### What markdown mode removes

**Four tools, leaving 17.** `align-left`, `align-center` and `align-right` — the text alignment
that has no markdown form — and `video`, which is an `<iframe>` embed.

A consumer-supplied tool list is filtered too:

```js
el.tools = [['bold', 'align-left'], ['video']];
el.editorApp.toolbox().tools();   // [['bold']]
```

That is deliberate. A constraint a consumer can step around by setting a property is a default,
not a constraint.

A tool of your own is filtered the same way, because the profile allows names rather than
excluding them. To let one through, set a widened profile on the element. That is a decision
you make on purpose, not a side effect of `tools`:

```js
import {MARKDOWN_PROFILE, allowTools} from '@jamesjnadeau/content-tools';

el.profile = allowTools(MARKDOWN_PROFILE, ['strike']);
```

See [custom-tools.md](custom-tools.md) for what such a tool may write.

**The styles and code tabs** of the properties dialog. CSS classes and raw HTML are both ways of
producing output markdown cannot express, so neither is offered; the dialog opens on its
attributes tab instead.

**Image resizing.** `width`/`height` on an image is HTML, not markdown.

**Table head and foot switches.** A GFM table requires a header row and has no footer, so the
head is forced on and the foot is not offered.

**Everything outside the CommonMark + GFM tag set, on paste.** The paste cleaner is replaced with
one restricted to those tags, and the attribute deny-list becomes an allow-list:
`a[href, title]`, `img[src, alt, title]`, `td[align]`, `th[align]`. Pasting
`<div style="text-align: center">` keeps the text and drops the rest.

**Dragging a read-only block.** See [unrepresentable constructs](#constructs-the-editor-cannot-model).

### Writing your own profile

`ConstraintProfile` is plain frozen data with no imports — the element applies one synchronously
in `connectedCallback`, so it cannot await anything.

```js
import {MARKDOWN_PROFILE} from '@jamesjnadeau/content-tools';

const noTables = Object.freeze({
    ...MARKDOWN_PROFILE,
    name: 'markdown-no-tables',
    tools: new Set([...MARKDOWN_PROFILE.tools].filter(t => t !== 'table')),
    tags: MARKDOWN_PROFILE.tags.filter(t => !['table', 'thead', 'tbody', 'tr', 'td', 'th'].includes(t))
});
app.profile(noTables);
```

The profile is **per `EditorApp` instance**, not global. Components reach it by walking to their
parent, which stays correct when the app stops being a singleton.

---

## The document

```js
import {MarkdownDocument} from '@jamesjnadeau/content-tools/markdown';

const doc = MarkdownDocument.parse(source);

region.innerHTML = doc.toHTML();
// ... the user edits ...
const next = doc.update(regions.body);      // the string from `ct-saved`
```

`update()` takes **exactly the HTML string a consumer already receives in `ct-saved`**. The class
holds no reference to the editor, which is what keeps it out of the default bundle and makes it
testable as a pure string function.

A `MarkdownDocument` is immutable: `doc.source()` is the same string for its lifetime, and
`update()` can be called repeatedly. To start from the new text, parse it again.

| Method | |
|---|---|
| `MarkdownDocument.parse(source)` | Parse, retaining source byte offsets. |
| `doc.source()` | The original text. |
| `doc.frontmatter()` | `{raw, start, end, data}`, or `null`. Invalid YAML gives `data: null` rather than throwing. |
| `doc.blocks()` | Top-level blocks: `{index, node, start, end, editable}`. |
| `doc.toHTML()` | The body as HTML for a region's `innerHTML`. |
| `doc.update(html, {frontmatter}?)` | The new file contents. |

### Byte preservation

The contract is one sentence: **a block the user did not change comes back byte for byte.** Not
"semantically equivalent" — the same bytes, including the whitespace *between* blocks and the
frontmatter's key order, comments and quoting.

`update()` classifies every block:

- **Unchanged** → the original bytes are spliced out of the source string by the offsets the
  parser recorded. Nothing is re-serialized, so nothing can be reformatted.
- **Changed** → that block alone is serialized.
- **New** → serialized, and joined with a blank line.
- **Removed** → dropped, with its separator.
- **Empty** → never written. `start()` gives a region with no editable children a placeholder
  paragraph so there is somewhere to type; it does not reach the file.

The bytes between two blocks are preserved only when they were adjacent in the source **and**
still are. After an insert, a move or a delete there is no original separator to preserve, and a
blank line is used.

### What counts as a change

Not ContentEdit's `lastModified()`. A user who bolds a word and then unbolds it has *touched* the
block without *changing* it, and `lastModified()` says touched — which would re-serialize and
reformat it for a diff of nothing.

Instead two blocks are the same when they **serialize to the same markdown**, with runs of
whitespace inside text collapsed. That second part covers the one thing HTML cannot carry: a
paragraph the author wrapped across three source lines reaches the editor as one line, because
the browser collapses the newlines, and comes back as one line whether or not anybody touched it.
Comparing strictly would unwrap it in the diff for an edit made somewhere else.

The tolerance stops at whitespace that is content. Inside a fenced code block markdown keeps the
text on its own node type, so changing indentation there is still a change — as is any change
inside inline code.

### Frontmatter

Preserved verbatim unless you ask for it to be rewritten:

```js
doc.update(html);                                   // frontmatter untouched
doc.update(html, {frontmatter: {title: 'New'}});    // rewritten from your data
doc.update(html, {frontmatter: null});              // removed
```

Verbatim is not an optimisation. A YAML round trip loses key order, comments and quoting style,
and none of that is the editor's to change.

---

## Constructs the editor cannot model

Shortcodes (`{{< figure >}}`, `{% include %}`), raw HTML blocks, footnote definitions, reference
definitions, indented code, task lists — markdown can express all of these and the editor cannot.
They become `ContentEdit.Static` elements, which:

- **cannot be focused** — `ContentEdit.Static` has no `focus` at all, so they are read-only with
  nothing enforcing it;
- **cannot be dragged**, because their bytes are about to be spliced back where they came from;
- **can still be dropped past**, deliberately — forbidding that would make a static block at the
  top or bottom of a region a wall nothing could be moved around.

They round-trip byte-identically, odd spacing and all. A block is classified static if the walker
cannot represent it *or anything inside it*: a paragraph containing a footnote reference is
read-only rather than losing the reference on save.

---

## Round-trip coverage

`test/markdown/corpus/` holds real markdown, driven by one assertion: **load, save with no edits,
and the output must be byte-identical to the input.** It runs twice — once as a pure string
function, and once with the document mounted in a live `ContentEdit.Region` and read back through
`region.html()`. The second is not redundant: ContentEdit pretty-prints its output, and the first
version of the walkers read that indentation as content while every pure-string test passed.

Adding a corpus file is the whole cost of covering a new construct.

---

## Try it

`npm run dev`, then <http://127.0.0.1:8931/playground/markdown.html>. Pick a corpus file, press
start, edit a paragraph, press stop — the right-hand pane highlights the lines that differ from
the file on disk. Exactly one should light up.
