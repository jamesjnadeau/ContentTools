# Signing in

Two ways, and the choice is about who edits the site rather than about
security posture.

| | who it is for | what you deploy |
|---|---|---|
| **Fine-grained PAT** | one operator editing their own site | nothing |
| **GitHub App** | a handful of authors who should not be issuing tokens | one tiny proxy |

Both are implementations of one interface, and everything above them —
the shell, `CmsRepo`, the GitHub client — knows only this:

```ts
interface AuthAdapter {
    authenticate(): Promise<{token: string}>;
    logout(): Promise<void>;
    currentToken(): string | null;
    /** What the gate offers instead of a secret field. */
    readonly gate?: {readonly label: string; readonly note: string};
    /** Finish a flow the page was redirected back from. */
    resume?(): Promise<void>;
}
```

The last two are optional, which is why the PAT adapter did not change
when the App one arrived.

## A fine-grained PAT

The default, and the one to try the workflow with first: no OAuth app, no
hosted secret, nothing deployed. The author makes a token at
[github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new),
scoped to the one repository the deployment edits, with **Contents** and
**Pull requests** both set to *Read and write*, and pastes it into the
gate.

It is held in `sessionStorage`, never `localStorage`: a token should not
outlive the tab. Where `sessionStorage` is unavailable — a sandboxed
iframe, some private-browsing modes — it lives in memory for that tab
instead of the page failing to start.

Nothing needs configuring; a config with no `backend.auth` block gets
this.

## A GitHub App

For a site with authors. Each of them presses a button instead of being
taught what a fine-grained token is and asked to scope one to a
repository they may not administer. It is also the **narrower** grant: a
user-to-server token is bounded by the App's installation, which is this
project's one-deployment-one-repo rule expressed in GitHub's own
permission model rather than in a scope somebody has to get right by
hand.

It costs one deployed thing. GitHub's token exchange requires the client
secret and its endpoint sends no CORS headers, so a browser cannot do it
— with or without PKCE, and the device flow is no more reachable. That
is what the proxy below is, and it is the only part that holds a secret.

### 1. Create the App

At **Settings → Developer settings → GitHub Apps → New GitHub App**:

- **Callback URL**: the shell's own page, with no query and no fragment —
  `https://cms.example.com/index.html`. GitHub matches it exactly, and
  the adapter derives the same string from `location`, so a trailing
  `/` that differs is a refusal at the end of the round trip.
- **Request user authorization (OAuth) during installation**: on.
- **Webhook**: off.
- **Permissions → Repository**: *Contents* read and write, *Pull
  requests* read and write. The same two the PAT needs, for the same
  reasons.
- **Where can this App be installed**: only on this account, unless you
  are running more than one site from it.

Then **Install App** on the one repository that deployment edits, and
note the **Client ID** (`Iv1.…`) and a generated **client secret**.

Leave **user-to-server token expiration** on (GitHub has moved where
this setting lives more than once; it is on the App's own settings
page). See [the eight hours](#the-eight-hours) below.

### 2. Deploy the proxy

`dist/proxy.js` gives you two things. `exchangeHandler` is a pure
`(Request, config) => Promise<Response>` over web APIs, and holds all
of the behaviour; `configFrom(env)` turns environment variables into
its config and names the missing one rather than 500-ing on somebody's
first sign-in.

The host glue is three lines because the two hosts' entry points are
both a *default* export and cannot live in one module — so it is written
here rather than shipped as source that no test could reach.

**Cloudflare Workers** (`src/index.js`):

```js
import {configFrom, exchangeHandler} from '@jamesjnadeau/content-tools/proxy';

export default {
    fetch: (request, env) => exchangeHandler(request, configFrom(env))
};
```

```
wrangler secret put GITHUB_CLIENT_SECRET
wrangler deploy
```

with `GITHUB_CLIENT_ID` and `ALLOWED_ORIGIN` in `wrangler.toml`'s
`[vars]`.

**Netlify Functions v2** (`netlify/functions/auth.mjs`):

```js
import {configFrom, exchangeHandler} from '@jamesjnadeau/content-tools/proxy';

export default request => exchangeHandler(request, configFrom(process.env));
```

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the site's
environment. Omit `ALLOWED_ORIGIN`: a Function is served from the same
origin as the page, so no CORS headers are needed at all, and a header
that is not there cannot be too generous.

| variable | |
|---|---|
| `GITHUB_CLIENT_ID` | required |
| `GITHUB_CLIENT_SECRET` | required, and never reaches the browser |
| `ALLOWED_ORIGIN` | the one origin allowed to call this, e.g. `https://cms.example.com`. Omit for same-origin |
| `GITHUB_REPOSITORY_ID` | optional; narrows the token further, for an App installed on more than one repository |

`ALLOWED_ORIGIN` is not decoration. Without it any page that can obtain
a code can spend it here, and the `redirect_uri` the browser sends is
validated against it for the same reason. `Access-Control-Allow-Origin`
is that origin or nothing — never `*`, because the response carries a
bearer token.

### 3. Point the deployment at it

```yaml
backend:
  repo: owner/site
  branch: main
  auth:
    kind: github-app
    clientId: Iv1.xxxxxxxx
    proxy: https://cms-auth.example.workers.dev
```

Both are public values. The gate becomes a **Sign in with GitHub**
button, and nothing else about the install changes.

## What the flow does

A **top-level redirect**, not a popup:

1. The button mints a `state` and a PKCE verifier, stores them in
   `sessionStorage`, and navigates the page to GitHub.
2. GitHub sends the browser back to the callback URL with `code` and
   `state`.
3. At boot the adapter matches the `state`, **deletes it before the
   exchange** so a bookmarked callback URL cannot be spent twice,
   removes the query from the address bar before anything can read it
   or leak it in a `Referer`, and posts the code and verifier to the
   proxy.
4. The proxy adds the client secret, calls GitHub, and returns
   `{token, expires_in}` — and nothing else. The refresh token is
   dropped there and never reaches the browser.

There is no popup because there could not be a working one. `github.com`
serves `Cross-Origin-Opener-Policy: same-origin-allow-popups`, which
does not preserve *its* opener: navigating a popup there severs
`window.opener`, the swap is not undone when the popup comes back to
your origin, and the handshake goes nowhere while the gate sits looking
idle. `popup.closed` also reads `true` after the swap, so a "did they
close it?" poll is wrong in exactly the case it exists for. None of
that is reproducible in a test, either — a test must stub `github.com`
with a fixture, and a fixture sends no COOP.

## The costs, stated plainly

- **One callback URL per deployment.** GitHub matches it exactly, so
  every site running this needs its own App or its own callback entry.
- **HTTPS, or localhost.** PKCE needs `crypto.subtle`, which is
  undefined outside a secure context. Over plain `http://` the gate says
  so rather than failing with "cannot read properties of undefined".
- <a id="the-eight-hours"></a>**Eight hours, then sign in again.** No
  refresh token is stored, returned to the browser, or asked for. This
  was a deliberate choice over a refresh endpoint: refreshing needs the
  client secret too, so it is another proxy route and another credential
  in the browser's storage, to avoid a sign-in twice a day.
- **No mid-session re-authentication.** When the session ends the page
  goes to GitHub and comes back. If a save was refused on the way, the
  gate shows the markdown it was carrying in a box you can copy out of,
  and it survives the trip — but only until the next successful
  sign-in, which the panel says.
- **PKCE is sent, and its enforcement is unverified.** GitHub ignores
  query parameters it does not recognise, so whether the App web flow
  *requires* `code_challenge` rather than merely accepting it can only
  be answered against a real App. It is sent anyway, because omitting
  it is strictly worse; what the tests claim is that the verifier is
  forwarded to the proxy and never to GitHub.
- **Turning token expiration off in the App's settings works**, and
  then `expires_in` is absent and the token is treated as not expiring.
  That is a longer-lived credential in `sessionStorage` than the
  default, and it is the App's setting rather than this tool's.

## Writing your own

Assign an adapter and it wins over whatever the config asked for:

```js
document.querySelector('content-tools-cms').auth = myAdapter;
```

Implement `authenticate`, `logout` and `currentToken` and the shell
works. Add `gate` and the sign-in screen becomes your button and your
sentence instead of a token field. Add `resume` and it is awaited once
at boot, after the config has loaded and before the first route, which
is where a redirect-based flow finishes.
