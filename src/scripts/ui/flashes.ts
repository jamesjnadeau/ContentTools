import ContentTools from '../namespace.js';
import {rootContext} from '../../core/root-context.js';

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.FlashUI = class FlashUI extends ContentTools.AnchoredComponentUI {
    declare _domElement: any;
    declare _monitorTimeout: any;


    // A flash is a visual indicator displayed typically once a task has been
    // completed, for example it might show that a save has been successful (or
    // failed).
    //
    // Flashes are short lived instances, they display as soon as mounted and are
    // unmount as soon as they're animation has finished. As such references to
    // flash instances should not be stored, e.g:
    //
    // new ContentTools.FlashUI('ok')

    constructor(modifier) {
        super();
        this.mount(modifier);
    }

    // Methods

    mount(modifier) {
        // Mount the flash to the interface, the specified modifier will be
        // applied as a CSS modifier class to change the icon displayed in the
        // flash.

        // Create the flash
        this._domElement = (this.constructor as unknown as {createDiv(classNames?: string[], attributes?: Record<string, string>, content?: string): HTMLDivElement}).createDiv([
            'ct-flash',
            'ct-flash--active',
            `ct-flash--${ modifier }`,
            'ct-widget',
            'ct-widget--active',
            ]);

        // Anchor it to the app
        super.mount(ContentTools.EditorApp.get().domElement());

        // Monitor for when the element is no long visible, at which point we can
        // remove it.
        var monitorForHidden = () => {
            // No `this._monitorTimeout = null` here: every path out of this
            // tick either reassigns it or unmounts, and clearing a handle
            // that has already fired is a no-op. Mutation testing confirmed
            // no test could fail without it.

            // If there's no support for `getComputedStyle` then we fallback to
            // unmounting the widget immediately.
            if (!rootContext().supportsComputedStyle()) {
                this.unmount();
                return;
            }

            // Off the page counts as hidden.
            //
            // A detached node has no computed style, so `opacity` reads as
            // the empty string, `parseFloat` gives NaN, and EVERY comparison
            // against NaN is false -- so a flash still fading when the editor
            // is removed from the page would reschedule itself every 250ms
            // for the life of the document, holding the detached subtree with
            // it. Nothing else would ever clean it up: a flash is an
            // `AnchoredComponentUI`, so it is not among the app's children and
            // the editor's own teardown never sees it.
            if (!this._domElement.isConnected) {
                this.unmount();
                return;
            }

            // If the widget is now hidden we unmount it
            if (parseFloat(rootContext().getComputedStyle(this._domElement).opacity) < 0.01) {
                return this.unmount();
            } else {
                return this._monitorTimeout = setTimeout(monitorForHidden, 250);
            }
        };

        return this._monitorTimeout = setTimeout(monitorForHidden, 250);
    }

    unmount() {
        // Cancel a pending poll before unmounting.
        //
        // `unmount()` is public and nulls `_domElement`, so a tick left
        // scheduled runs `getComputedStyle(null)` a quarter of a second
        // later -- which throws from a timer, with a stack pointing at
        // nothing the caller did.
        if (this._monitorTimeout) {
            clearTimeout(this._monitorTimeout);
            this._monitorTimeout = null;
        }
        return super.unmount();
    }
};
