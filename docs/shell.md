# The shell

`@jamesjnadeau/content-tools/shell` is the management application a site's
authors open at `/admin`. It lists what is published and what is in review,
opens and closes pull requests, edits an entry's frontmatter, and creates
and deletes entries.

It does **not** edit the words. Those are written on the site's own page,
with the real template around them, by
[the in-page surface](in-page.md) — so what you are editing looks like what
a reader will see. Each entry screen here offers a link to that page.

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

The shell carries **no editor at all**. It does not import `./element`, it
does not register `<content-tools-editor>`, and none of the ContentEdit
library or the markdown parser's HTML walkers reach it — which is most of
why `dist/shell.js` and its chunks come to ~143 kB gzipped rather than the
~215 kB they were when an editor lived here. `./shell` and `./element` on
one page no longer interact at all.

That is an invariant rather than an accident. `EditorApp` is a process-wide
singleton, so an editor mounted here would hold the one-per-page lease and
the in-page surface — on the site's own pages, which is where the words are
written — would refuse to boot with nothing in any stack trace.

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
  dist/               <- shell.js and its chunks
```

One build, many deployments, one config file each. `app/` ships in the npm
package as well as in this repository, so
`node_modules/@jamesjnadeau/content-tools/app/` is a copy to start from.

**There is no content stylesheet here**, and there was one until this
screen stopped holding an editor. The rules it carries — hover outlines,
drop indicators, drag cursors — exist for editable content sitting in the
document, and there is none on this page: the words of an entry are
written on the site's own page, and the script that puts an editor there
links the sheet itself. Which is the only arrangement that could work
anyway, since a page this deployment does not own cannot be asked to carry
a `<link>`.

That other half is **[the in-page surface](in-page.md)**, and it is the
same install plus one `<script>` tag on the site's own template. Deploying
this screen alone is a coherent thing to do — the entry list, the review
queue, create and delete all work — but the Edit button will have nowhere
to send anybody, so do both.

`app/index.html` is also the page `test/golden/shell-dist.spec.mjs` drives,
deliberately: the deliverable and the fixture are one page, so neither can
quietly stop working while the other passes.

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
than a component inside one, so there is nothing above it to notify — and
there is no child element to listen to either, since the editor is on the
site's own pages. A host that wants to observe a save watches `state` and
the repository it was handed.

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
fails with somebody's work already in it. GitHub answers that case with a
200 whose body says no, so the gate reads the body.

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
the token can be dropped — and the open entry goes with the token. The
gate shows the whole file the save was carrying, frontmatter and body
together, in a box you can copy out of; it survives the trip to GitHub,
because the App flow signs somebody in by leaving the page. It lasts
exactly as long as the gate does, and the panel says so: nothing puts it
back into the form on the way home.

## Where you are

Hash routes, so an entry is linkable, survives a reload, and needs nothing
of the host but a static file.

| | |
|---|---|
| `#/` | the collection list |
| `#/c/<collection>` | one collection's entries |
| `#/c/<collection>/e/<slug>` | one entry: its fields, its pull request, its link to the page |
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

## Opening an entry

Opening an entry reads it (from its own branch if a pull request is already
open for it) and shows three things: the frontmatter form, the pull request
it belongs to, and **Edit on the site** — a link to the page this entry is
published on, in a new tab, where its words are written.

Which page that link goes to depends on whether the entry has a draft:

- No pull request → the **live** page, built from the base branch.
- A pull request → that pull request's **deploy preview**, because a new
  post and a post under review are both absent from the live site and the
  preview renders the branch an edit would be committing to.
- A pull request and no `site.preview` configured → the live page, **with a
  warning**, because editing it would write over the draft.

A collection that declares no `page` gets no link, and the link is removed
rather than emptied — a hidden `<a href="">` is a link to the current page,
and a screen reader in links mode still offers it.

**The link carries this tab's token**, because the page it opens is a
different browsing context and usually a different origin, so it can see
nothing `/admin` put away. The `href` itself carries only `?cms-edit` —
copy it, middle-click it, and it reaches a page that says how to sign in
— and the token is added only for an unmodified primary click, on the
fragment, where the receiving script strips it before it loads anything.
[Signing in](auth.md#handing-the-token-to-the-sites-own-page) has the
whole argument.

Saving from here writes the frontmatter block and **nothing else**: the body
is never read, never rendered and never put back through a walker, so it
comes back byte for byte. That is a property of the code path rather than of
any serializer's fidelity, which is the strongest form it can take.

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

A collection's `fields` become the entry screen's form — which, since the
body moved to the site's own page, is the whole of what this screen edits.
Nine widgets ship:

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

Then it opens the same entry screen as anything else: the frontmatter form,
and Submit. **The first Submit commits a stub**, and that ordering is
load-bearing rather than tidy. The words are written on the site's own page,
that page is a deploy preview, a preview is built for a pull request, and a
pull request needs a commit — so the file has to exist before there is
anything in it. A collection whose fields declare no defaults gets a file
with nothing in it at all, which is a file, which is a pull request, which
is a page to write on.

**Delete entry** asks once, then opens a pull request whose commit removes
the file. The entry stays on the site, and in its collection's list, until a
human merges it. Both `create` and `delete` are per-collection permissions
and both default to off; letting authors add posts is not the same as
letting them take pages down.

## Media

`#/media` is a read-only grid of the repository's media folder: what is in
it, what each file is called, and whether it can be read at all. It is a
browser, and that is the whole of it.

**It inserts nothing**, and it used to. Until `/admin` became management
only there was a second copy of this grid under an open entry with an Insert
button on every tile. A picture belongs in an entry's words, and this screen
no longer has any — inserting one here would be inserting it into a body
nothing on this page can see. Pictures go in from the in-page surface, where
the words are.

Thumbnails come from the **published site first** — that URL needs no token,
it is the cheapest source, and it is the URL the entry will actually
reference, so a thumbnail that renders is also a check that the reference
will. A file the site does not serve yet is read from the API instead and
shown from the bytes.

**There is no upload here either**, and that was true before the insert
went. Images arrive through the image dialog on the site's own page, which
stages them in the browser so the picture and the entry referencing it land
in one commit. A standalone upload is exactly the orphan blob that design
exists to prevent: every abandoned edit would leave a file behind, and a
reviewer opening the first of two commits sees a post pointing at something
that is not there yet.

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
- **Edit the words.** Deliberately, and it is the reason this document
  describes a management application rather than an editor. An entry's body
  is written on the site's own page with the site's own template around it,
  which is a preview that costs nothing because it is the real thing.
- **Preview.** For the same reason: there is nothing here to preview. The
  page the Edit link opens *is* the preview.
- **Mount an editor at all.** Not a limitation being worked around — an
  invariant. `ContentTools.EditorApp` is process-wide, so an editor here
  would hold the one-per-page lease and the surface on the site's own pages
  would refuse to boot, silently. A test asserts that nothing under
  `src/shell/` imports `src/element/`.
- **Rotate and crop.** Both need something that can re-encode an image, and
  this deployment is a repository and a browser with nothing in between.

## Trying it

```sh
npm run dev
```

then <http://127.0.0.1:8931/app/>. Point `app/cms-config.yml` at a
repository you can push to, paste a fine-grained token, and the shell will
list a collection and open an entry. Changing a frontmatter field and
pressing Submit opens a pull request from here; changing the *words* means
pressing Edit, which opens the entry's published page — so a full round
trip needs a deployed site as well, which is what
[the round trip, by hand](round-trip.md) walks through.

The assertion no test can make is the one worth making either way: open the
resulting diff and check it is small.
