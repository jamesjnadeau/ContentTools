# The git-backed half

`@jamesjnadeau/content-tools/cms` is everything the editor deliberately is
not: the repository a deployment edits, the token it edits with, and the
branch, commit and pull request a save turns into.

It is a **separate entry** (`dist/cms.js`) that imports nothing from the
editor, and the editor imports nothing from it. Their contract still ends at
`ct-saved`, which hands you a string. This half decides what happens to that
string.

```sh
npm install @jamesjnadeau/content-tools
```

```js
import {
    CmsRepo, MediaStore, PatAuthAdapter, loadConfig, mediaUploader, statusOf
} from '@jamesjnadeau/content-tools/cms';
```

Everything here works with no DOM, apart from `mediaUploader`, which is the
one piece that touches the image dialog.

If you want the application rather than the machinery, [the
shell](shell.md) is this half with a UI on it, and is what a site's authors
actually open.

## The shape of it

One deployment edits **one repository**, configured at runtime. The same
build is deployed alongside many sites; each instance is handed the config
for the site it serves. There is never more than one repository live, and
never a cross-repository pull request.

Every entry has **one branch and one pull request**, named
`cms/<collection>/<slug>`. Saving the same entry twice adds a commit to that
branch; it does not open a second pull request, because a review is a
conversation and restarting it throws away every comment on it. Where the
entry is in review is a **label** — `cms/draft`, `cms/in-review`,
`cms/ready`.

## Config

```yaml
backend:
  repo: owner/site
  branch: main          # default: main
  auth:                 # default: {kind: pat} -- see docs/auth.md
    kind: github-app
    clientId: Iv1.xxxxxxxx
    proxy: https://cms-auth.example.workers.dev

media:
  folder: static/images # where uploads are committed
  publicPath: /images   # what the content references them by

site:                   # optional -- see "Where the content is published"
  base: /my-project     # path prefix the built site is served under
  preview: https://deploy-preview-{{pr}}--site.netlify.app

collections:
  - name: blog
    label: Blog
    folder: content/blog
    create: true        # default: false -- may authors add entries?
    delete: true        # default: false -- and may they remove them?
    extension: md       # default: md
    slug: "{{year}}-{{slug}}"   # default: "{{slug}}"
    page: /blog/{{slug}}/       # where an entry is published
    body: main                  # the element holding its rendered body
    fields:
      - {name: title, widget: string}
  - name: pages
    label: Pages
    body: main
    files:
      - {name: about, label: About, file: content/about.md, page: /about/}
```

```js
const config = await loadConfig('/cms-config.yml');   // YAML or JSON
```

`loadConfig` tries `JSON.parse` first and falls back to a **lazily imported**
YAML parser, so a JSON-configured site never downloads it. `parseConfig(obj)`
is the same validation without the fetch, for a config you already hold.

A bad config throws a `ConfigError` naming the offending path
(`collections[2].folder`). That message is most of the value of the function:
a typo in a hand-edited file is the likeliest failure a site operator will
ever hit.

`fields` is **validated and rendered nowhere**. The widgets are the shell's
job; the shape is fixed now so a site's config file does not have to change
later.

`create` and `delete` are separate permissions and both default to false.
Letting authors add posts is not the same as letting them take pages down,
and a collection that says neither is read-only.

`slug` is the filename template for new entries, expanded from the title the
author types. The tokens are `{{slug}}`, `{{year}}`, `{{month}}` and
`{{day}}`, and the dates are the author's own calendar day rather than UTC.
It is checked at parse time rather than at create time: an unknown token, a
`/`, a brace that is not part of a token, or a template with no `{{slug}}`
in it is a `ConfigError` naming `collections[0].slug`. The alternative is a
collection that quietly names every file `hello-{draft}.md`, or names them
all the same thing and then refuses the second one.

```js
import {slugify, expandSlug} from '@jamesjnadeau/content-tools/cms';

slugify('Hello, World!');                      // 'hello-world'
expandSlug(collection, 'Hello World!', new Date());   // '2026-hello-world'
```

## Where the content is published

`backend` says where the content is **stored**. `site` and `page` say where
it is **served**, which is what lets an entry be edited on its own page
rather than in an admin pane — see [in-page editing](in-page.md). Both are
optional: a deployment that omits them edits perfectly well through the
admin screens and simply offers no in-page editing.

```js
import {pagePath, editUrl, entryForUrl} from '@jamesjnadeau/content-tools/cms';

pagePath(config, collection, 'hello');      // '/my-project/blog/hello/'
editUrl(config, collection, 'hello', 12);   // the pull request's preview
entryForUrl(config, location.href);         // {collection: 'blog', slug: 'hello'}
```

`page` is a URL template **relative to `site.base`**, and `{{slug}}` is its
only token. Deliberately: a filename is decided once, when the entry is
created, but a page URL is recomputed every time something links to it, so a
`{{year}}` here would be read from the clock at link time and send an author
editing a January post to last year's URL. A file collection writes `page`
per file instead, as a literal — it names its entries one by one, so there
is nothing for a template to vary over.

`body` is the CSS selector for the element holding the rendered body, and it
is **required** wherever `page` is set rather than defaulting to something
like `main`. The in-page editor replaces that element's children with its
own render of the markdown, so a wrong default would wipe the navigation off
the screen the first time somebody pressed Edit.

`site.base` is held apart from `page` rather than written into it, because
one build can be served at two prefixes — this project's own test site
answers at `/` and at `/ContentTools-test/` on the same host. `entryForUrl`
matches a page reached by either.

`site.preview` is the URL template for a pull request's preview deployment,
with `{{pr}}` for its number. It is what makes an entry that is **not
published yet** editable at all: a new post and a post under review are both
absent from the live site, and the preview built for their pull request
renders the very branch the editor commits to. Without it `editUrl` falls
back to the live page, which shows the published text — so the shell warns
rather than linking silently.

Every rule here is checked at parse time with a `ConfigError` naming the
path, for the reason `slug` is: a `page` with no `{{slug}}` claims to be
every entry in its collection, and a `preview` written as a path resolves
against the admin's own origin and quietly sends an author to the live site.

`slugify` is the same function `safeFilename` uses for uploads, on purpose: a
post and an image named from the same title have to agree on what a filename
is.

## Signing in

```js
const auth = new PatAuthAdapter({prompt: () => tokenInput.value});
await auth.authenticate();
```

`PatAuthAdapter` holds a **fine-grained personal access token**, scoped to
the one repository the deployment edits, in `sessionStorage` — never
`localStorage`, because a token should not outlive the tab. It needs no OAuth
app, no hosted secret and nothing deployed, which makes it the adapter a
static host can use and the one to try the workflow with first.

`GitHubAppAuthAdapter` is the other one: a **Sign in with GitHub** button
for a site with authors, at the cost of one small deployed proxy.
[docs/auth.md](auth.md) covers both, and what each one costs.

They implement `AuthAdapter`, which is all the rest of this half knows
about:

```ts
interface AuthAdapter {
    authenticate(): Promise<{token: string}>;
    logout(): Promise<void>;
    currentToken(): string | null;
    /** What the gate offers instead of a secret field, if anything. */
    readonly gate?: {readonly label: string; readonly note: string};
    /** Finish a flow the page was redirected back from, if there is one. */
    resume?(): Promise<void>;
}
```

The last two are optional, which is why adding the App adapter changed
nothing about the PAT one.

Where `sessionStorage` is unavailable — a sandboxed iframe, some
private-browsing modes — the token lives in memory for that tab instead of
the page failing to start.

## Reading and saving

```js
const repo = new CmsRepo({config, token: () => auth.currentToken()});
```

Pass the token as a **function**, not a string. The client asks for it on
every request, so signing out takes effect instead of the client holding the
string it was built with.

```js
await repo.listEntries('blog');            // {entries, truncated}, on the base branch
const entry = await repo.readEntry('blog', 'hello');
await repo.listInFlight();                 // the open cms/* pull requests
```

`listEntries` reports `truncated` because GitHub's contents endpoint stops at
1000 entries per directory and says so nowhere in the response. Show it rather
than hiding it: a list an author's own post is missing from reads as "somebody
deleted it".

`readEntry` returns the version **under review** when a pull request is open
for that entry, not the one on the base branch. Reading the base would show a
version missing the user's own unmerged work, and the next save would commit
that over the top — a silent revert of everything in the pull request.

```js
const result = await repo.saveEntry('blog', 'hello', {
    content,                 // the new file contents
    media,                   // files to land in the SAME commit
    parent: entry.commit,    // the version this edit was made against
    message: 'Update blog/hello',
    status: 'in-review'      // optional; a new pull request defaults to draft
});

result.pull.html_url;   // the pull request
result.commit;          // the commit just made, or null if nothing changed
result.changed;
```

`parent` is optimistic concurrency and is worth passing whenever a user has
had the entry open for longer than a moment. Without it the save builds on
whatever the branch holds at that instant, so a reviewer's push between the
read and the save is quietly carried away with the pre-push tree. With it,
that case is a `ConflictError` you can catch, re-read and re-apply:

```js
import {ConflictError} from '@jamesjnadeau/content-tools/cms';

try {
    await repo.saveEntry('blog', 'hello', {content, parent: entry.commit});
} catch (error) {
    if (error instanceof ConflictError) {
        // somebody pushed; re-read and merge the user's work
    }
}
```

Saving an entry that has not changed and carries no media commits nothing: it
returns `changed: false` if a pull request is already open, and throws
`NothingToSaveError` if there is nothing to open one for.

A `cms/...` branch whose pull request is no longer open is treated as this
tool's leftover and reset onto the base branch, which `SaveResult.reset`
reports. That discards a branch, not the work on it — a closed pull request's
commits stay reachable through the pull request itself.

### Creating and deleting

```js
await repo.saveEntry('blog', slug, {content, create: true});
```

`create: true` says this save is expected to make a new file, and the save is
refused with an `EntryExistsError` if the slug is already taken — on the base
branch **or** by an open pull request. A shell that checks before opening its
editor should still pass it: that check saves somebody's afternoon, and this
one settles the race between two authors who both passed it.

```js
await repo.deleteEntry('blog', 'hello', {parent: entry.commit});
```

A delete is a pull request like any other change: one commit whose tree no
longer holds the path, on the entry's own branch, for a human to merge. The
entry stays on the site — and in `listEntries` — until they do. Deleting a
path the repository does not hold throws an `EntryMissingError` rather than
committing nothing and opening a pull request with an empty diff.

## Media

Images are **staged in the browser** and committed with the entry that uses
them. An uploader that commits on its own leaves an orphan behind every
abandoned edit, and puts the entry and its image in two commits, so a
reviewer opening the first sees a post pointing at a file that is not there
yet.

```js
const folder = await repo.github.listDirectory(config.media.folder, repo.base);
const store = new MediaStore({config, taken: folder.map(file => file.name)});

editor.imageUploader = mediaUploader({store});   // ContentTools.IMAGE_UPLOADER
```

The uploader stages the bytes against the object URL the editor previews. At
save time:

```js
const {html, media} = store.rewrite(regions.body);
await repo.saveEntry('blog', slug, {content: doc.update(html), media});
```

`rewrite` swaps every staged URL for the path the file will have and reports
**exactly the files that HTML still references** — an image the user inserted
and then deleted is never committed. Both answers come from one pass, because
two calls that can disagree disagree by shipping an entry that references
something nobody uploaded.

Filenames are lower-cased and stripped to what a URL can carry unescaped
(`My Photo.png` → `my-photo.png`), because `![](/images/my photo.png)` is not
a link to that file and nothing errors. Collisions are resolved when the file
is staged, not when it is committed, so the URL the editor shows is the URL
that ends up in the file.

The dialog's **rotate and crop controls do nothing**. Both need something
that can re-encode an image, and this deployment is a repository and a
browser with nothing in between.

`imageType(filename)` is the other half of the same agreement, and it is
public for the same reason `safeFilename` is: a media library deciding what
it can preview and what it can insert has to answer that question exactly as
the uploader does. It is a whitelist of extensions rather than a sniff of the
bytes — the repository is the one place a filename can be trusted, because
`safeFilename` wrote it — and it returns the content type or `null`.

## Editorial status

```js
import {statusOf} from '@jamesjnadeau/content-tools/cms';

statusOf(entry.pull);                      // 'draft' | 'in-review' | 'ready' | null
const pull = await repo.setStatus(entry.pull, 'ready');
```

Labels rather than GitHub's own draft flag, and not by preference: `POST
/pulls` accepts `draft` and `PATCH /pulls/{n}` does not, so moving a pull
request between draft and ready is a GraphQL mutation. A draft-based status
would have cost this half a GraphQL client, for a workflow that otherwise
needs twelve REST endpoints.

`saveEntry`'s own `draft: true` is available and off by default, for the same
reason in reverse: REST can set that flag and cannot clear it, so every entry
opened as a draft would need a human to press a button before it could merge.

`setStatus` adds the new label before removing the old one, so a pull request
is never briefly unlabelled and a board built on label queries never drops a
card. Labels outside the `cms/` namespace are left alone. It returns the pull
request with its labels as they now stand, so the copy you hold does not
still describe the status you just changed.

## The client

`repo.github` is the GitHub client, and it is public because a shell will
eventually want to reach past the entry workflow — read an arbitrary file,
open a pull request this layer has no opinion about:

```js
await repo.github.readFile('README.md', 'main');
await repo.github.listDirectory('content', 'main');
await repo.github.readBlob(sha);              // Uint8Array, for binary
```

`readFile` decodes as text; `readBlob` does not, and it takes a blob sha
rather than a path — which a directory listing already gives you. Use it for
anything that is not text: it is how a media library shows a picture the
published site does not serve yet.

It is ours, not Octokit: twelve endpoints, no dependencies, and `fetch` as a
constructor argument. Errors are a `GitHubError` carrying the status, the
API's own message and the endpoint; `ConflictError` is the subclass for a ref
update that was refused.

## Trying it

```sh
npm run dev
```

then <http://127.0.0.1:8931/playground/cms.html>. Paste a fine-grained token
for a repository you can push to, edit `playground/cms-config.yml` to name
it, and the page will list a collection, open an entry, and submit a pull
request. The assertion no test can make is the one worth making by hand: open
the resulting diff and check it is small.
