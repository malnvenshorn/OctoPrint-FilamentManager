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
            profile_id: 0,
            cost: 20,
            weight: 1000,
            used: 0
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
                    data.profile_id = self.profiles()[0].id;
                }
            }

            // populate data
            self.id(data.id);
            self.name(data.name);
            self.selectedProfile(data.profile_id);
            self.totalWeight(data.weight);
            self.cost(data.cost);
            self.remaining(data.weight - data.used);
        };

        self.toSpoolData = function() {
            var defaultSpool = cleanSpool();
            var weight = validFloat(self.totalWeight(), defaultSpool.weight);
            var remaining = Math.min(validFloat(self.remaining(), defaultSpool.weight), weight);

            return {
                id: self.id(),
                name: self.name(),
                profile_id: self.selectedProfile(),
                cost: validFloat(self.cost(), defaultSpool.cost),
                weight: weight,
                used: weight - remaining
            };
        };
    }

    function FilamentManagerViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];

        self.config_enableOdometer = ko.observable();
        self.config_enableWarning = ko.observable();

        self.requestInProgress = ko.observable(false);

        self.profiles = ko.observableArray([]);
        self.spoolsRaw = ko.observableArray([]);

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
            {}, "name", [], [], 5
        );

        self.pageSize = ko.pureComputed({
            read : function(){
                return self.spools.pageSize();
            },
            write: function(value){
                self.spools.pageSize(parseInt(value));
            }
        });

        self.selectedSpools = ko.observableArray([]);
        self.selectedSpoolsHelper = ko.observableArray([]);

        self.tools = ko.observableArray([]);

        self.profileEditor = new ProfileEditorViewModel(self.profiles);
        self.spoolEditor = new SpoolEditorViewModel(self.profiles);

        self.onStartup = function() {
            self.profileDialog = $("#settings_plugin_filamentmanager_profiledialog");
            self.spoolDialog = $("#settings_plugin_filamentmanager_spooldialog");
            self.configurationDialog = $("#settings_plugin_filamentmanager_configurationdialog");

            $("#sidebar_plugin_filamentmanager_wrapper").insertAfter("#state_wrapper");
        };

        self.onBeforeBinding = function() {
            self._syncWithExtruderCount();     // set initial number of tools
            self.settings.printerProfiles.currentProfileData.subscribe(function() {
                self._syncWithExtruderCount(); // update number of tools on changes
            });
        };

        self.onStartupComplete = function() {
            self.requestData("profiles");
            self.requestData("spools");
        };

        self.onEventPrinterStateChanged = function() {
            self.requestData("spools");
        };

        self.onSettingsBeforeSave = function() {
            var selectedSpools = self.settings.settings.plugins.filamentmanager.selectedSpools;
            for (var i = 0; i < self.selectedSpoolsHelper().length; ++i) {
                var id = "tool" + i;
                selectedSpools[id] = self.selectedSpoolsHelper()[i];
            }
        };

        self.spoolSubscriptions = [];

        /*
         * Sets number of tools for template generation and if neccessary adds
         * dictionary entries in the settings to save the selected spools.
         */
        self._syncWithExtruderCount = function() {
            var currentProfileData = self.settings.printerProfiles.currentProfileData();
            var numExtruders = (currentProfileData ? currentProfileData.extruder.count() : 0);

            var selectedSpools = self.settings.settings.plugins.filamentmanager.selectedSpools;

            for (var i = 0; i < numExtruders; ++i) {
                var id = "tool" + i;
                if (selectedSpools[id] === undefined) {
                    // create missing observables in config, this ensures that we have at least
                    // the same object length as selectedSpoolsHelper
                    selectedSpools[id] = ko.observable();
                }
                if (i >= self.tools().length) {
                    // subscribe if number of tools has increased
                    self.selectedSpoolsHelper()[i] = ko.observable();
                    self.spoolSubscriptions.push(self.selectedSpoolsHelper()[i].subscribe(self._updateSelectedSpoolData));
                }
            }

            for (var i = numExtruders; i < self.tools().length; ++i) {
                // unsubscribe if number of tools has decreased
                self.spoolSubscriptions[i].dispose();
            }

            self.tools(new Array(numExtruders));
        };

        self._updateSelectedSpoolData = function() {
            var list = []
            if (self.spools.items().length > 0) {
                for (var i = 0; i < self.tools().length; ++i) {
                    var id = self.selectedSpoolsHelper()[i]();
                    if (id === undefined) {
                        list.push(undefined);
                        continue;
                    };
                    var data = ko.utils.arrayFirst(self.spools.items(), function(item) {
                        return item.id == id;
                    });
                    list.push(data);
                }
            }
            self.selectedSpools(list);
        };

        self.savePluginSettings = function(viewModel, event) {
            var target = $(event.target);
            target.prepend('<i class="fa fa-spinner fa-spin"></i> ');

            var data = {
                plugins: {
                    filamentmanager: {
                        enableOdometer: self.config_enableOdometer(),
                        enableWarning: self.config_enableWarning()
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
        }

        self.showSettingsDialog = function() {
            self._copyConfig();
            self.configurationDialog.modal("show");
        };

        self.showProfilesDialog = function() {
            self.profileDialog.modal("show");
        };

        self.showSpoolDialog = function(data) {
            self.spoolEditor.fromSpoolData(data);
            self.spoolDialog.modal("show");
        };

        self.hideSpoolDialog = function() {
            self.spoolDialog.modal("hide");
        };

        self.requestData = function(data) {
            self.requestInProgress(true);
            $.ajax({
                url: "plugin/filamentmanager/" + data,
                type: "GET",
                dataType: "json",
            })
            .done(function(data) {
                self.fromResponse(data);
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.fromResponse = function(data) {
            if (data.hasOwnProperty("profiles")) self.profiles(data.profiles);
            else if (data.hasOwnProperty("spools")) self.spoolsRaw(data.spools);
            else return;

            // spool list has to be updated in either case (if we have received the dataset)
            if (self.profiles().length > 0 && self.spoolsRaw().length > 0) {
                var rows = ko.utils.arrayMap(self.spoolsRaw(), function (spool) {
                    var profile = ko.utils.arrayFirst(self.profiles(), function(item) {
                        return item.id == spool.profile_id;
                    });

                    // need to create a new dictionary, otherwise the ui doesn't get updated properly on changes,
                    // because knockout observable array doesn't observe properties of items
                    return { id: spool.id,
                             name: spool.name,
                             cost: spool.cost,
                             weight: spool.weight,
                             used: spool.used,
                             profile_id: spool.profile_id,
                             profile: profile };

                });
                self.spools.updateItems(rows);
                if (self.selectedSpools().length == 0) {
                    // load selected spools from settings, after we have received the initial dataset
                    var selectedSpools = self.settings.settings.plugins.filamentmanager.selectedSpools;
                    for (var i = 0; i < self.selectedSpoolsHelper().length; ++i) {
                        var id = "tool" + i;
                        self.selectedSpoolsHelper()[i](selectedSpools[id]());
                    }
                }
            } else {
                self.spools.updateItems([]);
            }
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
                self.requestData("profiles");
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
                self.requestData("profiles")
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
                    self.requestData("profiles");
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
                self.requestData("spools");
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
                self.requestData("spools");
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
                    self.requestData("spools")
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
        dependencies: ["settingsViewModel"],
        elements: ["#settings_plugin_filamentmanager",
                   "#settings_plugin_filamentmanager_profiledialog",
                   "#settings_plugin_filamentmanager_spooldialog",
                   "#settings_plugin_filamentmanager_configurationdialog",
                   "#sidebar_plugin_filamentmanager"]
    });
});
