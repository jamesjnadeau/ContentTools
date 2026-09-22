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
else** — 749 bytes gzipped, with a budget that fails the build at 1.5 kB —
and everything behind that decision is behind a dynamic `import()`. The editor, the markdown parser, the GitHub client and
the config loader arrive only for somebody who is actually editing.

A reader downloads this file, asks `sessionStorage` two questions, and
downloads nothing more.

The price of that is worth stating rather than hiding: a lazy chunk that
404s from a badly-deployed static host fails nowhere until an author asks
for the editor, by which time whoever deployed it has stopped looking. The
failure lands on the screen rather than in the console — but press the
button once after deploying anyway.

## How it decides to appear

Two ways in.

- **`?cms-edit` on the URL.** This is what the Edit link on an entry screen
  under `/admin` opens with, so an author who presses it lands on the page
  itself with the editor already coming up.
- **A token already in this tab.** Once somebody is signed in the editor
  follows them as they move around the site, which is what makes it feel
  like part of the site rather than a mode you enter from somewhere else.

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
| The `body` selector found nothing | Says so, and names the element it did find |
| Nobody is signed in | Names the element too, and says where to sign in |
| Reading | Says it is reading the version **on the branch** |
| Editing | The frontmatter fields, and **Submit for review** |
| A read that failed | Says why |

Two of those name the element, and saying it twice is deliberate. Checking
a `body` selector is a deployment job, and asking somebody to obtain a token
before they can see whether they pointed it at the right element makes the
check cost an afternoon instead of a page load.

It matters because the editor **replaces that element's children**, so a
`body:` pointing at the page wrapper replaces the site's whole layout with a
post. The bar names what it found in the shape of a selector —
`article#post-3.prose` — because that is also the answer to the question the
person reading it is about to ask.

There is no Edit button. A page that is an entry, with a body element and a
token, is one you are editing; the bar's job is to say which, and to submit.

## Editing in place

The editor goes up over the body element **in place**. Nothing on the page
moves: the region is the site's own element, still in the document, with the
site's own stylesheet still applying to it. The content stylesheet — drop
indicators, hover outlines, drag cursors — is injected by this script as a
`<link>`, because a page this deployment does not own cannot be asked to
carry one.

Saving splices the edited blocks back into the markdown source and leaves
every untouched block byte-identical, exactly as it does everywhere else —
see [markdown mode](markdown-mode.md). The frontmatter fields on the bar are
the same widgets the entry screen under `/admin` uses; either surface can
edit them.

## Drafts, and why a preview URL matters

A brand-new post and a post under review are both absent from the live site,
so the live URL cannot show them. `site.preview` is what makes them editable
at all: the deploy preview built for their pull request renders the branch
the editor is committing to, so the page an author edits is the page their
change produces.

Without it, the Edit link on an unpublished entry falls back to the live URL
and the entry screen says plainly that it is doing so.

## Still to come

- **Signing in on the site's own origin.** The token lives in
  `sessionStorage`, which is per-origin — so today the bar asks you to sign
  in through the admin screens *in this tab*, and an author whose `/admin`
  is on another host cannot. The handoff is the next piece of work.
- **The deployment walkthrough** — where to put `dist/`, what a real site's
  config looks like end to end, and the test site it is proved against.
