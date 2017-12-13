/* global FilamentManager ItemListHelper ko Utils $ PNotify gettext showConfirmationDialog */

FilamentManager.prototype.viewModels.spools = function spoolsViewModel() {
    const self = this.viewModels.spools;
    const api = this.core.client;

    const profilesViewModel = this.viewModels.profiles;

    self.allSpools = new ItemListHelper(
        'filamentSpools',
        {
            name(a, b) {
                // sorts ascending
                if (a.name.toLocaleLowerCase() < b.name.toLocaleLowerCase()) return -1;
                if (a.name.toLocaleLowerCase() > b.name.toLocaleLowerCase()) return 1;
                return 0;
            },
            material(a, b) {
                // sorts ascending
                if (a.profile.material.toLocaleLowerCase() < b.profile.material.toLocaleLowerCase()) return -1;
                if (a.profile.material.toLocaleLowerCase() > b.profile.material.toLocaleLowerCase()) return 1;
                return 0;
            },
            vendor(a, b) {
                // sorts ascending
                if (a.profile.vendor.toLocaleLowerCase() < b.profile.vendor.toLocaleLowerCase()) return -1;
                if (a.profile.vendor.toLocaleLowerCase() > b.profile.vendor.toLocaleLowerCase()) return 1;
                return 0;
            },
            remaining(a, b) {
                // sorts descending
                const ra = parseFloat(a.weight) - parseFloat(a.used);
                const rb = parseFloat(b.weight) - parseFloat(b.used);
                if (ra > rb) return -1;
                if (ra < rb) return 1;
                return 0;
            },
        },
        {}, 'name', [], [], 10,
    );

    self.pageSize = ko.pureComputed({
        read() {
            return self.allSpools.pageSize();
        },
        write(value) {
            self.allSpools.pageSize(Utils.validInt(value, self.allSpools.pageSize()));
        },
    });

    self.cleanSpool = function getDefaultValuesForNewSpool() {
        return {
            id: undefined,
            name: '',
            cost: 20,
            weight: 1000,
            used: 0,
            temp_offset: 0,
            profile: {
                id: profilesViewModel.allProfiles().length > 0 ? profilesViewModel.allProfiles()[0].id : undefined,
            },
        };
    };

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

    self.fromSpoolData = function setLoadedSpoolsFromJSObject(data = self.cleanSpool()) {
        self.loadedSpool.isNew(data.id === undefined);
        self.loadedSpool.id(data.id);
        self.loadedSpool.name(data.name);
        self.loadedSpool.profile(data.profile.id);
        self.loadedSpool.totalWeight(data.weight);
        self.loadedSpool.cost(data.cost);
        self.loadedSpool.remaining(data.weight - data.used);
        self.loadedSpool.temp_offset(data.temp_offset);
    };

    self.toSpoolData = function getLoadedProfileAsJSObject() {
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

    const dialog = $('#settings_plugin_filamentmanager_spooldialog');

    self.showSpoolDialog = function showSpoolDialog(data) {
        self.fromSpoolData(data);
        dialog.modal('show');
    };

    self.hideSpoolDialog = function hideSpoolDialog() {
        dialog.modal('hide');
    };

    self.requestInProgress = ko.observable(false);

    self.processSpools = function processRequestedSpools(data) {
        self.allSpools.updateItems(data.spools);
    };

    self.requestSpools = function requestAllSpoolsFromBackend(force) {
        self.requestInProgress(true);
        return api.spool.list(force)
            .done((response) => { self.processSpools(response); })
            .always(() => { self.requestInProgress(false); });
    };

    self.saveSpool = function saveSpoolToBackend(data = self.toSpoolData()) {
        return self.loadedSpool.isNew() ? self.addSpool(data) : self.updateSpool(data);
    };

    self.addSpool = function addSpoolToBackend(data = self.toSpoolData()) {
        self.requestInProgress(true);
        api.spool.add(data)
            .done(() => {
                self.hideSpoolDialog();
                self.requestSpools();
            })
            .fail(() => {
                new PNotify({ // eslint-disable-line no-new
                    title: gettext('Could not add spool'),
                    text: gettext('There was an unexpected error while saving the filament spool, please consult the logs.'),
                    type: 'error',
                    hide: false,
                });
                self.requestInProgress(false);
            });
    };

    self.updateCallbacks = [];

    self.updateSpool = function updateSpoolInBackend(data = self.toSpoolData()) {
        self.requestInProgress(true);
        api.spool.update(data.id, data)
            .done(() => {
                self.hideSpoolDialog();
                self.requestSpools();
                self.updateCallbacks.forEach((callback) => { callback(); });
            })
            .fail(() => {
                new PNotify({ // eslint-disable-line no-new
                    title: gettext('Could not update spool'),
                    text: gettext('There was an unexpected error while updating the filament spool, please consult the logs.'),
                    type: 'error',
                    hide: false,
                });
                self.requestInProgress(false);
            });
    };

    self.removeSpool = function removeSpoolFromBackend(data) {
        const perform = function performSpoolRemoval() {
            self.requestInProgress(true);
            api.spool.delete(data.id)
                .done(() => {
                    self.requestSpools();
                })
                .fail(() => {
                    new PNotify({ // eslint-disable-line no-new
                        title: gettext('Could not delete spool'),
                        text: gettext('There was an unexpected error while removing the filament spool, please consult the logs.'),
                        type: 'error',
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

    self.duplicateSpool = function duplicateAndAddSpoolToBackend(data) {
        const newData = data;
        newData.used = 0;
        self.addSpool(newData);
    };
};
