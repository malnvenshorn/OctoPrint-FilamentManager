/*
 * View model for OctoPrint-FilamentManager
 *
 * Author: Sven Lohrmann <malnvenshorn@gmail.com>
 * License: AGPLv3
 */
$(function() {

    var cleanProfile = function() {
        return {
            id: 0,
            material: "",
            vendor: "",
            density: 1.25,
            diameter: 1.75
        };
    };

    var cleanSpool = function() {
        return {
            id: 0,
            name: "",
            cost: 20,
            weight: 1000,
            used: 0,
            temp_offset: 0,
            profile: {
                id: 0
            }
        };
    };

    var validFloat = function(value, def) {
        var f = parseFloat(value);
        return isNaN(f) ? def : f;
    };

    function ProfileEditorViewModel(profiles) {
        var self = this;

        self.profiles = profiles;
        self.isNew = ko.observable(true);
        self.selectedProfile = ko.observable();

        self.id = ko.observable();
        self.vendor = ko.observable();
        self.material = ko.observable();
        self.density = ko.observable();
        self.diameter = ko.observable();

        self.vendorInvalid = ko.pureComputed(function() {
            return !self.vendor();
        });

        self.materialInvalid = ko.pureComputed(function() {
            return !self.material();
        });

        self.selectedProfile.subscribe(function() {
            if (self.selectedProfile() === undefined) {
                if (!self.isNew()) {
                    // selected 'new profile' in options menu, but no profile created yet
                    self.fromProfileData();
                }
                return;
            }

            // find profile data
            var data = ko.utils.arrayFirst(self.profiles(), function(item) {
                return item.id == self.selectedProfile();
            });

            if (data !== null) {
                // populate data
                self.fromProfileData(data);
            }
        });

        self.fromProfileData = function(data) {
            self.isNew(data === undefined);

            if (data === undefined) {
                data = cleanProfile();
                self.selectedProfile(undefined);
            }

            self.id(data.id);
            self.vendor(data.vendor);
            self.material(data.material);
            self.density(data.density);
            self.diameter(data.diameter);
        };

        self.toProfileData = function() {
            var defaultProfile = cleanProfile();

            return {
                id: self.id(),
                vendor: self.vendor(),
                material: self.material(),
                density: validFloat(self.density(), defaultProfile.density),
                diameter: validFloat(self.diameter(), defaultProfile.diameter)
            };
        };

        self.fromProfileData();
    }

    function SpoolEditorViewModel(profiles) {
        var self = this;

        self.profiles = profiles;
        self.isNew = ko.observable(false);

        self.id = ko.observable();
        self.name = ko.observable();
        self.selectedProfile = ko.observable();
        self.cost = ko.observable();
        self.totalWeight = ko.observable();
        self.temp_offset = ko.observable();

        self.remaining = ko.observable();

        self.nameInvalid = ko.pureComputed(function() {
            return !self.name();
        });

        self.fromSpoolData = function(data) {
            self.isNew(data === undefined);

            if (data === undefined) {
                data = cleanSpool();
                if (self.profiles().length > 0) {
                    // automatically select first profile in list
                    data.profile.id = self.profiles()[0].id;
                }
            }

            // populate data
            self.id(data.id);
            self.name(data.name);
            self.selectedProfile(data.profile.id);
            self.totalWeight(data.weight);
            self.cost(data.cost);
            self.remaining(data.weight - data.used);
            self.temp_offset(data.temp_offset);
        };

        self.toSpoolData = function() {
            var defaultSpool = cleanSpool();
            var weight = validFloat(self.totalWeight(), defaultSpool.weight);
            var remaining = Math.min(validFloat(self.remaining(), defaultSpool.weight), weight);

            return {
                id: self.id(),
                name: self.name(),
                cost: validFloat(self.cost(), defaultSpool.cost),
                weight: weight,
                used: weight - remaining,
                temp_offset: self.temp_offset(),
                profile: {
                    id: self.selectedProfile()
                }
            };
        };
    }

    function FilamentManagerViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];
        self.printerState = parameters[1];
        self.loginState = parameters[2];

        self.config_enableOdometer = ko.observable();
        self.config_enableWarning = ko.observable();
        self.config_currencySymbol = ko.observable();

        self.requestInProgress = ko.observable(false);

        self.profiles = ko.observableArray([]);
        self.spools = new ItemListHelper(
            "filamentSpools",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "material": function(a, b) {
                    // sorts ascending
                    if (a["profile"]["material"].toLocaleLowerCase()
                        < b["profile"]["material"].toLocaleLowerCase()) return -1;
                    if (a["profile"]["material"].toLocaleLowerCase()
                        > b["profile"]["material"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "vendor": function(a, b) {
                    // sorts ascending
                    if (a["profile"]["vendor"].toLocaleLowerCase()
                        < b["profile"]["vendor"].toLocaleLowerCase()) return -1;
                    if (a["profile"]["vendor"].toLocaleLowerCase()
                        > b["profile"]["vendor"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "remaining": function(a, b) {
                    // sorts descending
                    ra = parseFloat(a.weight) - parseFloat(a.used);
                    rb = parseFloat(b.weight) - parseFloat(b.used);
                    if (ra > rb) return -1;
                    if (ra < rb) return 1;
                    return 0;
                }
            },
            {}, "name", [], [], 10
        );
        self.selectedSpools = ko.observableArray([]);

        self.pageSize = ko.pureComputed({
            read : function(){
                return self.spools.pageSize();
            },
            write: function(value){
                self.spools.pageSize(parseInt(value));
            }
        });

        self.profileEditor = new ProfileEditorViewModel(self.profiles);
        self.spoolEditor = new SpoolEditorViewModel(self.profiles);

        self.onStartup = function() {
            self.profileDialog = $("#settings_plugin_filamentmanager_profiledialog");
            self.spoolDialog = $("#settings_plugin_filamentmanager_spooldialog");
            self.configurationDialog = $("#settings_plugin_filamentmanager_configurationdialog");

            $("#sidebar_plugin_filamentmanager_wrapper").insertAfter("#state_wrapper");
        };

        self.onBeforeBinding = function() {
            self._copyConfig();
            self.onExtruderCountChange();     // set initial number of tools
            self.settings.printerProfiles.currentProfileData.subscribe(function() {
                self.onExtruderCountChange(); // update number of tools on changes
            });
        };

        self.onStartupComplete = function() {
            self.requestProfiles();
            self.requestSpools();
            self.requestSelectedSpools();
        };

        self.onEventPrinterStateChanged = function() {
            self.requestSpools();
        };

        //*************************************************************
        // spool selection

        self.selectedSpoolsHelper = ko.observableArray([]); // selected spool id for each tool
        self.spoolSubscriptions = [];                       // subscription objects from the helper
        self.tools = ko.observableArray([]);                // number of tools to generate select elements in template

        self.onExtruderCountChange = function() {
            var currentProfileData = self.settings.printerProfiles.currentProfileData();
            var numExtruders = (currentProfileData ? currentProfileData.extruder.count() : 0);

            if (self.selectedSpoolsHelper().length < numExtruders) {
                // number of extruders has increased
                for (var i = self.selectedSpoolsHelper().length; i < numExtruders; ++i) {
                    // add observables
                    self.selectedSpools.push(undefined); // notifies observers
                    self.selectedSpoolsHelper().push(ko.observable(undefined));
                    // add subscription
                    self.spoolSubscriptions.push(
                        self.selectedSpoolsHelper()[i].subscribe(self.onSelectedSpoolChange));
                }
            } else {
                // number of extruders has decreased
                for (var i = numExtruders; i < self.selectedSpoolsHelper().length; ++i) {
                    // remove subscription
                    self.spoolSubscriptions[i].dispose();
                    self.spoolSubscriptions.pop();
                    // remove observables
                    self.selectedSpoolsHelper().pop();
                    self.selectedSpools.pop(); // notifies observers
                }
            }

            self.tools(new Array(numExtruders));
        };

        self.onSelectedSpoolChange = function() {
            // TODO is there a way to identify the tool which has changed?
            // in that case we don't have to update all tools every time

            var data = _.map(self.selectedSpoolsHelper(), function(element, index){
                return {
                    tool: index,
                    spool: {
                        id: element() !== undefined ? element() : null
                    }
                };
            });

            $.ajax({
                url: "plugin/filamentmanager/selections",
                type: "POST",
                data: JSON.stringify({selections: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function(data) {
                self._updateSelectedSpoolData(data);
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Spool selection failed"), text: text, type: "error", hide: false});
            });
        };

        self._updateSelectedSpoolData = function(data) {
            _.each(self.selectedSpools(), function(element, index) {
                self.selectedSpools()[index] = undefined;
            });
            _.each(data["selections"], function(element, index) {
                self.selectedSpools()[element.tool] = element.spool;
                self.selectedSpoolsHelper()[element.tool](element.spool.id);
            });
            self.selectedSpools.valueHasMutated(); // notifies observers
        };

        self.requestSelectedSpools = function() {
            $.ajax({
                url: "plugin/filamentmanager/selections",
                type: "GET",
                dataType: "json",
            })
            .done(function(data) {
                self._updateSelectedSpoolData(data);
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Failed to query selected spools"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        //************************************************************
        // plugin settings

        self.showSettingsDialog = function() {
            self._copyConfig();
            self.configurationDialog.modal("show");
        };

        self.savePluginSettings = function(viewModel, event) {
            var target = $(event.target);
            target.prepend('<i class="fa fa-spinner fa-spin"></i> ');

            var data = {
                plugins: {
                    filamentmanager: {
                        enableOdometer: self.config_enableOdometer(),
                        enableWarning: self.config_enableWarning(),
                        currencySymbol: self.config_currencySymbol()
                    }
                }
            };

            self.settings.saveData(data, {
                success: function() {
                    self.configurationDialog.modal("hide");
                    self._copyConfig();
                },
                complete: function() {
                    $("i.fa-spinner", target).remove();
                },
                sending: true
            });
        };

        self._copyConfig = function() {
            var pluginSettings = self.settings.settings.plugins.filamentmanager;
            self.config_enableOdometer(pluginSettings.enableOdometer());
            self.config_enableWarning(pluginSettings.enableWarning());
            self.config_currencySymbol(pluginSettings.currencySymbol());
        };

        //************************************************************
        // profiles

        self.requestProfiles = function() {
            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/profiles",
                type: "GET",
                dataType: "json",
            })
            .done(function(data) {
                self.profiles(data.profiles);
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Failed to query profiles"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.showProfilesDialog = function() {
            self.profileDialog.modal("show");
        };

        self.saveProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            self.profileEditor.isNew() ? self.addProfile(data) : self.updateProfile(data);
        };

        self.addProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/profiles",
                type: "POST",
                data: JSON.stringify({profile: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function() {
                self.requestProfiles();
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.updateProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/profiles/" + data.id,
                type: "PATCH",
                data: JSON.stringify({profile: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function() {
                self.requestProfiles();
                self.requestSpools();
                self.requestSelectedSpools();
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.removeProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            var perform = function() {
                self.requestInProgress(true);
                $.ajax({
                    url: "plugin/filamentmanager/profiles/" + data.id,
                    type: "DELETE"
                })
                .done(function() {
                    self.requestProfiles();
                })
                .fail(function() {
                    var text = gettext("There was an unexpected database error, please consult the logs.");
                    new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
                })
                .always(function() {
                    self.requestInProgress(false);
                });
            };

            var text = gettext("You are about to delete the filament profile \"%(name)s\"." //\
                               + " Please notice that it is not possible to delete profiles with associated spools.");
            showConfirmationDialog(_.sprintf(text, {name: data.name}), perform);
        };

        //************************************************************
        // spools

        self.requestSpools = function() {
            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/spools",
                type: "GET",
                dataType: "json",
            })
            .done(function(data) {
                self.spools.updateItems(data.spools);
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Failed to query spools"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.showSpoolDialog = function(data) {
            self.spoolEditor.fromSpoolData(data);
            self.spoolDialog.modal("show");
        };

        self.hideSpoolDialog = function() {
            self.spoolDialog.modal("hide");
        };

        self.saveSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            self.spoolEditor.isNew() ? self.addSpool(data) : self.updateSpool(data);
        };

        self.addSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/spools",
                type: "POST",
                data: JSON.stringify({spool: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function() {
                self.requestSpools();
                self.hideSpoolDialog();
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.updateSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/spools/" + data.id,
                type: "PATCH",
                data: JSON.stringify({spool: data}),
                contentType: "application/json; charset=UTF-8"
            })
            .done(function() {
                self.requestSpools();
                self.requestSelectedSpools();
                self.hideSpoolDialog();
            })
            .fail(function() {
                var text = gettext("There was an unexpected database error, please consult the logs.");
                new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.removeSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            var perform = function() {
                self.requestInProgress(true);
                $.ajax({
                    url: "plugin/filamentmanager/spools/" + data.id,
                    type: "DELETE"
                })
                .done(function() {
                    self.requestSpools();
                })
                .fail(function() {
                    var text = gettext("There was an unexpected database error, please consult the logs.");
                    new PNotify({title: gettext("Saving failed"), text: text, type: "error", hide: false});
                })
                .always(function() {
                    self.requestInProgress(false);
                });
            };

            var text = gettext("You are about to delete the filament spool \"%(name)s\".");
            showConfirmationDialog(_.sprintf(text, {name: data.name}), perform);
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FilamentManagerViewModel,
        dependencies: ["settingsViewModel", "printerStateViewModel", "loginStateViewModel"],
        elements: ["#settings_plugin_filamentmanager",
                   "#settings_plugin_filamentmanager_profiledialog",
                   "#settings_plugin_filamentmanager_spooldialog",
                   "#settings_plugin_filamentmanager_configurationdialog",
                   "#sidebar_plugin_filamentmanager"]
    });
});
