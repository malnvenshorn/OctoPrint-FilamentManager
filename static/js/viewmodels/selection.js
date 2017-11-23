/* global FilamentManager ko gettext PNotify */

FilamentManager.prototype.viewModels.selections = function selectedSpoolsViewModel() {
    const self = this.viewModels.selections;
    const api = this.core.client;
    const { settingsViewModel, temperatureViewModel, loginStateViewModel } = this.core.bridge.allViewModels;

    self.selectedSpools = ko.observableArray([]);

    // selected spool id for each tool
    self.tools = ko.observableArray([]);
    // set to false if querying selections to prevent triggering the change event again when setting selected spools
    self.enableSpoolUpdate = false;

    self.setArraySize = function setArraySizeToNumberOfTools() {
        const currentProfileData = settingsViewModel.printerProfiles.currentProfileData();
        const numExtruders = (currentProfileData ? currentProfileData.extruder.count() : 0);

        if (self.tools().length === numExtruders) return;

        if (self.tools().length < numExtruders) {
            // number of extruders has increased
            for (let i = self.tools().length; i < numExtruders; i += 1) {
                self.selectedSpools().push(undefined);
                self.tools().push(ko.observable(undefined));
            }
        } else {
            // number of extruders has decreased
            for (let i = numExtruders; i < self.tools().length; i += 1) {
                self.tools().pop();
                self.selectedSpools().pop();
            }
        }

        // notify observers
        self.tools.valueHasMutated();
        self.selectedSpools.valueHasMutated();
    };

    self.setSubscriptions = function subscribeToProfileDataObservable() {
        settingsViewModel.printerProfiles.currentProfileData.subscribe(self.setArraySize);
    };

    self.requestInProgress = ko.observable(false);

    self.setSelectedSpools = function setSelectedSpoolsReceivedFromBackend(data) {
        self.enableSpoolUpdate = false;
        data.selections.forEach((selection) => {
            self.updateSelectedSpoolData(selection);
            self.applyTemperatureOffset(selection);
        });
        self.enableSpoolUpdate = true;
    };

    self.requestSelectedSpools = function requestSelectedSpoolsFromBackend() {
        self.requestInProgress(true);
        return api.selection.list()
            .done((data) => { self.setSelectedSpools(data); })
            .always(() => { self.requestInProgress(false); });
    };

    self.updateSelectedSpool = function updateSelectedSpoolInBackend(tool, id = null) {
        if (!self.enableSpoolUpdate) return;

        const data = { tool, spool: { id } };

        self.requestInProgress(true);
        api.selection.update(tool, data)
            .done((response) => {
                self.updateSelectedSpoolData(response.selection);
                self.applyTemperatureOffset(response.selection);
            })
            .fail(() => {
                new PNotify({ // eslint-disable-line no-new
                    title: gettext('Could not select spool'),
                    text: gettext('There was an unexpected error while selecting the spool, please consult the logs.'),
                    type: 'error',
                    hide: false,
                });
            })
            .always(() => {
                self.requestInProgress(false);
            });
    };

    self.updateSelectedSpoolData = function updateSelectedSpoolData(data) {
        if (data.tool < self.tools().length) {
            self.tools()[data.tool](data.spool !== null ? data.spool.id : undefined);
            self.selectedSpools()[data.tool] = (data.spool !== null ? data.spool : undefined);
            self.selectedSpools.valueHasMutated(); // notifies observers
        }
    };

    self.reapplySubscription = undefined;

    self.applyTemperatureOffset = function applyTemperatureOffsetToExtruder(data) {
        if (loginStateViewModel.isUser()) {
            // if logged in apply temperature offset
            const { tool, spool } = data;
            if (tool < self.tools().length) {
                const toolObj = temperatureViewModel.tools()[tool];
                temperatureViewModel.changingOffset.item = toolObj;
                temperatureViewModel.changingOffset.name(toolObj.name());
                temperatureViewModel.changingOffset.offset(toolObj.offset());
                temperatureViewModel.changingOffset.newOffset(spool !== null ? spool.temp_offset : 0);
                temperatureViewModel.confirmChangeOffset();
            }
        } else if (self.reapplySubscription === undefined) {
            // if not logged in set a subscription to automatically apply the temperature offset after login
            self.reapplySubscription = loginStateViewModel.isUser.subscribe(self.reapplyTemperatureOffset);
        }
    };

    self.reapplyTemperatureOffset = function reapplyTemperatureOffsetIfUserLoggedIn() {
        if (!loginStateViewModel.isUser()) return;

        // apply temperature offset
        self.selectedSpools().forEach((spool, tool) => {
            const selection = { spool, tool };
            self.applyTemperatureOffset(selection);
        });

        // remove subscription
        self.reapplySubscription.dispose();
        self.reapplySubscription = undefined;
    };
};
