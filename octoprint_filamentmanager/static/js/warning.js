/*
 * View model for OctoPrint-FilamentManager
 *
 * Author: Sven Lohrmann <malnvenshorn@gmail.com>
 * License: AGPLv3
 */
$(function() {
    "use strict";

    function FilamentWarningViewModel(parameters) {
        var self = this;

        self.filamentManager = parameters[0];
        self.printerState = parameters[1];
        self.settings = parameters[2];

        self.filename = undefined;

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

        self.waitForFilamentData = false

        self.onBeforeBinding = function() {
            self.printerState.filament.subscribe(function() {
                if (self.filename !== self.printerState.filename()) {
                    if (self.printerState.filename() != undefined && self.printerState.filament().length < 1) {
                        // file selected, but no filament data found, probably because it's still in analysis queue
                        self.waitForFilamentData = true;
                    } else {
                        self._processData();
                    }
                }
                else if (self.waitForFilamentData && self.printerState.filament().length > 0) {
                    self._processData();
                }
            });
            self.filamentManager.selectedSpools.subscribe(self._processData);
        }

        self._processData = function() {
            self.waitForFilamentData = false;

            var filament = self.printerState.filament();
            var spoolData = self.filamentManager.selectedSpools();

            var warningIsShown = false; // used to prevent a separate warning message for each tool

            for (var i = 0; i < filament.length && i < spoolData.length; ++i) {
                if (spoolData[i] == undefined) {
                    // skip tools with no selected spool
                    filament[i].data().weight = 0;
                    continue;
                }

                var length = filament[i].data().length;
                var diameter = spoolData[i].profile.diameter;
                var density = spoolData[i].profile.density;

                var requiredFilament = self._calculateFilamentWeight(length, diameter, density);

                filament[i].data().weight = requiredFilament;

                if (self.settings.settings.plugins.filamentmanager.enableWarning()) {
                    var remainingFilament = spoolData[i].weight - spoolData[i].used;

                    if (requiredFilament > remainingFilament && !warningIsShown) {
                        self._showWarning();
                        warningIsShown = true;
                    }
                }
            }

            self.filename = self.printerState.filename();
            self.printerState.filamentWithWeight(filament);;
        };

        self._showWarning = function() {
            var text = gettext("The current print job needs more material than what's remaining on the selected spool.");
            new PNotify({title: gettext("Insufficient filament"), text: text, type: "warning", hide: false});
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
