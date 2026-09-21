# The shell

`@jamesjnadeau/content-tools/shell` is the application a site's authors
open. It is the only place the two halves of this package meet: the editor
element is the editing surface, [`./cms`](cms.md) is the repository, neither
knows the other exists, and this joins them.

```html
<content-tools-cms config="./cms-config.yml"></content-tools-cms>
<script type="module" src="./dist/shell.js"></script>
```

That is the whole integration. Everything else — what the collections are,
which repository, what a post's fields are called — is in the config file
that tag is pointed at.

From a bundler it is the same tag behind an import, which registers it:

```js
import '@jamesjnadeau/content-tools/shell';
```

The shell registers `<content-tools-editor>` too, so a page that loads both
`./shell` and `./element` gets whichever won the race and no error. It also
brings the whole editor with it — the tag has to be registered before the
shell can create one, and a lazy chunk that 404s from a static host would
fail nowhere until somebody opened an entry.

## Deploying it

`app/` is the deployable application, and it is two files: `index.html`
above, and `cms-config.yml` describing the one repository that deployment
edits. Copy `app/` and `dist/` to any static host and that is the install.
There is no server and no build step per site: by default the token is
the author's own fine-grained one, and it never leaves their tab.

A site with several authors can have them press **Sign in with GitHub**
instead, which costs one small deployed proxy and a `backend.auth` block
in the config — see [signing in](auth.md). Nothing else about the install
changes, and the secret lives in the proxy rather than anywhere the
browser can reach.

```
your-host/
  index.html          <- app/index.html, paths adjusted if you move dist/
  cms-config.yml      <- yours: the repository, the collections, the fields
  dist/               <- shell.js, content-tools-content.css, and the rest
```

One build, many deployments, one config file each. `app/` ships in the npm
package as well as in this repository, so
`node_modules/@jamesjnadeau/content-tools/app/` is a copy to start from.

**The `<link>` to `content-tools-content.css` is load-bearing**, not
decoration. The editable content stays in the document (see
[content scope](content-scope.md)), so the rules that draw the hover
outlines, the drop indicators and the drag cursors have to reach the
document too. Without it the shell still looks entirely correct and none of
the editing affordances appear — which is why a computed-style assertion in
`test/golden/shell-dist.spec.mjs` guards it rather than a reviewer's eye.

`app/index.html` is also the page that dist spec drives, deliberately: the
deliverable and the fixture are one page, so neither can quietly stop
working while the other passes.

## The element

| attribute | |
|---|---|
| `config` | URL of the config file, fetched on connect. Required; without it the shell says so on the page |

| property | |
|---|---|
| `auth` | An [`AuthAdapter`](auth.md). Overrides `backend.auth`; without either, a `PatAuthAdapter` reading the sign-in field |
| `fetch` | The `fetch` the config load and every API call go through. Defaults to the page's |
| `widgets` | Frontmatter widgets, **merged over** the defaults |
| `repo` | Read-only: the `CmsRepo`, once the config has loaded |

`state` is reflected out and never read back: `loading`, `unconfigured`,
`signed-out` or `ready`. It is how a host page or a test waits for the shell
without polling.

There are no custom events. The shell is the top of the application rather
than a component inside one, so there is nothing above it to notify; a host
that wants to observe a save has the editor's own `ct-saved` on the child
element.

## Signing in

A full-screen gate, not a route. With no token there is no repository to
list and no URL worth linking to, and making it a route means every other
view needs a signed-out branch and a redirect that can loop.

The gate names the repository from the config, lists the two permissions a
fine-grained token needs — **Contents** and **Pull requests**, both read and
write — links to GitHub's token page, and says the token is forgotten when
the tab closes. It is then **checked before the gate lets go**: the shell
reads the repository with it, so a mis-scoped token is refused next to the
field that produced it and the list of permissions that fixes it.

That check also catches the worst-shaped failure available here — a token
that can read but not push. Everything works until the first save, which
fails with somebody's afternoon in the editor. GitHub answers that case with
a 200 whose body says no, so the gate reads the body.

**The gate has a second shape.** When `backend.auth` asks for a GitHub
App — or a host page assigns an adapter that offers one — the field and
its paragraph of permissions are replaced by a single button, and the
adapter supplies both its label and the sentence under it. The shell
does not know which kind it is holding; it asks the adapter. The flow is
a top-level redirect, finished at the next boot before any route loads,
so a returning author never sees the gate flash past. See
[signing in](auth.md).

**A refused save leaves its markdown on the gate.** The 401 that brings
the gate back is usually a save — that is the request that re-throws so
the token can be dropped — and the editor goes with the token. The gate
shows what the save was carrying in a box you can copy out of, and it
survives the trip to GitHub, because the App flow signs somebody in by
leaving the page. It lasts exactly as long as the gate does, and the
panel says so: nothing puts it back into an editor on the way home.

## Where you are

Hash routes, so an entry is linkable, survives a reload, and needs nothing
of the host but a static file.

| | |
|---|---|
| `#/` | the collection list |
| `#/c/<collection>` | one collection's entries |
| `#/c/<collection>/e/<slug>` | an entry, open in the editor |
| `#/c/<collection>/new` | name and create an entry |
| `#/media` | the media library |
| `#/review` | everything in flight, across every collection |

A hash that names none of these says what it could not read, and shows it.
Falling back to the dashboard renders something indistinguishable from the
root, so a stale bookmark would read as "that entry was deleted".

## Entries

A collection's list is the repository's own listing **merged with the open
pull requests**, so an entry appears exactly once whether it is published,
under review, or exists only inside a branch. Each row carries what a person
is about to act on: the editorial status when there is a pull request, and a
separate **Not published yet** mark when there is no live page behind it at
all. Those answer different questions, and somebody about to hand a
colleague a URL needs the second one.

A folder longer than GitHub will list in one request says so. A short list
that looks complete reads as "somebody deleted my post"; a list that admits
it is partial does not.

File collections — a fixed list of paths named in the config — issue no
directory listing at all. Their entries are configuration, not discovery.

## Editing an entry

Opening an entry reads it (from its own branch if a pull request is already
open for it), parses the markdown, and mounts a `<content-tools-editor>` in
markdown mode. Saving walks back the same way: the region's HTML, the staged
media rewritten to the paths they will have, the markdown spliced so that
**untouched blocks keep their original bytes**, and one commit on
`cms/<collection>/<slug>` carrying the entry and its images together.

The result is the property the whole project rests on: editing one paragraph
produces a one-line diff, and a reviewer can read it.

**Submit for review** opens the pull request, or adds a commit to the one
already open — never a second one, because a review is a conversation and
restarting it throws away every comment on it. A new pull request starts as
a draft; `#/review` is where it moves.

Three things the entry screen does that are worth knowing about:

- **Leaving with unsaved work is caught**, with a panel offering to stay or
  to discard, including when the exit is the browser's own tab close.
- **A conflict shows you your own bytes.** If somebody pushed to the entry's
  branch while it was open, the save is refused rather than carrying their
  work away, and the markdown that was about to be written is shown in a
  selectable pane beside the reload button. A conflict is the one failure
  where the person's work is still in hand and the only way forward throws
  it away.
- **The open document is never re-parsed after a save.** Re-reading the file
  the shell just wrote would renumber its blocks while the live DOM still
  holds the old ones, and the next save would splice against the wrong
  originals — content corruption inside a diff that still looks reviewable.

## Frontmatter

A collection's `fields` become a form above the editor. Nine widgets ship:

| `widget` | |
|---|---|
| `string` | one line |
| `text` | several |
| `number` | numeric, kept as a number in the YAML |
| `boolean` | a checkbox |
| `date` | a date, written as a date |
| `datetime` | a date and a time |
| `select` | `options` from the config; a `select` without them is a config error at parse time, not an empty dropdown at runtime |
| `list` | comma-separated in, a YAML sequence out |
| `image` | a path, with a live preview of what it resolves to |

`date` is separate from `datetime` on purpose: writing
`2024-01-02T00:00:00.000Z` where the file said `2024-01-02` changes what the
file means, and makes the diff unreviewable.

`required: true` refuses the save and marks the field itself, before
anything is computed — refusing afterwards would mark the field and commit
anyway. `default:` is applied when an entry is **created** and deliberately
not when one is opened: filling a missing key in on open would turn every
later save of that file into a frontmatter rewrite, which is exactly the
whole-file diff this project exists to avoid.

**The frontmatter block keeps its bytes unless a value actually changed.**
Comments, key order and quoting survive a body-only edit, because the save
does not pass the block through the serializer at all when nothing in it is
different.

**Keys the config never declared are preserved.** A `layout:` or `aliases:`
that no field describes is not deleted because somebody saved a post — that
failure surfaces days later as pages that stopped rendering.

Two refusals, both deliberate:

- A frontmatter block whose YAML did not parse, or that parsed to something
  that is not a set of keys, **disables the form** and says why. The block
  is saved exactly as it stands. Merging a form into content nobody has read
  replaces a person's broken-but-recoverable frontmatter with whatever the
  form happened to hold.
- An unknown `widget` renders the value **read-only**, names the widget it
  did not recognise, and passes the key through untouched. It does not fall
  back to `string`: silently editing a structured field as text is how
  garbage gets written into somebody's data model.

A site with a field of its own adds a widget rather than forking the build:

```js
document.querySelector('content-tools-cms').widgets = {
    relation: (doc, field, value) => ({node, value: () => …, validate: () => null})
};
```

It is merged over the defaults, so registering one does not lose the other
nine.

## Creating and deleting

**New entry** asks for a title and shows the filename it will produce as you
type, expanded from the collection's `slug` template. A name already taken —
on the base branch or by an open pull request — is refused before anything
is written.

**Delete entry** asks once, then opens a pull request whose commit removes
the file. The entry stays on the site, and in its collection's list, until a
human merges it. Both `create` and `delete` are per-collection permissions
and both default to off; letting authors add posts is not the same as
letting them take pages down.

## Media

A read-only grid of the repository's media folder, in two places that are
one view: `#/media`, where it browses, and a panel under an open entry,
where each tile can also be inserted — after the caret if it is in the
entry, at the end of the entry if it is not, which is somewhere the author
can see it and move it rather than nowhere.

Thumbnails come from the **published site first** — that URL needs no token,
it is the cheapest source, and it is the URL the entry will actually
reference, so a thumbnail that renders is also a check that the reference
will. A file the site does not serve yet is read from the API instead and
shown from the bytes.

**There is no upload here.** Images still arrive through the editor's own
image dialog, which stages them in the browser so the picture and the entry
referencing it land in one commit. A standalone upload is exactly the orphan
blob that design exists to prevent: every abandoned edit would leave a file
behind, and a reviewer opening the first of two commits sees a post pointing
at something that is not there yet.

## In review

`#/review` is everything waiting for somebody, across every collection. The
collection list answers "what is on the site"; this answers "what is waiting
for me", and an author with three changes in flight across two collections
can only answer the second by opening both — which is how a change sits in a
branch for a fortnight because nobody remembered it was there.

Each row moves its entry between **Draft**, **In review** and **Ready**, and
links out to the pull request.

**The shell never merges.** Branch protection, required reviews and
CODEOWNERS are the repository's own controls, and a tool that can write,
approve and publish in one session has quietly removed the review gate that
is the entire premise of this workflow. Moving an entry to Ready says it is
finished, not that it is published; a human merges it on GitHub.

## When something goes wrong

Every failure lands **on the page**, in one region, and never only in the
console — a shell that looks idle when it has failed is worse than one that
says so. A misconfigured deployment names the offending path in the config
file (`collections[2].folder`), which is the likeliest failure a site
operator will ever hit and so gets the best message. A revoked token returns
to the gate rather than failing every later request the same way.

## What it deliberately does not do

- **Merge.** See above.
- **Preview.** The editor is already WYSIWYG; a real preview needs the
  site's own templates and CSS, which is a config key and a piece of work of
  its own.
- **Two editors at once.** `ContentTools.EditorApp` is a singleton and one
  `<content-tools-editor>` per page is a rule, not a bug being worked
  around. The shell opens one entry at a time and tears it down repeatably,
  which is what Milestone 2 bought instead of trying to lift the rule.
- **Rotate and crop.** Both need something that can re-encode an image, and
  this deployment is a repository and a browser with nothing in between.

One rough edge worth knowing about: the editor's toolbox is `position:
fixed` chrome that defaults to the top-left of the viewport, which in this
shell is over the first column of the main pane. It is draggable and its
position is remembered, so it costs an author one drag, once.

## Trying it

```sh
npm run dev
```

then <http://127.0.0.1:8931/app/>. Point `app/cms-config.yml` at a
repository you can push to, paste a fine-grained token, and the shell will
list a collection, open an entry, and submit a pull request. The assertion
no test can make is the one worth making by hand: open the resulting diff
and check it is small.
