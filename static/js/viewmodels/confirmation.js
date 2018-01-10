/* global FilamentManager gettext $ ko Utils */

FilamentManager.prototype.viewModels.confirmation = function spoolSelectionConfirmationViewModel() {
    const self = this.viewModels.confirmation;
    const { printerStateViewModel, settingsViewModel, filesViewModel } = this.core.bridge.allViewModels;
    const { selections } = this.viewModels;

    const dialog = $('#plugin_filamentmanager_confirmationdialog');
    const button = $('#plugin_filamentmanager_confirmationdialog_print');

    self.selections = ko.observableArray([]);

    self.print = function startResumePrintDummy() {};

    self.checkSelection = function checkIfSpoolSelectionsMatchesSelectedSpoolsInSidebar() {
        let match = true;
        self.selections().forEach((value) => {
            if (selections.tools()[value.tool]() !== value.spool) match = false;
        });
        button.attr('disabled', !match);
    };

    const showDialog = function showSpoolConfirmationDialog() {
        const s = [];
        printerStateViewModel.filament().forEach((value) => {
            const toolID = Utils.extractToolIDFromName(value.name());
            s.push({ spool: undefined, tool: toolID });
        });
        self.selections(s);
        button.attr('disabled', true);
        dialog.modal('show');
    };

    const startPrint = printerStateViewModel.print;

    printerStateViewModel.print = function confirmSpoolSelectionBeforeStartPrint() {
        if (settingsViewModel.settings.plugins.filamentmanager.confirmSpoolSelection()) {
            showDialog();
            button.html(gettext('Start Print'));
            self.print = function continueToStartPrint() {
                dialog.modal('hide');
                startPrint();
            };
        } else {
            startPrint();
        }
    };

    const resumePrint = printerStateViewModel.resume;

    printerStateViewModel.resume = function confirmSpoolSelectionBeforeResumePrint() {
        if (settingsViewModel.settings.plugins.filamentmanager.confirmSpoolSelection()) {
            showDialog();
            button.html(gettext('Resume Print'));
            self.print = function continueToResumePrint() {
                dialog.modal('hide');
                resumePrint();
            };
        } else {
            resumePrint();
        }
    };

    const { loadFile } = filesViewModel;

    filesViewModel.loadFile = function confirmSpoolSelectionOnLoadAndPrint(data, printAfterLoad) {
        if (printAfterLoad && settingsViewModel.settings.plugins.filamentmanager.confirmSpoolSelection()) {
            showDialog();
            button.html(gettext('Load and Print'));
            self.print = function continueToLoadAndPrint() {
                dialog.modal('hide');
                loadFile(data, printAfterLoad);
            };
        } else {
            loadFile(data, printAfterLoad);
        }
    };
};
