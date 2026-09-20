/* Jasmine -> Vitest compatibility for the ported suites.
 *
 * These specs were written for Jasmine 2 and are ported as mechanically as
 * possible, so the translation lives here rather than being smeared across
 * ~8,000 lines. Only two things actually differ.
 */
import {vi, beforeEach} from 'vitest';

/* The suites were written against the browser globals the built bundle
   installs (FSM, HTMLString, ContentSelect, ContentEdit, ContentTools), so it
   is loaded for its side effects rather than for named exports. */
import '../../dist/content-tools.js';

/**
 * Jasmine's `spyOn` replaces the method with a stub that returns undefined;
 * `vi.spyOn` CALLS THROUGH by default. Aliasing one to the other would let the
 * real implementation run wherever a spec expected it suppressed -- quietly
 * changing behaviour, and in a few places turning a real assertion into a
 * false pass.
 *
 * Every spy in both suites is a pure stub (verified: no `.and.callThrough()`,
 * `.and.returnValue()` or `.and.callFake()` anywhere), so stubbing
 * unconditionally is the faithful translation.
 */
globalThis.spyOn = (object, method) =>
    vi.spyOn(object, method).mockImplementation(() => {});

/**
 * Both suites attach regions to `#test`, which the old SpecRunner.html page
 * provided as a single static div for the whole run. Recreating it per spec
 * looks tidier but is NOT equivalent: ContentEdit.Root is a singleton holding
 * focus and drag state that points at live nodes, so swapping the container
 * underneath it changes behaviour. The suites already clean up after
 * themselves via their own afterEach hooks, so mirror the original page.
 */
if (!document.getElementById('test')) {
    const el = document.createElement('div');
    el.id = 'test';
    document.body.appendChild(el);
}

/* Jasmine isolates spies per spec; Vitest does not unless asked. */
beforeEach(() => { vi.restoreAllMocks(); });
