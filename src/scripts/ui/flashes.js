/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.FlashUI = class FlashUI extends ContentTools.AnchoredComponentUI {

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
        this._domElement = this.constructor.createDiv([
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

            // If there's no support for `getComputedStyle` then we fallback to
            // unmounting the widget immediately.
            if (!window.getComputedStyle) {
                this.unmount();
                return;
            }

            // If the widget is now hidden we unmount it
            if (parseFloat(window.getComputedStyle(this._domElement).opacity) < 0.01) {
                return this.unmount();
            } else {
                return setTimeout(monitorForHidden, 250);
            }
        };

        return setTimeout(monitorForHidden, 250);
    }
};