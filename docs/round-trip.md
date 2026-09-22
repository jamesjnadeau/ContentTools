# The round trip, by hand

This is the one check the test suite cannot make for you: open an entry from
a **real** repository, edit it, submit it, and read the pull request GitHub
actually received. Everything below runs on your own machine against your own
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

Budget twenty minutes.

## 1. A repository to edit

Any repository with a markdown file in it will do. If you want one that also
builds and deploys, so you can watch the merge appear on a real site,
[`jamesjnadeau/ContentTools-test`](https://github.com/jamesjnadeau/ContentTools-test)
is an Astro site with one post, a `public/cms-config.yml` already written, and
both GitHub Pages and Netlify wired up. Fork it, or copy its
`public/cms-config.yml` into your own. It lives under `public/` because Astro
copies only that directory into the build; at the repository root it is a 404
on the deployed site.

That repository also **deploys the shell with the site**, at
[`/admin/`](https://genuine-cocada-82e6e2.netlify.app/admin/), vendored from
this one by its `scripts/sync-cms.sh`. If you fork it you can skip sections 3
and 4 entirely and sign in there instead — the rest of this guide reads the
same.

You need push access, and the repository must have at least one commit on its
default branch.

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

## 3. Run the shell

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
    fields:
      - {name: title, widget: string, required: true}
      - {name: date, widget: date, required: true}
```

Two things worth getting right the first time, because both fail later rather
than here:

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

Open **http://127.0.0.1:8931/**. The gate names your repository and the two
permissions above. Paste the token and press Sign in.

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

- the **frontmatter form** at the top, populated from the real file — the
  title in a text field, the date in a date control, and so on, one widget per
  declared field;
- the **body** below it, rendered as editable content;
- the editor's floating **toolbox**, bottom right.

The toolbox is `position: fixed` chrome, so it floats over the page rather
than sitting in the layout. It defaults to the bottom-right corner, which
clears the shell's controls and both frontmatter fields — but a long entry's
text runs underneath it. Drag it by the grip at its top if it is in your way;
the position is remembered in `localStorage` under `ct-toolbox-position`, so
that costs you one drag, once, in that browser.

## 7. Edit one paragraph, and only one

This is the step the whole exercise is about. Change a few words in a single
paragraph in the middle of the post — not the first one, and leave the
headings, the lists, any code blocks and the frontmatter alone.

Then press **Submit**.

## 8. Read the diff

The shell links to the pull request it opened. Open it on GitHub and look at
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

- **Save again.** Edit the same entry a second time and Submit. It should add
  a commit to the *same* branch and *not* open a second pull request — and the
  second diff should still be one hunk. (This is the case where a shell that
  re-parsed the file after saving would silently corrupt it.)
- **Reopen it.** Navigate away and back. The shell reads the entry from its
  in-flight branch, not from the base, so you see your own unmerged work
  rather than the published version.
- **Insert an image.** Use the image tool in the toolbox. The bytes are staged
  in memory and committed *with* the entry, in one commit, so an abandoned
  edit leaves nothing behind.
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

Errors land on the page, not the console. The shell has one guard that routes
everything it catches through a description function into a `role="alert"`
region, so if a screen looks idle after you pressed something, the message is
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
