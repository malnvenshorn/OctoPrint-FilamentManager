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

        self.onBeforeBinding = function() {
            self.printerState.filament.subscribe(function() {
                if (self.printerState.filament().length > 0
                    && self.filename !== self.printerState.filename()) {
                    if (self.settings.settings.plugins.filamentmanager.enableWarning()) {
                        self.filename = self.printerState.filename();
                        self.showWarningIfNeeded();
                    }
                }
            });

            self.filamentManager.selectedSpools.subscribe(function() {
                if (self.settings.settings.plugins.filamentmanager.enableWarning()) {
                    self.showWarningIfNeeded();
                }
            });
        }

        self.showWarningIfNeeded = function() {
            var filament = self.printerState.filament();
            var spoolsData = self.filamentManager.selectedSpools();
            for (var i = 0; i < filament.length && i < spoolsData.length; ++i) {
                if (spoolsData[i] === undefined) continue;  // skip tools with no selected spool
                if (self.previousData !== undefined         // skip check if data hasn't changed
                    && JSON.stringify(spoolsData[i]) === JSON.stringify(self.previousData[i])) continue;
                var length = filament[i].data().length;
                var diameter = spoolsData[i].profile.diameter;
                var density = spoolsData[i].profile.density;
                var remaining = spoolsData[i].profile.weight - spoolsData[i].used;
                var needed = self.calculateFilamentWeight(length, diameter, density);
                if (needed > remaining) {
                    self.showWarning();
                    break;
                }
            }
            self.previousData = spoolsData;
        };

        self.showWarning = function() {
            var text = gettext("The current print job needs more material than whats remaining on the selected spool, be careful when printing this.");
            new PNotify({title: gettext("Filament warning"), text: text, type: "warning", hide: false});
        };

        self.calculateFilamentWeight = function(length, diameter, density) {
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
