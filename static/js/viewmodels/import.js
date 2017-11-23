/* global FilamentManager ko $ PNotify gettext */

FilamentManager.prototype.viewModels.import = function importDataViewModel() {
    const self = this.viewModels.import;

    const importButton = $('#settings_plugin_filamentmanager_import_button');
    const importElement = $('#settings_plugin_filamentmanager_import');

    self.importFilename = ko.observable();
    self.importInProgress = ko.observable(false);

    self.afterImportCallbacks = [];

    self.invalidArchive = ko.pureComputed(() => {
        const name = self.importFilename();
        return name !== undefined && !name.toLocaleLowerCase().endsWith('.zip');
    });

    self.enableImport = ko.pureComputed(() => {
        const name = self.importFilename();
        return name !== undefined && name.trim() !== '' && !self.invalidArchive();
    });

    importElement.fileupload({
        dataType: 'json',
        maxNumberOfFiles: 1,
        autoUpload: false,
        add(e, data) {
            if (data.files.length === 0) return;

            self.importFilename(data.files[0].name);

            importButton.unbind('click');
            importButton.bind('click', (event) => {
                self.importInProgress(true);
                event.preventDefault();
                data.submit();
            });
        },
        done() {
            self.afterImportCallbacks.forEach((callback) => { callback(); });
        },
        fail() {
            new PNotify({ // eslint-disable-line no-new
                title: gettext('Data import failed'),
                text: gettext('Something went wrong, please consult the logs.'),
                type: 'error',
                hide: false,
            });
        },
        always() {
            importButton.unbind('click');
            self.importFilename(undefined);
            self.importInProgress(false);
        },
    });
};
