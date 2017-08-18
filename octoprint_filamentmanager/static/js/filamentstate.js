/*
 * View model for OctoPrint-FilamentManager
 *
 * Author: Sven Lohrmann <malnvenshorn@gmail.com>
 * License: AGPLv3
 */
$(function() {
    function FilamentStateViewModel(parameters) {
        var self = this;

        self.filamentManager = parameters[0];
        self.printerState = parameters[1];

        self.printerState.filamentReplace = ko.observableArray([]);

        self.printerState.filament.subscribe(function() {
            self.printerState.filamentReplace(self.printerState.filament());
        });

        self.onStartup = function() {
            $("#state").find(".accordion-inner").contents().each(function() {
                if (this.nodeType === Node.COMMENT_NODE) {
                    if (this.nodeValue === " ko foreach: filament ") {
                        this.nodeValue = " ko foreach: filamentReplace ";
                    }
                }
            });
        };

        self.calculateFilamentWeight = function(length, diameter, density) {
            var radius = diameter / 2;
            var volume = length * Math.PI * radius * radius / 1000;
            return volume * density;
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FilamentStateViewModel,
        dependencies: ["filamentManagerViewModel", "printerStateViewModel"],
        elements: []
    });
});
