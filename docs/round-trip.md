# The round trip, by hand

This is the one check the test suite cannot make for you: open an entry from
a **real** repository, edit it, submit it, and read the pull request GitHub
actually received. Everything below runs in your own browser against your own
repository, with your own token.

It is worth doing, and not as a formality. The first time it was run it found
a bug that 1,577 unit tests and 14 tests against the built artifact had all
missed: every write came back `415`, because the client sent GitHub's
versioned media type as a request `Content-Type`, which GitHub accepts on
`Accept` and refuses on a body. Reads were unaffected, so a deployment signed
in, listed a collection, opened an entry and rendered it perfectly — and then
failed on the first Submit. The fake GitHub the suite runs against did not
look at `Content-Type`, and a fake that accepts what the real server rejects
certifies a broken client.

What you are checking, in order of how much it matters:

1. The save reaches GitHub at all — a branch, a commit and a pull request.
2. **The diff is small.** One edited paragraph should be one hunk. A pull
   request whose diff is the whole file because the serializer re-wrapped
   every line is unreviewable, and an unreviewable diff defeats the entire
   point of the workflow.
3. The frontmatter block is byte-identical when you did not touch it.

**The CMS is two surfaces and this guide uses both.** `/admin` lists
collections, entries and pull requests and edits the frontmatter; the words
of an entry are written on the site's **own published page**, with the
site's real template and real stylesheet around it. So the fullest version
of this exercise wants a deployed site as well as a repository — section 3
gives you both a way to get one and a way to do without.

Budget twenty minutes, or forty if you are deploying a site from scratch.

## 1. A repository to edit

Any repository with a markdown file in it will do, but a repository that is
also a **deployed site** will do much more, because that is where the body of
an entry is edited.

[`jamesjnadeau/ContentTools-test`](https://github.com/jamesjnadeau/ContentTools-test)
is one: an Astro site with one post, deployed to GitHub Pages and Netlify from
a single build, with the whole CMS vendored into it. Fork it and connect the
fork to Netlify (or let its GitHub Pages workflow run) and you have the
complete arrangement in a few minutes:

| in the fork | what it is |
|---|---|
| `public/cms-config.yml` | the config both halves read — already written |
| `public/cms/` | the vendored `shell.js`, `edit.js`, chunks and assets |
| `public/admin/index.html` | the management screens, at `/admin/` |
| `src/layouts/BaseLayout.astro` | the one `<script>` tag, on every page |

It lives under `public/` because Astro copies only that directory into the
build; at the repository root it is a 404 on the deployed site.

If you fork it, **skip sections 3 and 4** and sign in at your deployment's
`/admin/` instead. Everything else reads the same. Two values in
`public/cms-config.yml` are about *that* repository rather than yours and
need changing: `backend.repo`, and `site.preview`, which names the Netlify
site that builds your pull requests.

Using your own repository instead is fine, and section 3 covers running the
CMS locally against it. You then get the admin half in full and the in-page
half against a stand-in page rather than your real site.

Either way you need push access, and at least one commit on the default
branch.

## 2. A fine-grained token

Go to
[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).

- **Resource owner** — you, or the organization that owns the repository.
- **Repository access** — *Only select repositories*, and pick the one.
- **Permissions → Repository permissions**, two of them, both **Read and
  write**:
  - **Contents** — reading the entry, and writing the blob, tree, commit and
    branch.
  - **Pull requests** — opening the pull request, and moving the `cms/*`
    label that carries its editorial status.

Both must be *read and write*. A token with Contents set to read-only is the
nastiest shape of failure available here, which is why the shell checks for it
at the sign-in gate rather than at the first save: everything works — sign in,
browse, open, edit — right up to Submit, with an afternoon's writing already
in the editor.

Copy the token. You will paste it once, into the shell's sign-in field; it is
held in `sessionStorage` and forgotten when you close the tab.

## 3. Run it locally (skip if you forked the test site)

```
git clone https://github.com/jamesjnadeau/ContentTools.git
cd ContentTools
npm ci
npm run dev
```

`npm run dev` builds `dist/` and serves the repository on
**http://127.0.0.1:8931/**, which redirects to `/app/` — the shipped
application, unmodified. It is the same page `test/golden/shell-dist.spec.mjs`
drives, so there is no separate demo to drift out of step with the product.

**What a local run cannot give you is your own site's pages.** `/app/` is the
management half; pressing Edit on an entry opens the URL that entry's
`page:` template describes, and on your machine there is nothing there. Two
ways round it, and they are honest about different things:

- **`playground/first-post.html`** is a hand-written stand-in for a site page,
  with the real `<script type="module" src="../dist/edit.js">` on it and
  `playground/site-config.yml` describing it. Open it with `?cms-edit` and you
  get the genuine in-page surface, against a page whose body is three
  paragraphs somebody typed. It proves the script works; it proves nothing
  about your templates.
- **Run your own site's dev server too**, and set `site.base` and `page:` to
  match what it serves — `http://localhost:4321` for Astro, and so on. Then the
  Edit button genuinely opens your page. You will need the CMS's `dist/` copied
  into your site's static directory for the `<script>` tag to resolve; see
  [deploying it](in-page.md#deploying-it).

For the first time through, forking the test site is less work than either.

## 4. Point it at your repository

`app/cms-config.yml` ships with a placeholder repository (`owner/site`) that
is *designed* to fail at the gate rather than quietly half-work. Replace it.

If you forked `ContentTools-test`, its `public/cms-config.yml` is already
correct for it — copy that file over `app/cms-config.yml`. Otherwise edit the
one in place: `backend.repo` is `owner/name`, `backend.branch` is your default
branch, and each collection's `folder` is where its markdown lives.

```yaml
backend:
  repo: you/your-site
  branch: main

site:
  # Omit for a site at the root. A GitHub Pages project site says
  # `base: /your-site`.
  preview: https://deploy-preview-{{pr}}--your-site.netlify.app

media:
  folder: public/images
  publicPath: /images

collections:
  - name: blog
    label: Blog
    folder: src/content/blog
    create: true
    delete: true
    extension: md
    page: /blog/{{slug}}/
    body: article.post-body
    fields:
      - {name: title, widget: string, required: true}
      - {name: date, widget: date, required: true}
```

Four things worth getting right the first time, because all of them fail
later rather than here:

- **`page:` and `body:` are what make the Edit button work.** `page` maps a
  slug to the URL its entry is published at, and back; `body` is the selector
  for the element on that page holding the rendered markdown — and **nothing
  else**, because the editor replaces that element's children. Point it at a
  page wrapper and pressing Edit replaces your site's layout with a post. Leave
  both out and the entry screen simply says there is no page to edit on, which
  is a fine place to start from.
- **`site.preview`** is how a *draft* is editable at all. A new post and a post
  under review are both absent from the live site, so the live URL cannot show
  them. Without it the Edit link falls back to the live page and the entry
  screen says plainly that it is doing so.
- **`media.publicPath` must carry your site's base path.** On a GitHub Pages
  *project* site the whole site is served under `/<RepoName>/`, so an image
  committed to `public/images/x.png` is reachable at
  `/<RepoName>/images/x.png`. Get this wrong and every inserted image looks
  right in local dev and 404s once deployed.
- **The `fields` should match whatever validates your frontmatter** — Astro's
  content collection schema, or your generator's equivalent. Then a bad save
  fails your site's build instead of rendering a broken page.

Reload the page after editing the config; it is fetched at boot.

## 5. Sign in

Open `/admin/` on your deployment, or **http://127.0.0.1:8931/** if you are
running locally. The gate names your repository and the two permissions
above. Paste the token and press Sign in.

The gate does not just store it: it calls `GET /repos/{owner}/{name}` and
checks the answer, so a token scoped to the wrong repository, or one that can
read but not push, is refused *here* — next to the field that produced it and
the permissions written beside it — rather than several screens away.

If it is refused, the message says which of the three it was: not authorized
(the token is wrong or expired), no such repository (the token is scoped
somewhere else — a 404 is what GitHub returns for a repository your token
cannot see, even when it exists), or read-only.

## 6. Open an entry

Click your collection in the left nav, then a post. You should see:

- the **frontmatter form**, populated from the real file — the title in a text
  field, the date in a date control, and so on, one widget per declared field;
- **Submit for review**, which commits whatever the form changed;
- **Edit**, which opens the entry's published page.

There is no body here and no toolbox. `/admin` is a management application:
the entry list, what is in review, create and delete, and the frontmatter.
The words are written on the page, which is the next step.

If **Edit** is missing or greyed, the config is why — no `page:` on the
collection, or no `site` block at all. The screen says which.

## 7. Edit one paragraph, and only one, on the page

Press **Edit**. It opens the entry's published page in a new tab — the live
site for a published entry, the pull request's deploy preview for one already
under review — with your token handed over on the URL fragment, taken off
again before anything else loads, so the new tab is signed in on arrival.

What you should see is **your site, unchanged**: your template, your
stylesheet, your header and footer, and the post exactly as its readers get
it — with a bar in the top right carrying the frontmatter fields and
**Submit for review**, and a **pencil** in the top left. Nothing is editable
yet, and nothing on the page has been replaced. Pressing Edit under `/admin`
said which page to edit; it did not say to start.

- If the bar says *this page is not an entry*, `page:` does not describe this
  URL.
- If it says it **found** some other element, `body:` is pointing at the wrong
  one — it names what it found, in the shape of a selector, which is also the
  answer to the question you are about to ask.
- If it says nobody is signed in, the token did not cross. That happens if you
  opened the link with a middle click or by copying it: the `href` carries no
  secret on purpose, so only an ordinary click hands one over.

**Press the pencil.** It turns into a green tick and a red cross, the
toolbox comes up, and the post's body becomes editable in place. The tick
ends the session keeping what you typed; the cross ends it putting the
reader's own page back. Neither of them writes anything to the repository —
that is still **Submit for review**, on the bar, and it stays available
after a tick so you can turn the tools off and still commit.

The editor's floating **toolbox** is `position: fixed`, so it floats over the
page rather than sitting in the layout, bottom right. Drag it by the grip at
its top if it is in your way; the position is remembered in `localStorage`
under `ct-toolbox-position`, so that costs you one drag, once, in that browser.

Now the step the whole exercise is about. Change a few words in a **single**
paragraph in the middle of the post — not the first one, and leave the
headings, the lists, any code blocks and the frontmatter alone.

Then press **Submit for review**, on the bar.

## 8. Read the diff

The bar links to the pull request it opened. Open it on GitHub and look at
**Files changed**.

What you should see:

- **one file changed**;
- **one hunk**, in the paragraph you edited;
- the frontmatter block, every other paragraph, the headings, the lists and
  any fenced code blocks **byte-identical** — not reformatted, not re-wrapped,
  not reordered, and comments and key order in the YAML preserved.

That is the byte-preserving splice working: blocks that did not change are
copied out of the original source by byte offset and never re-serialized, so
there is nothing for a serializer to reformat.

**One known blemish.** If the paragraph you edited was hard-wrapped across
several lines in the source, it comes back as one long line. There is no HTML
form of a paragraph that preserves where its source lines broke, so once a
paragraph has been through the editor the wrapping is gone. *Untouched*
wrapped paragraphs are unaffected — this only shows up in the one paragraph
you actually edited, and it is why the diff above is "one hunk" rather than
"one line".

## 9. The rest of the workflow

With the pull request open, the parts worth exercising:

- **Save again.** Edit the same paragraph a second time and Submit. It should
  add a commit to the *same* branch and *not* open a second pull request — and
  the second diff should still be one hunk. (This is the case where a surface
  that re-parsed the file after saving would silently corrupt it.)
- **Reopen it from `/admin`.** Go back to the entry screen and press Edit
  again, then the pencil again on the page. Now that a pull request is open,
  the link goes to its **deploy preview** rather than to the live site — the
  live site is built from the base branch and does not have your change — and
  the page you land on reads the entry from the in-flight branch, so you see
  your own unmerged work.
- **Edit a frontmatter field from the bar**, and check the diff again: the
  block should change in exactly the one line you touched, with comments, key
  order and quoting everywhere else preserved.
- **Insert an image.** With the switch on, use the image tool in the toolbox
  on the page. The bytes are staged in memory and committed *with* the entry,
  in one commit, so an abandoned edit leaves nothing behind.
- **Move it through review.** The **Review** screen lists every open `cms/*`
  pull request across collections and moves each between draft, in review and
  ready.
- **Merge it yourself, on GitHub.** The shell will not merge, by design:
  branch protection, required reviews and CODEOWNERS are your repository's
  controls, and a tool that can write, approve and publish in one session has
  removed the review gate that is the point of the workflow.

If your repository deploys on merge — as the test site does, via GitHub Pages
— watch the change reach the live page. That is the whole loop: edit in a
browser, review on GitHub, publish by merging.

## If something goes wrong

Errors land on the page, not the console — on both surfaces, and for slightly
different reasons. The shell has one guard routing everything it catches
through a description function into a `role="alert"` region. The in-page
script never throws at all: it runs on a published page every reader
downloads, so an uncaught error there is a site that looks broken to somebody
who is not even editing — every failure, including the three that are
somebody's mistake, lands in the bar instead.

So if a screen or a bar looks idle after you pressed something, the message is
on it.

The three worth recognising:

- **`415`, on Submit, with reads working.** That is the `rc.0` bug this
  document opens with. It is fixed in `2.0.0-rc.1`; if you see it, you are
  running an older build.
- **A conflict.** Somebody pushed to the entry's branch between your read and
  your save. The shell never force-pushes, so it refuses and shows you the
  markdown it *would* have written, in a selectable pane. Copy it before
  reloading.
- **Signed out mid-session.** The token was revoked or expired. The shell
  returns you to the gate and, if an entry was open, shows what the save was
  carrying in a read-only pane on that gate — the whole file, so it can be
  pasted back.

## What this does not cover

Two things are still owed by hand and this guide is not either of them: a real
GitHub App signing a real person in (see [signing in](auth.md)), and whether
GitHub's App web flow *enforces* the PKCE `code_challenge` rather than merely
accepting it. Both need a registered App and a deployed proxy.
