# The in-page surface

`dist/edit.js` is the script a site puts on **its own pages**. It is the
other half of the product from [the shell](shell.md): `/admin` manages
drafts and pull requests, and the words are written here, on the published
page, with the site's real template and real stylesheet around them.

That is the whole argument for it. An editor that shows you the page you are
editing is worth more than one that shows you a text box, and it is a
preview that costs nothing because it is not a preview — it is the page.

```html
<script type="module" src="/cms/edit.js"></script>
```

One tag, on every page. Which is what decides the shape of this file.

## What a reader pays

A blog's readers outnumber its authors by a very long way, and none of them
should pay for an editor. So `dist/edit.js` is **the decision and nothing
else** — 1.39 kB gzipped, with a budget that fails the build at 1.5 kB —
and everything behind that decision is behind a dynamic `import()`. The editor, the markdown parser, the GitHub client and
the config loader arrive only for somebody who is actually editing.

That 1.39 kB is **two files and two requests**, and it is worth stating
that way rather than as one number: `edit.js` itself and one small shared
chunk under `dist/chunks/`, which holds the storage keys and the handoff
parser. The budget measures the pair, so the figure is honest — but a
deployment that copies `edit.js` without its chunk ships a page that 404s
on an import, which is the reason to say it out loud here rather than only
in the budget file.

A reader downloads those two, asks `sessionStorage` two questions, and
downloads nothing more.

One thing in it is not a decision, and it is worth naming rather than
hiding: taking a handed-over token off the URL has to happen *before*
anything is downloaded, so that code is in this file rather than behind the
import. It is what took the number from 749 B to 1.36 kB; reading `window.contentToolsEdit` (see [custom-tools.md](custom-tools.md)) added the last 30 bytes.

The price of that is worth stating rather than hiding: a lazy chunk that
404s from a badly-deployed static host fails nowhere until somebody opens a
page that wants the surface, by which time whoever deployed it has stopped
looking. The failure lands on the screen rather than in the console — but
open one page with `?cms-edit` after deploying anyway, which is enough to
ask for the chunk and needs no token. See [Checking it
worked](#checking-it-worked).

## How it decides to appear

Three ways in.

- **`?cms-edit` on the URL.** This is what the Edit link on an entry screen
  under `/admin` opens with, so an author who presses it lands on the page
  itself with the bar and the switch over it — and the page still exactly as
  its readers get it, until they press the switch.
- **A token already in this tab.** Once somebody is signed in the bar and the
  switch follow them as they move around the site, which is what makes it
  feel like part of the site rather than a mode you enter from somewhere
  else. What follows them is the offer, never the editor: every page starts
  switched off.
- **A token handed over on the fragment.** Which is how the tab comes to
  hold one in the first place — see [Signing in](#signing-in) below.

A browser that refuses `sessionStorage` — a sandboxed iframe, some private
modes — is a browser where nobody is signed in, so the honest answer there
is the flag alone.

A host page that wants to decide for itself — a staging site that offers the
editor to everybody, a CMS embedded in something larger — imports the module
and calls `boot(window)` on its own terms.

## Which entry a page is

Two answers, and the page's own markup wins.

```yaml
site:
  # No `base:` for a site at the root. A site under a prefix says so here.
  preview: https://deploy-preview-{{pr}}--example.netlify.app

collections:
  - name: blog
    folder: content/blog
    page: /blog/{{slug}}/      # the URL this collection's entries are at
    body: article .content     # the element holding the rendered body
```

`page:` maps a URL back to a slug, and `base:` is held apart from it on
purpose: one build can be served at two prefixes, and a `page` carrying the
prefix would match on one of them and tell the author the page they are
looking at is not an entry.

A site whose URLs no template can describe — a catch-all route, a locale
prefix, a paginated archive — says so in its own markup instead, and that
beats the config wherever it is present:

```html
<meta name="cms:entry" content="blog/hello">
<article data-cms-body>…</article>
```

A `<meta>` naming a collection that is not configured maps to nothing rather
than being trusted: that is a typo in a template, and mapping it to nothing
is what makes it visible.

## The bar

Chrome in a shadow root, content in the light DOM — Mode A, one level up,
and for the same reasons `<content-tools-cms>` does it. Here the isolation
matters more than it does under `/admin`, because the page around the bar
belongs to somebody else: their rules must not reach our chrome, and ours
must not reach a single node of their site. A CMS that restyles the page it
is editing is a CMS that lies about what the page looks like.

The bar is where **every** answer lands, including the three that are
somebody's mistake — because a script that decides a page is not editable
and then says nothing is indistinguishable from a script that failed to
load.

| | |
|---|---|
| The config did not parse | Says so, naming the offending path verbatim |
| This page is not an entry | Says so. Most pages of most sites are not |
| The `body` selector found nothing | Says so, quoting the selector it looked for |
| Nobody is signed in | Says where to sign in |
| Reading | Says it is reading the version **on the branch** |
| Open, switch off | Says to press the pencil |
| Editing | The frontmatter fields, and **Submit for review** |
| A read that failed | Says why |

It says the entry — `blog/hello` — and what state it is in, and **nothing
about which element the `body` selector matched**. It used to: `Found
article#post-1.post, matched by article.post.` was on the bar in four of
those states. That is a deployment question charged to every author on
every page, for ever, and it reads as debug output because it is.

Where the selector is still reported is the arrangement that actually
breaks: nothing matched, and the bar quotes what it looked for. For the
other mistake — a selector that matches the **wrong** element — see
[Checking it worked](#checking-it-worked). It is worth checking, because
the editor replaces that element's children, so a `body:` pointing at the
page wrapper replaces the site's whole layout with a post.

The bar never starts the editor. That is the switch's job, below.

## The switch

v1.6.16's ignition, back where it was: a **pencil** at the top left of the
page, which becomes a **green tick** and a **red cross** while you are
editing.

Opening an entry does not change the page. The script reads the version on
the branch, fills the frontmatter form, puts the editor element up and
mounts its switch — and stops. Until the pencil is pressed the page is
still showing exactly what the site published, every word of it, which is
what an author who is only looking should see.

| | |
|---|---|
| **Pencil** | Puts our render of the branch in the page and starts the editor |
| **Green tick** | Keeps what you typed and takes the tools away |
| **Red cross** | Discards this session's changes |

The waiting applies however you arrived. Pressing **Edit** under `/admin`
says *which page to open*, not that the reader's view of it should be
replaced before anybody has looked at it — so that route needs the pencil
too.

The tick is not a save. **Submit for review** on the bar is the only thing
that writes to the repository, and it stays live after a tick precisely so
that it can: the edits are kept, the tools are gone, and the button still
commits them.

The cross goes back to wherever the pencil found the page. On the first
press that is the site's own markup; after a tick it is the edits the tick
kept, which are still yours and still what Submit would write. Discarding
changes that were confirmed in an earlier session would be silent data
loss — the confirmation dialog only asks about the session you are in.

## Editing in place

Once the pencil is pressed, the editor goes up over the body element **in
place**. Nothing on the page moves: the region is the site's own element,
still in the document, with the site's own stylesheet still applying to it.
The content stylesheet — drop indicators, hover outlines, drag cursors — is
injected by this script as a `<link>`, because a page this deployment does
not own cannot be asked to carry one.

What the pencil swaps in is **our render of the markdown on the branch**,
not the HTML the template rendered. The two are different documents even
when they look identical: the template's was built from the base branch by
a static site generator, and ours carries the block indices the
byte-preserving splice reads back. Editing the template's markup would
serialize to bytes that splice against the wrong blocks.

Saving splices the edited blocks back into the markdown source and leaves
every untouched block byte-identical, exactly as it does everywhere else —
see [markdown mode](markdown-mode.md). The frontmatter fields on the bar are
the same widgets the entry screen under `/admin` uses; either surface can
edit them.

## A site's own tools

The in-page editor is always in markdown mode and builds its own toolbox, so a site adds a
tool by declaring `window.contentToolsEdit` before `edit.js` runs. That object has a `setup`
that is handed the library, an `allowTools` list, and CSS for the icon. None of it costs a
reader anything. See [custom-tools.md](custom-tools.md#the-in-page-surface-disteditjs).

## Drafts, and why a preview URL matters

A brand-new post and a post under review are both absent from the live site,
so the live URL cannot show them. `site.preview` is what makes them editable
at all: the deploy preview built for their pull request renders the branch
the editor is committing to, so the page an author edits is the page their
change produces.

Without it, the Edit link on an unpublished entry falls back to the live URL
and the entry screen says plainly that it is doing so.

## Signing in

There is no sign-in form here, and there is not going to be one: this
script runs on a published page that the deployment does not own, and
putting a credential field on somebody's blog post is a phishing lesson
nobody should be teaching their readers.

What happens instead is that `/admin` hands the token over when it opens
the link. The token travels in the URL **fragment**, the script takes it
off the URL before it downloads anything, and it lands in this tab's
`sessionStorage` under the key its adapter reads — so an author whose
`/admin` is on another host, which is every author editing a draft on a
deploy preview, is signed in on arrival.

[Signing in](auth.md#handing-the-token-to-the-sites-own-page) has the
whole of that: why a fragment, what it costs, what it does not, and why
the OAuth implicit-flow objection does not transfer.

A tab that was never handed one, and never signed in, gets a bar that
says so:

> Sign in through the admin screens in this tab, then come back to edit it.

which is also what a copied link or a middle-clicked one gets, because
the `href` deliberately carries no secret.

## Deploying it

Copy `dist/` to the static host that serves the site, put one tag on every
page, and add three keys to the config. There is no build step and no
server: the site is still whatever it was, with a script on it.

### What travels

```
your-host/
  cms-config.yml                  <- yours: the repository, the collections
  admin/index.html                <- app/index.html: the management screens
  cms/
    edit.js                       <- the script on the site's own pages
    shell.js                      <- what /admin/ loads
    chunks/*.js                   <- BOTH of the above import from here
    content-tools-content.min.css <- edit.js links this itself
    images/                       <- icons.woff and four SVGs
```

One folder for both entry points, which is not just tidiness: `shell.js`
and `edit.js` share most of their graph — the library, the editor element,
the markdown parser — so splitting them across two folders ships two copies
of it and warms two caches for one page.

Three things in that tree fail quietly if they are missed.

- **The chunks.** Their filenames are **content-hashed**. Copy a new build
  over the top of an old folder and the previous chunks stay behind while
  the entries import the new names — a 404 on an import of a file nobody
  touched, at runtime, in the browser, long after whoever deployed it
  stopped looking. Delete the folder and copy, rather than copying over.
- **`content-tools-content.min.css`.** `dist/edit.js` links this itself, at
  a URL worked out from its own location — it is the only file on this side
  of the dynamic import that knows where `dist/` is, which is also why it
  has to sit **beside** `edit.js` rather than anywhere else. Without it the
  editor comes up and none of the editing affordances do.
- **`images/`.** That stylesheet references five of them. Four are drop
  indicators and the video placeholder, and their absence is visible. The
  fifth is `icons.woff`, and its absence is not: the face registers in
  `error` state, the editor sees a face named `icon` already there and
  skips its own data-URI fallback, and every tool in the toolbox renders as
  a tofu box.

### The tag

```html
<script type="module" src="/cms/edit.js"></script>
```

On **every** page, in the template that wraps the site — not only on the
pages that are entries. Restricting it saves a reader nothing (the whole
cost is the two requests above) and it breaks the behaviour that makes the
thing feel like part of the site: a signed-in author keeps the editor as
they move from page to page.

The script finds its config at `/cms-config.yml`. A site served under a
path prefix — a GitHub Pages project site, anything behind a subdirectory —
has to say where it really is:

```html
<meta name="cms:config" content="/my-project/cms-config.yml">
```

### The config, end to end

Three keys beyond what [the shell](shell.md) needs, and each is a different
kind of mistake if it is wrong:

```yaml
site:
  # The prefix the built site is served under. Omit it for a site at the
  # root. Held apart from `page` because one build can be served at two
  # prefixes: it is STRIPPED when a page asks which entry it is showing,
  # and ADDED when /admin builds a link.
  base: /my-project
  # A pull request's deploy preview. Without it, an unpublished entry has
  # no page that shows it -- the live site is built from the base branch.
  preview: https://deploy-preview-{{pr}}--example.netlify.app

collections:
  - name: blog
    folder: src/content/blog
    # Which URL this collection's entries are published at, both ways.
    page: /blog/{{slug}}/
    # The element on that page holding the rendered body, and NOTHING
    # else. The editor replaces its children.
    body: article.post-body
```

Leave `site` out entirely and nothing breaks: `/admin` still manages
drafts and pull requests, it simply offers no link to a page and says so.

### Checking it worked

Open a published entry with `?cms-edit` on the end, signed out. You should
get the bar, naming the entry — `blog/first-post` — and saying where to
sign in. That one request checks four things most likely to be wrong: the
script loaded, the lazy chunk beside it loaded (a `dist/` deployed with
`chunks/` missing 404s there and nowhere else), the config parsed, and
`page:` maps this URL to an entry. No token needed, which is the point of
the bar answering before authentication rather than after. If instead it
says nothing on the page matches your selector, `body:` is why, and the
message quotes what it looked for.

Then press the pencil once, top left, with a token in the tab. The toolbox
appears and the body becomes editable — **and this is the check on `body:`
itself**. Look at what went editable. It should be the post and nothing
around it; if your header, your nav or your footer has hover outlines on
it, `body:` is pointing at a wrapper and the editor would replace the lot.
Press the red cross and the page goes back exactly as it was, so the check
costs nothing and writes nothing.

Until that press the page is still the one the site published, whether you
typed `?cms-edit` yourself or arrived from `/admin`.

### The site it is proved against

[`jamesjnadeau/ContentTools-test`](https://github.com/jamesjnadeau/ContentTools-test)
is an Astro site with one post, deployed to GitHub Pages **and** Netlify
from one build, with the CMS vendored into it by a script. It is the
arrangement described above, running: `public/cms-config.yml` carries the
three keys, `src/layouts/BaseLayout.astro` carries the tag, and
`src/pages/blog/[...slug].astro` wraps the rendered body in the element
`body:` names.

It is also where the two-prefix problem is real rather than hypothetical —
the same build answers at `/ContentTools-test/` on Pages and at `/` on
Netlify — which is why `site.base` is a key of its own instead of being
folded into `page`.

[The round trip, by hand](round-trip.md) walks through editing an entry on
it, or on a repository of your own.
