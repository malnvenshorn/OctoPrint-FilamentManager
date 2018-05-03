FilamentManager.prototype.viewModels.spools = function spoolsViewModel() {
    const self = this.viewModels.spools;
    const api = this.core.client;

    self.supportedPageSizes = [
        { name: '10', size: 10 },
        { name: '25', size: 25 },
        { name: '50', size: 50 },
        { name: gettext('All'), size: 0 },
    ];

    self.supportedFilters = [
        {
            name: gettext('Name'),
            text: gettext('Filter by name'),
            filter: value => item => item.name === value,
        },
        {
            name: gettext('Material'),
            text: gettext('Filter by material'),
            filter: value => item => item.profile.material === value,
        },
        {
            name: gettext('Vendor'),
            text: gettext('Filter by vendor'),
            filter: value => item => item.profile.vendor === value,
        },
    ];

    self.supportedSorting = {
        name_asc(a, b) {
            // sorts ascending
            if (a.name.toLocaleLowerCase() < b.name.toLocaleLowerCase()) return -1;
            if (a.name.toLocaleLowerCase() > b.name.toLocaleLowerCase()) return 1;
            return 0;
        },
        name_desc(a, b) {
            // sorts descending
            if (a.name.toLocaleLowerCase() > b.name.toLocaleLowerCase()) return -1;
            if (a.name.toLocaleLowerCase() < b.name.toLocaleLowerCase()) return 1;
            return 0;
        },
        material_asc(a, b) {
            // sorts ascending
            if (a.profile.material.toLocaleLowerCase() < b.profile.material.toLocaleLowerCase()) return -1;
            if (a.profile.material.toLocaleLowerCase() > b.profile.material.toLocaleLowerCase()) return 1;
            return 0;
        },
        material_desc(a, b) {
            // sorts descending
            if (a.profile.material.toLocaleLowerCase() > b.profile.material.toLocaleLowerCase()) return -1;
            if (a.profile.material.toLocaleLowerCase() < b.profile.material.toLocaleLowerCase()) return 1;
            return 0;
        },
        vendor_asc(a, b) {
            // sorts ascending
            if (a.profile.vendor.toLocaleLowerCase() < b.profile.vendor.toLocaleLowerCase()) return -1;
            if (a.profile.vendor.toLocaleLowerCase() > b.profile.vendor.toLocaleLowerCase()) return 1;
            return 0;
        },
        vendor_desc(a, b) {
            // sorts descending
            if (a.profile.vendor.toLocaleLowerCase() > b.profile.vendor.toLocaleLowerCase()) return -1;
            if (a.profile.vendor.toLocaleLowerCase() < b.profile.vendor.toLocaleLowerCase()) return 1;
            return 0;
        },
        remaining_asc(a, b) {
            // sorts ascending
            const ra = parseFloat(a.weight) - parseFloat(a.used);
            const rb = parseFloat(b.weight) - parseFloat(b.used);
            if (ra < rb) return -1;
            if (ra > rb) return 1;
            return 0;
        },
        remaining_desc(a, b) {
            // sorts descending
            const ra = parseFloat(a.weight) - parseFloat(a.used);
            const rb = parseFloat(b.weight) - parseFloat(b.used);
            if (ra > rb) return -1;
            if (ra < rb) return 1;
            return 0;
        },
    };

    self.currentFilter = ko.observable(0);

    self.inventory = new Utils.ItemListHelper(
        'fm_inventory_table',
        self.supportedSorting,
        {},
        'name_asc',
        [],
        [],
        self.supportedPageSizes[0].size,
    );

    /**
     * This function will be invoked whenever a key was pressed inside the text field for the
     * filter value. If the pressed key is recognized as 'Enter' the currently selected filter
     * gets applied to the inventory with the value from the input field. If the input field is
     * empty the filter will be reset (showing all entries again).
     */
    self.applyFilter = (data, event) => {
        if (event.key !== 'Enter') return;

        const value = $(event.target).val();

        if (value) {
            const filter = self.supportedFilters[self.currentFilter()].filter(value);
            self.inventory.changeSearchFunction(filter);
        } else {
            self.inventory.resetSearch();
        }
    };

    /**
     * This function will be invoked whenver the close button of the filter input field is clicked.
     * It will clear the input field and reset the filter.
     */
    self.resetFilter = () => {
        $('#fm_inventory_table_filter').val('');
        self.inventory.resetSearch();
    };

    /**
     * Sort by the given column in ascending order. If the inventory is already sorted by that
     * column the order gets toggled (ascending => descending, descending => ascending).
     */
    self.setSorting = (column) => {
        if (self.inventory.currentSorting() === `${column}_asc`) {
            self.inventory.changeSorting(`${column}_desc`);
        } else {
            self.inventory.changeSorting(`${column}_asc`);
        }
    };

    /**
     * Set the appropreate icon to the column header depending on the given sort order.
     */
    self.setSortIcon = (column, order) => {
        const icons = ['fa-angle-up', 'fa-angle-down'];

        $('#fm_inventory_tab table th span.sort-icon').each((index, element) => {
            $(element).removeClass(icons.join(' '));
        });

        $(`#fm_inventory_tab table th.fm_inventory_table_column_${column} span.sort-icon`)
            .addClass(order === 'asc' ? icons[0] : icons[1]);
    };

    /**
     * React to each change of the filtered column and apply the filter to the new selected.
     */
    self.currentFilter.subscribe(() => {
        self.applyFilter(null, { key: 'Enter', target: $('#fm_inventory_table_filter') });
    });

    /**
     * React to each change of the sorting order to set the currect icon. subscribeAndCall() is
     * used, because the ItemListHelper restors the last sorting when loading the website.
     * Therefore the observable might be already set when we get here and we would miss that
     * update otherwise.
     */
    self.inventory.currentSorting.subscribeAndCall((sorting) => {
        const [column, order] = sorting.split('_', 2);
        self.setSortIcon(column, order);
    });

    /**
     * React to each change of the page size and provides the matching button text.
     */
    self.pageSizeText = ko.pureComputed(() => {
        const currentPageSize = self.supportedPageSizes.find(pageSize => pageSize.size === self.inventory.pageSize());
        if (currentPageSize !== undefined) {
            return currentPageSize.name;
        }
        return undefined;
    });

    // --------------------------------------------------------------------------------------------

    self.showSpoolDialog = (data) => {
        self.fromSpoolData(data);
        $('#fm_dialog_spool').modal('show');
    };

    self.hideSpoolDialog = () => {
        $('#fm_dialog_spool').modal('hide');
    };

    /**
     * Get a new spool object with default values.
     */
    self.cleanSpool = () => ({
        id: undefined,
        name: '',
        cost: 20,
        weight: 1000,
        used: 0,
        temp_offset: 0,
        profile: {
            id: undefined,
        },
    });

    /**
     * Holds the data for the spool dialog. Every change in the form will be reflected by this
     * object.
     */
    self.loadedSpool = {
        id: ko.observable(),
        name: ko.observable(),
        profile: ko.observable(),
        cost: ko.observable(),
        totalWeight: ko.observable(),
        remaining: ko.observable(),
        temp_offset: ko.observable(),
        isNew: ko.observable(true),
    };

    self.nameInvalid = ko.pureComputed(() => !self.loadedSpool.name());

    /**
     * Updates the 'loadedSpool' object with the data from the given spool. If no spool object is
     * passed as parameter it uses the default data provided by the 'cleanSpool()' function.
     */
    self.fromSpoolData = (data = self.cleanSpool()) => {
        self.loadedSpool.isNew(data.id === undefined);
        self.loadedSpool.id(data.id);
        self.loadedSpool.name(data.name);
        self.loadedSpool.profile(data.profile.id);
        self.loadedSpool.totalWeight(data.weight);
        self.loadedSpool.cost(data.cost);
        self.loadedSpool.remaining(data.weight - data.used);
        self.loadedSpool.temp_offset(data.temp_offset);
    };

    /**
     * Returns a spool object containing the data from the dialog provided by the 'cleanSpool()'
     * function.
     */
    self.toSpoolData = () => {
        const defaultSpool = self.cleanSpool();
        const totalWeight = Utils.validFloat(self.loadedSpool.totalWeight(), defaultSpool.weight);
        const remaining = Math.min(Utils.validFloat(self.loadedSpool.remaining(), defaultSpool.weight), totalWeight);

        return {
            id: self.loadedSpool.id(),
            name: self.loadedSpool.name(),
            cost: Utils.validFloat(self.loadedSpool.cost(), defaultSpool.cost),
            weight: totalWeight,
            used: totalWeight - remaining,
            temp_offset: self.loadedSpool.temp_offset(),
            profile: {
                id: self.loadedSpool.profile(),
            },
        };
    };

    // --------------------------------------------------------------------------------------------

    /**
     * Initialized with 'true' to signalize that there was no data fetched yet. This is usefull to
     * show the spinning icon while the page is loading, because the first data request will be
     * send only after the page is fully loaded.
     */
    self.requestInProgress = ko.observable(true);

    /**
     * List of callbacks to be applied after a spool has been updated.
     */
    self.updateCallbacks = [];

    /**
     * Holds an array of all spools.
     */
    self.allSpools = ko.observableArray([]);

    /**
     * Automatically update the inventory on changes.
     */
    self.allSpools.subscribe(spools => self.inventory.updateItems(spools));

    /**
     * Request all spools from the backend and update the inventory.
     */
    self.requestSpools = (force = false) => {
        self.requestInProgress(true);
        return api.spool.list(force)
            .done((response) => { self.allSpools(response.spools); })
            .fail(() => {
                PNotify.error({
                    title: gettext('Could not fetch inventory'),
                    text: gettext('There was an unexpected error while fetching the spool inventory, please consult the logs.'),
                    hide: false,
                });
                self.inventory.updateItems([]);
            })
            .always(() => { self.requestInProgress(false); });
    };

    /**
     * Saves the passed spool to the database either by an add or update request.
     */
    self.saveSpool = function saveSpoolToBackend(data = self.toSpoolData()) {
        return self.loadedSpool.isNew() ? self.addSpool(data) : self.updateSpool(data);
    };

    /**
     * Add the passed spool to the database.
     */
    self.addSpool = function addSpoolToBackend(data = self.toSpoolData()) {
        self.requestInProgress(true);
        api.spool.add(data)
            .done(() => {
                self.hideSpoolDialog();
                self.requestSpools();
            })
            .fail(() => {
                PNotify.error({
                    title: gettext('Could not add spool'),
                    text: gettext('There was an unexpected error while saving the filament spool, please consult the logs.'),
                    hide: false,
                });
                self.requestInProgress(false);
            });
    };

    /**
     * Updates the passed spool in the database.
     */
    self.updateSpool = function updateSpoolInBackend(data = self.toSpoolData()) {
        self.requestInProgress(true);
        api.spool.update(data.id, data)
            .done(() => {
                self.hideSpoolDialog();
                self.requestSpools();
                self.updateCallbacks.forEach((callback) => { callback(); });
            })
            .fail(() => {
                PNotify.error({
                    title: gettext('Could not update spool'),
                    text: gettext('There was an unexpected error while updating the filament spool, please consult the logs.'),
                    hide: false,
                });
                self.requestInProgress(false);
            });
    };

    /**
     * Removes the passed spool from the database. Opens a dialog where the action has to be
     * confirmed.
     */
    self.removeSpool = function removeSpoolFromBackend(data) {
        const perform = function performSpoolRemoval() {
            self.requestInProgress(true);
            api.spool.delete(data.id)
                .done(() => {
                    self.requestSpools();
                })
                .fail(() => {
                    PNotify.error({
                        title: gettext('Could not delete spool'),
                        text: gettext('There was an unexpected error while removing the filament spool, please consult the logs.'),
                        hide: false,
                    });
                    self.requestInProgress(false);
                });
        };

        showConfirmationDialog({
            title: gettext('Delete spool?'),
            message: gettext(`You are about to delete the filament spool <strong>${data.name} - ${data.profile.material} (${data.profile.vendor})</strong>.`),
            proceed: gettext('Delete'),
            onproceed: perform,
        });
    };

    /**
     * Duplicates the passed spool in the database. The filament counter of this new spool will be
     * reset.
     */
    self.duplicateSpool = function duplicateAndAddSpoolToBackend(data) {
        const newData = data;
        newData.used = 0;
        self.addSpool(newData);
    };
};
