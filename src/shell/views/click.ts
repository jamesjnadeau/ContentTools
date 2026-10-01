/* One question two links ask: is this click the plain, primary one?
 *
 * "Edit on the site" and "New entry" both open a page on the site in a new
 * tab and hand this tab's token across, and both must leave every other
 * kind of click to the browser. Ctrl, meta and shift are how a person says
 * background tab, new window, and a middle click says it without a
 * modifier at all -- taking those over would turn every one of them into a
 * foreground tab. Asked in two places in two spellings, the two links would
 * come to disagree about which clicks are theirs.
 */
export function isPlainPrimaryClick(ev: MouseEvent): boolean {
    return ev.button === 0 && !ev.metaKey && !ev.ctrlKey
        && !ev.shiftKey && !ev.altKey;
}
