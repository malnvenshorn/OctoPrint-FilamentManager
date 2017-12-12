/* global FilamentManager gettext $ ko Utils */

FilamentManager.prototype.viewModels.confirmation = function spoolSelectionConfirmationViewModel() {
    const self = this.viewModels.confirmation;
    const { printerStateViewModel, settingsViewModel } = this.core.bridge.allViewModels;
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

    printerStateViewModel.fmPrint = function confirmSpoolSelectionBeforeStartPrint() {
        if (settingsViewModel.settings.plugins.filamentmanager.confirmSpoolSelection()) {
            showDialog();
            button.html(gettext('Start Print'));
            self.print = function startPrint() {
                dialog.modal('hide');
                printerStateViewModel.print();
            };
        } else {
            printerStateViewModel.print();
        }
    };

    printerStateViewModel.fmResume = function confirmSpoolSelectionBeforeResumePrint() {
        if (settingsViewModel.settings.plugins.filamentmanager.confirmSpoolSelection()) {
            showDialog();
            button.html(gettext('Resume Print'));
            self.print = function resumePrint() {
                dialog.modal('hide');
                printerStateViewModel.onlyResume();
            };
        } else {
            printerStateViewModel.onlyResume();
        }
    };

    self.replacePrintStart = function replacePrintStartButtonBehavior() {
        // Modifying print button action to invoke 'fmPrint'
        const element = $('#job_print');
        let dataBind = element.attr('data-bind');
        dataBind = dataBind.replace(/click:(.*?)(?=,|$)/, 'click: fmPrint');
        element.attr('data-bind', dataBind);
    };

    self.replacePrintResume = function replacePrintResumeButtonBehavior() {
        // Modifying resume button action to invoke 'fmResume'
        const element = $('#job_pause');
        let dataBind = element.attr('data-bind');
        dataBind = dataBind.replace(/click:(.*?)(?=,|$)/, 'click: function() { isPaused() ? fmResume() : onlyPause(); }');
        element.attr('data-bind', dataBind);
    };
};
