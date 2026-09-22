/* Which adapter a config means.
 *
 * Two surfaces ask, and the failure of them disagreeing is the quietest
 * one in the project: an author signs in through `/admin` perfectly,
 * walks to a page of their own site, and is told to sign in again --
 * because one of the two read the personal-access-token key and the
 * other wrote the App one. Nothing fails, nothing is logged, and the
 * deployment looks like it works.
 */

import {adapterFor} from '../../../src/auth/adapter.js';
import {PatAuthAdapter} from '../../../src/auth/pat.js';
import {GitHubAppAuthAdapter} from '../../../src/auth/github-app.js';
import {parseConfig} from '../../../src/cms/config.js';

const BASE = {
    backend: {repo: 'owner/site'},
    media: {folder: 'static/images', publicPath: '/images'},
    collections: [{name: 'blog', folder: 'content/blog'}]
};

/* Through `parseConfig`, not a hand-built object: `backend.auth` has a
   default, and a test that writes the default itself would pass while the
   parser stopped supplying one. */
const config = auth => parseConfig(auth
    ? {...BASE, backend: {...BASE.backend, auth}}
    : BASE);

const APP = {kind: 'github-app', clientId: 'Iv1.test', proxy: 'https://x.test/'};


describe('adapterFor', function() {

    it('is the PAT adapter when the config says nothing', function() {
        expect(adapterFor(config(null))).toBeInstanceOf(PatAuthAdapter);
    });

    it('is the PAT adapter for an explicit `kind: pat`', function() {
        expect(adapterFor(config({kind: 'pat'}))).toBeInstanceOf(PatAuthAdapter);
    });

    it('is the App adapter for `kind: github-app`', function() {
        expect(adapterFor(config(APP))).toBeInstanceOf(GitHubAppAuthAdapter);
    });

    it('hands the PAT adapter what the person typed', async function() {
        const auth = adapterFor(config(null), {prompt: () => 'github_pat_typed'});
        expect((await auth.authenticate()).token).toBe('github_pat_typed');
        auth.logout();
    });

    it('builds a PAT adapter that refuses, when no prompt is offered',
       async function() {
        /* What the in-page script gets: it only ever READS a token, and
           an adapter that would ask is one that could be made to put a
           credential field on a published page. */
        await expect(adapterFor(config(null)).authenticate()).rejects.toThrow();
    });

});
