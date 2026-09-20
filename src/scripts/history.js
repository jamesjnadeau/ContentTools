/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
ContentTools.History = class History {

    // The `History` class provides a mechanism for storing, navigating and
    // reverting the changes made to an editable document.

    constructor(regions) {
        // The last time a snapshot was taken
        this._lastSnapshotTaken = null;

        // The map of regions that changes will be stored for
        this._regions = {};
        this.replaceRegions(regions);

        // Undo & Redo move restore the state of the document to a snapshot in
        // the historic stack. To keep track of the current position in the stack
        // we use `_snapshotIndex`.
        this._snapshotIndex = -1;

        // A stack of historic snapshot for the document
        this._snapshots = [];

        // Store the initial state of the document
        this._store();
    }

    // Read-only properties

    canRedo() {
        // Return true if a redo can be performed
        return this._snapshotIndex < (this._snapshots.length - 1);
    }

    canUndo() {
        // Return true if an undo can be performed
        return this._snapshotIndex > 0;
    }

    index() {
        // Return the snapshot index for the history stack
        return this._snapshotIndex;
    }

    length() {
        // The number of snapshots stored
        return this._snapshots.length;
    }

    snapshot() {
        // Return the current snapshot
        return this._snapshots[this._snapshotIndex];
    }

    // Methods

    goTo(index) {
        // Move the head to a specific point in history
        this._snapshotIndex = Math.min((this._snapshots.length - 1), Math.max(0, index));
        return this.snapshot();
    }

    redo() {
        // Revert to the document to the next state in she stack
        return this.goTo(this._snapshotIndex + 1);
    }

    replaceRegions(regions) {
        // Replace the existing map of regions with a new set (this is commonly
        // called when a previous state has been restored).
        this._regions = {};
        return (() => {
            const result = [];
            for (var k in regions) {
                var v = regions[k];
                result.push(this._regions[k] = v);
            }
            return result;
        })();
    }

    restoreSelection(snapshot) {
        // Restore the selection for a snapshot

        // Check an element was selected
        if (!snapshot.selected) {
            return;
        }

        // Find the selected element
        const region = this._regions[snapshot.selected.region];
        const element = region.descendants()[snapshot.selected.element];

        // Select the element and if applicable reset the selection
        element.focus();
        if (element.selection && snapshot.selected.selection) {
            return element.selection(snapshot.selected.selection);
        }
    }

    stopWatching() {
        // Stop watching the document for changes

        // Clear any related intervals/timeouts
        if (this._watchInterval) {
            clearInterval(this._watchInterval);
        }

        if (this._delayedStoreTimeout) {
            return clearTimeout(this._delayedStoreTimeout);
        }
    }

    undo() {
        // Revert the document to the previous state in the stack
        return this.goTo(this._snapshotIndex - 1);
    }

    watch() {
        // Watch the document for changes
        //
        // The watch process monitors the root element for changes by comparing
        // its last modified date with the last date a snapshot was taken, if the
        // 2 are not the same then it triggers the creation of snapshot.
        //
        // However to ensure we don't take snapshots whilst the user is still
        // active we wait for a period of inactivity before taking the snapshot
        // (as this is quite a time consuming process and could make the editor
        // feel laggy).

        this._lastSnapshotTaken = Date.now();

        const watch = () => {
            const lastModified = ContentEdit.Root.get().lastModified();

            // Check the document has actually been updated
            if (lastModified === null) {
                return;
            }

            // Check if the document has been modified
            if (lastModified > this._lastSnapshotTaken) {

                // If the document hasn't changed since we last checked do
                // nothing and exit
                if (this._delayedStoreRequested === lastModified) {
                    return;
                }

                // Clear any existing delayed store request
                if (this._delayedStoreTimeout) {
                    clearTimeout(this._delayedStoreTimeout);
                }

                // Trigger a snapshot after a short delay of inactivity
                const delayedStore = () => {
                    this._lastSnapshotTaken = lastModified;
                    return this._store();
                };

                this._delayedStoreRequested = lastModified;
                return this._delayedStoreTimeout = setTimeout(delayedStore, 500);
            }
        };

        return this._watchInterval = setInterval(watch, 50);
    }

    // Private methods

    _store() {
        // Store the current state of the document

        // Take a snapshot
        let name, region;
        const snapshot = {
            regions: {},
            regionModifieds: {},
            rootModified: ContentEdit.Root.get().lastModified(),
            selected: null
            };

        // Store the HTML
        for (name in this._regions) {
            region = this._regions[name];
            snapshot.regions[name] = region.html();
            snapshot.regionModifieds[name] = region.lastModified();
        }

        // Store any selection state information
        const element = ContentEdit.Root.get().focused();

        if (element) {
            snapshot.selected = {};

            // Determine the selected region
            region = element.closest(node => (node.type() === 'Region') || (node.type() === 'Fixture'));

            // Check a region can be found (this catches cases where the focused
            // element isn't attached to the region.
            if (!region) {
                return;
            }

            for (name in this._regions) {
                var other_region = this._regions[name];
                if (region === other_region) {
                    snapshot.selected.region = name;
                    break;
                }
            }

            // Determine the collapsed index of the selected element
            snapshot.selected.element = region.descendants().indexOf(element);

            // Store the current selection (for elements that support it)
            if (element.selection) {
                snapshot.selected.selection = element.selection();
            }
        }

        // If the index is not the last item in the stack then remove items after
        // it.
        if (this._snapshotIndex < (this._snapshots.length - 1)) {
            this._snapshots = this._snapshots.slice(0, this._snapshotIndex + 1);
        }

        this._snapshotIndex++;
        return this._snapshots.splice(this._snapshotIndex, 0, snapshot);
    }
};