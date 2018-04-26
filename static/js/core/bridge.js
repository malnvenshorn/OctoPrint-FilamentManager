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
            'filesViewModel',
        ],

        BINDINGS: [
            '#settings_plugin_filamentmanager',
            '#sidebar_plugin_filamentmanager_wrapper',
            '#tab_plugin_filamentmanager',
            '#fm_dialog_profile',
            '#fm_dialog_spool',
            '#fm_dialog_confirmation',
        ],

        viewModel: function FilamentManagerViewModel(viewModels) {
            self.core.bridge.allViewModels = _.object(self.core.bridge.REQUIRED_VIEWMODELS, viewModels);
            self.core.callbacks.call(self);

            Object.values(self.viewModels).forEach(viewModel => viewModel.call(self));

            self.viewModels.profiles.updateCallbacks.push(self.viewModels.spools.requestSpools);
            self.viewModels.profiles.updateCallbacks.push(self.viewModels.selections.requestSelectedSpools);
            self.viewModels.spools.updateCallbacks.push(self.viewModels.selections.requestSelectedSpools);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.profiles.requestProfiles);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.spools.requestSpools);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.selections.requestSelectedSpools);

            self.selectedSpools = self.viewModels.selections.selectedSpools; // for backwards compatibility
            return self;
        },
    };

    return self.core.bridge;
};
