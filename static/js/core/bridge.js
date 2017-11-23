/* global FilamentManager  _ */

FilamentManager.prototype.core.bridge = function pluginBridge() {
    const self = this;

    self.core.bridge = {
        allViewModels: {},

        REQUIRED_VIEWMODELS: [
            'settingsViewModel',
            'printerStateViewModel',
            'loginStateViewModel',
            'temperatureViewModel',
        ],

        BINDINGS: [
            '#settings_plugin_filamentmanager',
            '#settings_plugin_filamentmanager_profiledialog',
            '#settings_plugin_filamentmanager_spooldialog',
            '#settings_plugin_filamentmanager_configurationdialog',
            '#sidebar_plugin_filamentmanager_wrapper',
        ],

        viewModel: function FilamentManagerViewModel(viewModels) {
            self.core.bridge.allViewModels = _.object(self.core.bridge.REQUIRED_VIEWMODELS, viewModels);
            self.core.callbacks.call(self);

            self.viewModels.profiles.call(self);
            self.viewModels.spools.call(self);
            self.viewModels.selections.call(self);
            self.viewModels.config.call(self);
            self.viewModels.import.call(self);

            self.viewModels.profiles.updateCallbacks.push(self.viewModels.spools.requestSpools);
            self.viewModels.profiles.updateCallbacks.push(self.viewModels.selections.requestSelectedSpools);
            self.viewModels.spools.updateCallbacks.push(self.viewModels.selections.requestSelectedSpools);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.profiles.requestProfiles);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.spools.requestSpools);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.selections.requestSelectedSpools);

            self.viewModels.warning.call(self);
            self.selectedSpools = self.viewModels.selections.selectedSpools; // for backwards compatibility
            return self;
        },
    };

    return self.core.bridge;
};
