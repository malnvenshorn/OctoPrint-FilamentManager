/*
 * View model for OctoPrint-FilamentManager
 *
 * Author: Sven Lohrmann <malnvenshorn@gmail.com>
 * License: AGPLv3
 */
$(function() {
    function FilamentWarningViewModel(parameters) {
        var self = this;

        self.filamentManager = parameters[0];
        self.printerState = parameters[1];
        self.settings = parameters[2];

        self.filename = undefined;
        self.previousData = undefined;

        self.printerState.filamentWithWeight = ko.observableArray([]);

        self.printerState.formatFilamentWithWeight = function(filament) {
            if (!filament || !filament["length"]) return "-";
            var result = "%(length).02fm";
            if (filament.hasOwnProperty("weight") && filament.weight) {
                result += " / %(weight).02fg";
            }
            return _.sprintf(result, {length: filament["length"] / 1000, weight: filament["weight"]});
        }

        self.onStartup = function() {
            $("#state").find(".accordion-inner").contents().each(function(index, item) {
                if (item.nodeType === Node.COMMENT_NODE) {
                    if (item.nodeValue === " ko foreach: filament ") {
                        item.nodeValue = " ko foreach: [] ";
                        $("<!-- ko foreach: filamentWithWeight -->" +
                                      "<span data-bind=\"text: 'Filament (' + name() + '): ', " +
                                      "title: 'Filament usage for ' + name()\"></span>" +
                                      "<strong data-bind=\"text: $root.formatFilamentWithWeight(data())\"></strong><br>" +
                                      "<!-- /ko -->").insertBefore(item);
                        return false; // exit loop
                    }
                }
            });
        };

        self.onBeforeBinding = function() {
            self.printerState.filament.subscribe(self._processData);
            self.filamentManager.selectedSpools.subscribe(self._processData);
        }

        self._processData = function() {
            var filament = self.printerState.filament();
            var spoolsData = self.filamentManager.selectedSpools();
            var fileHasChanged = (self.filename !== self.printerState.filename());

            for (var i = 0; i < filament.length && i < spoolsData.length; ++i) {
                if (spoolsData[i] === undefined) {
                    // skip tools with no selected spool
                    filament[i].data().weight = 0;
                    continue;
                }

                var length = filament[i].data().length;
                var diameter = spoolsData[i].profile.diameter;
                var density = spoolsData[i].profile.density;
                var needed = self._calculateFilamentWeight(length, diameter, density);

                filament[i].data().weight = needed;

                if (!fileHasChanged && self.previousData !== undefined
                    && JSON.stringify(spoolsData[i]) === JSON.stringify(self.previousData[i])) {
                    // skip check if file and data hasn't changed, this prevents warning message spamming
                    continue;
                }

                if (self.settings.settings.plugins.filamentmanager.enableWarning()) {
                    var remaining = spoolsData[i].weight - spoolsData[i].used;

                    if (needed > remaining) {
                        self._showWarning();
                        break;
                    }
                }
            }

            self.filename = self.printerState.filename();
            self.previousData = spoolsData;
            self.printerState.filamentWithWeight(filament);;
        };

        self._showWarning = function() {
            var text = gettext("The current print job needs more material than whats remaining on the selected spool.");
            new PNotify({title: gettext("Filament warning"), text: text, type: "warning", hide: false});
        };

        self._calculateFilamentWeight = function(length, diameter, density) {
            var radius = diameter / 2;
            var volume = length * Math.PI * radius * radius / 1000;
            return volume * density;
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FilamentWarningViewModel,
        dependencies: ["filamentManagerViewModel", "printerStateViewModel", "settingsViewModel"],
        elements: []
    });
});
