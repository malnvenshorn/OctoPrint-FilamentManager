/* global FilamentManager ko $ */

FilamentManager.prototype.viewModels.config = function configurationViewModel() {
    const self = this.viewModels.config;
    const api = this.core.client;
    const { settingsViewModel } = this.core.bridge.allViewModels;

    self.config = {};

    self.loadData = function mapPluginConfigurationToObservables() {
        self.config = settingsViewModel.settings.plugins.filamentmanager;
    };

    self.connectionTest = function runExternalDatabaseConnectionTest(viewModel, event) {
        const target = $(event.target);
        target.removeClass('btn-success btn-danger');
        target.prepend('<i class="fa fa-spinner fa-spin"></i> ');
        target.prop('disabled', true);

        const data = ko.mapping.toJS(self.config.database);

        api.database.test(data)
            .done(() => {
                target.addClass('btn-success');
            })
            .fail(() => {
                target.addClass('btn-danger');
            })
            .always(() => {
                $('i.fa-spinner', target).remove();
                target.prop('disabled', false);
            });
    };
};
