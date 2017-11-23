/* global FilamentManager */

FilamentManager.prototype.core.callbacks = function octoprintCallbacks() {
    const self = this;

    self.onStartup = function onStartupCallback() {
        self.viewModels.warning.replaceFilamentView();
    };

    self.onBeforeBinding = function onBeforeBindingCallback() {
        self.viewModels.config.loadData();
        self.viewModels.selections.setArraySize();
        self.viewModels.selections.setSubscriptions();
        self.viewModels.warning.setSubscriptions();
    };

    self.onStartupComplete = function onStartupCompleteCallback() {
        self.viewModels.profiles.requestProfiles();
        self.viewModels.spools.requestSpools();
        self.viewModels.selections.requestSelectedSpools();
    };

    self.onDataUpdaterPluginMessage = function onDataUpdaterPluginMessageCallback(plugin, data) {
        if (plugin !== 'filamentmanager') return;

        const messageType = data.type;
        // const messageData = data.data;
        // TODO needs improvement
        if (messageType === 'data_changed') {
            self.viewModels.profiles.requestProfiles();
            self.viewModels.spools.requestSpools();
            self.viewModels.selections.requestSelectedSpools();
        }
    };
};
