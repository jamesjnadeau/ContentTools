/* Where an entry is in review.

   Pure enough to test without a GitHub at all -- which is why it is its
   own module rather than three helpers inside the repo. The transitions
   against a real pull request are in repo.spec.js. */

import {
    STATUSES, labelFor, statusForLabel, statusOf
} from '../../../src/cms/status.js';

const withLabels = (...names) => ({labels: names.map(name => ({name}))});

describe('status labels', function() {

    it('namespaces every status', function() {
        return expect(STATUSES.map(labelFor))
            .toEqual(['cms/draft', 'cms/in-review', 'cms/ready']);
    });

    it('round-trips a label back to its status', function() {
        return expect(STATUSES.map(s => statusForLabel(labelFor(s)))).toEqual([...STATUSES]);
    });

    it.each([
        ['bug'],
        ['draft'],
        ['cms/blocked'],
        ['CMS/ready']
    ])('does not read %s as a status', function(label) {
        /* A repository has labels of its own, and claiming one would put
           an entry in a state the tool then tries to move it out of. */
        return expect(statusForLabel(label)).toBe(null);
    });
});

describe('statusOf', function() {

    it('reads the label', function() {
        return expect(statusOf(withLabels('bug', 'cms/in-review'))).toBe('in-review');
    });

    it('is null when nothing says', function() {
        // A pull request somebody opened by hand, in the cms namespace or not.
        return expect(statusOf(withLabels('bug'))).toBe(null);
    });

    it('takes the furthest along when a pull request carries two', function() {
        /* Either somebody labelled by hand, or a status change added the
           new label and failed before removing the old one. Taking the
           other answer would move a card backwards on a board on the
           strength of a label nobody meant to leave. */
        expect(statusOf(withLabels('cms/draft', 'cms/ready'))).toBe('ready');
        return expect(statusOf(withLabels('cms/ready', 'cms/draft'))).toBe('ready');
    });
});
