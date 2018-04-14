/* global FilamentManager ko Node $ gettext PNotify Utils */

FilamentManager.prototype.viewModels.warning = function insufficientFilamentWarningViewModel() {
    const self = this.viewModels.warning;
    const { printerStateViewModel, settingsViewModel } = this.core.bridge.allViewModels;
    const { selections } = this.viewModels;

    printerStateViewModel.filamentWithWeight = ko.observableArray([]);

    printerStateViewModel.formatFilamentWithWeight = function formatFilamentWithWeightInSidebar(filament) {
        if (!filament || !filament.length) return '-';

        let result = `${(filament.length / 1000).toFixed(2)}m`;

        if (Object.prototype.hasOwnProperty.call(filament, 'weight') && filament.weight) {
            result += ` / ${filament.weight.toFixed(2)}g`;
        }

        return result;
    };

    self.replaceFilamentView = function replaceFilamentViewInSidebar() {
        $('#state').find('.accordion-inner').contents().each((index, item) => {
            if (item.nodeType === Node.COMMENT_NODE) {
                if (item.nodeValue === ' ko foreach: filament ') {
                    item.nodeValue = ' ko foreach: [] '; // eslint-disable-line no-param-reassign
                    const element = '<!-- ko foreach: filamentWithWeight --> <span data-bind="text: \'Filament (\' + name() + \'): \', title: \'Filament usage for \' + name()"></span><strong data-bind="text: $root.formatFilamentWithWeight(data())"></strong><br> <!-- /ko -->';
                    $(element).insertBefore(item);
                    return false; // exit loop
                }
            }
            return true;
        });
    };

    let filename;
    let waitForFilamentData = false;

    let warning = null;

    const updateFilament = function updateFilamentWeightAndCheckRemainingFilament() {
        const calculateWeight = function calculateFilamentWeight(length, diameter, density) {
            const radius = diameter / 2;
            const volume = (length * Math.PI * radius * radius) / 1000;
            return volume * density;
        };

        const showWarning = function showWarningIfRequiredFilamentExceedsRemaining(required, remaining) {
            if (required < remaining) return false;

            if (warning) {
                // fade out notification if one is still shown
                warning.options.delay = 1000;
                warning.queueRemove();
            }

            warning = new PNotify({
                title: gettext('Insufficient filament'),
                text: gettext("The current print job needs more material than what's left on the selected spool."),
                type: 'warning',
                hide: false,
            });

            return true;
        };

        const filament = printerStateViewModel.filament();
        const spoolData = selections.selectedSpools();

        let warningIsShown = false; // used to prevent a separate warning message for each tool

        for (let i = 0; i < filament.length; i += 1) {
            const toolID = Utils.extractToolIDFromName(filament[i].name());

            if (!spoolData[toolID]) {
                filament[i].data().weight = 0;
            } else {
                const { length } = filament[i].data();
                const { diameter, density } = spoolData[toolID].profile;

                const requiredFilament = calculateWeight(length, diameter, density);
                const remainingFilament = spoolData[toolID].weight - spoolData[toolID].used;

                filament[i].data().weight = requiredFilament;

                if (!warningIsShown && settingsViewModel.settings.plugins.filamentmanager.enableWarning()) {
                    warningIsShown = showWarning(requiredFilament, remainingFilament);
                }
            }
        }

        printerStateViewModel.filamentWithWeight(filament);
    };

    self.setSubscriptions = function subscribeToObservablesWhichTriggerAnUpdate() {
        selections.selectedSpools.subscribe(updateFilament);

        printerStateViewModel.filament.subscribe(() => {
            // OctoPrint constantly updates the filament observable, to prevent invocing the warning message
            // on every update we only call the updateFilament() method if the selected file has changed
            if (filename !== printerStateViewModel.filename()) {
                // if new file selected but no filament data found (probably because it's still in analysis queue)
                // we set the wait flag to update the view again, when the data arives
                waitForFilamentData = printerStateViewModel.filename() != null
                    && printerStateViewModel.filament().length < 1;
                filename = printerStateViewModel.filename();
                updateFilament();
            } else if (waitForFilamentData && printerStateViewModel.filament().length > 0) {
                waitForFilamentData = false;
                updateFilament();
            }
        });
    };
};
