/* global FilamentManager ko gettext PNotify */

FilamentManager.prototype.viewModels.selections = function selectedSpoolsViewModel() {
    const self = this.viewModels.selections;
    const api = this.core.client;
    const { settingsViewModel } = this.core.bridge.allViewModels;

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

    const m600Dialog = $('#plugin_filamentmanager_m600dialog');

    self.showM600Dialog = () => {
        m600Dialog.modal('show');
    };

    self.hideM600Dialog = () => {
        m600Dialog.modal('hide');
    };
};
