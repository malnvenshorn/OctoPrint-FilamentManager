/*
 * View model for OctoPrint-FilamentManager
 *
 * Author: Sven Lohrmann <malnvenshorn@gmail.com>
 * License: AGPLv3
 */
$(function() {
    "use strict";

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
        self.temperature = parameters[3];

        self.config_enableOdometer = ko.observable();
        self.config_enableWarning = ko.observable();
        self.config_autoPause = ko.observable();
        self.config_pauseThreshold = ko.observable();
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

        self.onBeforeBinding = function() {
            self._copyConfig();
            self.onExtruderCountChange();     // set initial number of tools
            self.settings.printerProfiles.currentProfileData.subscribe(function() {
                self.onExtruderCountChange(); // update number of tools on changes
            });
        };

        self.onStartupComplete = function() {
            self.requestInProgress(true);
            $.when(self.requestProfiles(), self.requestSpools(), self.requestSelectedSpools())
                .done(function(profiles, spools, selections) {
                    self.processProfiles(profiles[0]);
                    self.processSpools(spools[0]);
                    self.processSelectedSpools(selections[0]);
                })
                .always(function() {
                    self.requestInProgress(false);
                });
        };

        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "filamentmanager") {
                return;
            }

            var messageType = data.type;
            var messageData = data.data;

            if (messageType === "updated_filaments") {
                self.requestInProgress(true);
                $.when(self.requestSpools(), self.requestSelectedSpools())
                    .done(function(spools, selections) {
                        self.processSpools(spools[0]);
                        self.processSelectedSpools(selections[0]);
                    })
                    .always(function() {
                        self.requestInProgress(false);
                    });
            }
        };

        // spool selection

        self.selectedSpoolsHelper = ko.observableArray([]); // selected spool id for each tool
        self.tools = ko.observableArray([]);                // number of tools to generate select elements in template
        self.onSelectedSpoolChangeEnabled = false;          // false if querying selections to prevent triggering the
                                                            // change event again when setting selected spools

        self.onExtruderCountChange = function() {
            var currentProfileData = self.settings.printerProfiles.currentProfileData();
            var numExtruders = (currentProfileData ? currentProfileData.extruder.count() : 0);

            if (self.selectedSpoolsHelper().length < numExtruders) {
                // number of extruders has increased
                for (var i = self.selectedSpoolsHelper().length; i < numExtruders; ++i) {
                    // add observables
                    self.selectedSpools.push(undefined); // notifies observers
                    self.selectedSpoolsHelper().push(ko.observable(undefined));
                }
            } else {
                // number of extruders has decreased
                for (var i = numExtruders; i < self.selectedSpoolsHelper().length; ++i) {
                    // remove observables
                    self.selectedSpoolsHelper().pop();
                    self.selectedSpools.pop(); // notifies observers
                }
            }

            self.tools(new Array(numExtruders));
        };

        self.onSelectedSpoolChange = function(tool) {
            if (!self.onSelectedSpoolChangeEnabled) return;

            var spool = self.selectedSpoolsHelper()[tool]();
            var data = {
                tool: tool,
                    spool: {
                        id: spool !== undefined ? spool : null
                    }
                };
            self.updateSelectedSpool(data);
        };

        self.updateSelectedSpool = function(data) {
            self.requestInProgress(true);
            OctoPrint.plugins.filamentmanager.updateSelection(data.tool, data)
            .done(function(data) {
                var spool = data["selection"];
                self._updateSelectedSpoolData(spool);
                self._applyTemperatureOffset(spool);
            })
            .fail(function() {
                var text = gettext("There was an unexpected error while selecting the spool, please consult the logs.");
                new PNotify({title: gettext("Could not select spool"), text: text, type: "error", hide: false});
            })
            .always(function() {
                self.requestInProgress(false);
            });
        };

        self.requestSelectedSpools = function() {
            return OctoPrint.plugins.filamentmanager.listSelections();
        };

        self.processSelectedSpools = function(data) {
            self.onSelectedSpoolChangeEnabled = false;
            _.each(data["selections"], function(selection, index) {
                self._updateSelectedSpoolData(selection);
                self._applyTemperatureOffset(selection);
            });
            self.onSelectedSpoolChangeEnabled = true;
        }

        self._updateSelectedSpoolData = function(data) {
            if (data.tool < self.tools().length) {
                self.selectedSpoolsHelper()[data.tool](data.spool != null ? data.spool.id : undefined);
                self.selectedSpools()[data.tool] = (data.spool != null ? data.spool : undefined);
                self.selectedSpools.valueHasMutated(); // notifies observers
            }
        };

        self._reapplySubscription = undefined;

        self._applyTemperatureOffset = function(data) {
            if (self.loginState.isUser()) {
                // if logged in apply temperature offset
                if (data.tool < self.tools().length) {
                    var tool = self.temperature.tools()[data.tool];
                    var spool = data.spool;
                    self.temperature.changingOffset.item = tool;
                    self.temperature.changingOffset.name(tool.name());
                    self.temperature.changingOffset.offset(tool.offset());
                    self.temperature.changingOffset.newOffset(spool != null ? spool.temp_offset : 0);
                    self.temperature.confirmChangeOffset();
                }
            } else {
                // if not logged in set a subscription to automatically apply the temperature offset after login
                if (self._reapplySubscription === undefined) {
                    self._reapplySubscription = self.loginState.isUser.subscribe(self._reapplyTemperatureOffset);
                }
            }
        };

        self._reapplyTemperatureOffset = function() {
            if (!self.loginState.isUser()) return;

            // apply temperature offset
            _.each(self.selectedSpools(), function(spool, index) {
                var selection = {spool: spool, tool: index};
                self._applyTemperatureOffset(selection);
            });

            // remove subscription
            self._reapplySubscription.dispose();
            self._reapplySubscription = undefined;
        };

        // plugin settings

        self.showSettingsDialog = function() {
            self._copyConfig();
            $("#settings_plugin_filamentmanager_configurationdialog").modal("show");
        };

        self.hideSettingsDialog = function() {
            $("#settings_plugin_filamentmanager_configurationdialog").modal("hide");
        };

        self.savePluginSettings = function(viewModel, event) {
            var target = $(event.target);
            target.prepend('<i class="fa fa-spinner fa-spin"></i> ');

            var data = {
                plugins: {
                    filamentmanager: {
                        enableOdometer: self.config_enableOdometer(),
                        enableWarning: self.config_enableWarning(),
                        autoPause: self.config_autoPause(),
                        pauseThreshold: self.config_pauseThreshold(),
                        currencySymbol: self.config_currencySymbol()
                    }
                }
            };

            self.settings.saveData(data, {
                success: function() {
                    self.hideSettingsDialog();
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
            self.config_autoPause(pluginSettings.autoPause());
            self.config_pauseThreshold(pluginSettings.pauseThreshold());
            self.config_currencySymbol(pluginSettings.currencySymbol());
        };

        // profiles

        self.showProfilesDialog = function() {
            $("#settings_plugin_filamentmanager_profiledialog").modal("show");
        };

        self.requestProfiles = function(force=false) {
            return OctoPrint.plugins.filamentmanager.listProfiles(force);
        };

        self.processProfiles = function(data) {
            self.profiles(data.profiles);
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
            OctoPrint.plugins.filamentmanager.addProfile(data)
            .done(function() {
                self.requestProfiles()
                    .done(self.processProfiles)
                    .always(function() {
                        self.requestInProgress(false);
                    });
            })
            .fail(function() {
                var text = gettext("There was an unexpected error while saving the filament profile, " +
                                   "please consult the logs.");
                new PNotify({title: gettext("Could not add profile"), text: text, type: "error", hide: false});
                self.requestInProgress(false);
            });
        };

        self.updateProfile = function(data) {
            if (data === undefined) {
                data = self.profileEditor.toProfileData();
            }

            self.requestInProgress(true);
            OctoPrint.plugins.filamentmanager.updateProfile(data.id, data)
                .done(function() {
                    $.when(self.requestProfiles(), self.requestSpools(), self.requestSelectedSpools())
                    .done(function(profiles, spools, selections) {
                        self.processProfiles(profiles[0]);
                        self.processSpools(spools[0]);
                        self.processSelectedSpools(selections[0]);
                    })
                    .always(function() {
                        self.requestInProgress(false);
                    });
                })
                .fail(function() {
                    var text = gettext("There was an unexpected error while updating the filament profile, " +
                                       "please consult the logs.");
                    new PNotify({title: gettext("Could not update profile"), text: text, type: "error", hide: false});
                    self.requestInProgress(false);
                });
        };

        self.removeProfile = function(data) {
            var perform = function() {
                OctoPrint.plugins.filamentmanager.deleteProfile(data.id)
                    .done(function() {
                        self.requestProfiles()
                        .done(self.processProfiles)
                        .always(function() {
                            self.requestInProgress(false);
                        });
                    })
                    .fail(function(xhr) {
                        var text;
                        if (xhr.status == 409) {
                            text = gettext("Cannot delete profiles with associated spools.");
                        } else {
                            text = gettext("There was an unexpected error while removing the filament profile, " +
                                           "please consult the logs.");
                        }
                        var title = gettext("Could not delete profile");;
                        new PNotify({title: title, text: text, type: "error", hide: false});
                        self.requestInProgress(false);
                    });
            };

            var text = gettext("You are about to delete the filament profile \"%s (%s)\". " +
                               "Please notice that it is not possible to delete profiles with associated spools.");
            showConfirmationDialog(_.sprintf(text, data.material, data.vendor), perform);
        };

        // spools

        self.showSpoolDialog = function(data) {
            self.spoolEditor.fromSpoolData(data);
            $("#settings_plugin_filamentmanager_spooldialog").modal("show");
        };

        self.hideSpoolDialog = function() {
            $("#settings_plugin_filamentmanager_spooldialog").modal("hide");
        };

        self.requestSpools = function(force=false) {
            return OctoPrint.plugins.filamentmanager.listSpools(force);
        }

        self.processSpools = function(data) {
            self.spools.updateItems(data.spools);
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
            OctoPrint.plugins.filamentmanager.addSpool(data)
                .done(function() {
                    self.hideSpoolDialog();
                    self.requestSpools()
                        .done(self.processSpools)
                        .always(function() {
                            self.requestInProgress(false);
                        });
                })
                .fail(function() {
                    var text = gettext("There was an unexpected error while saving the filament spool, " +
                                       "please consult the logs.");
                    new PNotify({title: gettext("Could not add spool"), text: text, type: "error", hide: false});
                });
        };

        self.updateSpool = function(data) {
            if (data === undefined) {
                data = self.spoolEditor.toSpoolData();
            }

            self.requestInProgress(true);
            OctoPrint.plugins.filamentmanager.updateSpool(data.id, data)
                .done(function() {
                    self.hideSpoolDialog();
                    $.when(self.requestSpools(), self.requestSelectedSpools())
                        .done(function(spools, selections) {
                            self.processSpools(spools[0]);
                            self.processSelectedSpools(selections[0]);
                        })
                        .always(function() {
                            self.requestInProgress(false);
                        });
                })
                .fail(function() {
                    var text = gettext("There was an unexpected error while updating the filament spool, " +
                                       "please consult the logs.");
                    new PNotify({title: gettext("Could not update spool"), text: text, type: "error", hide: false});
                    self.requestInProgress(false);
                });
        };

        self.removeSpool = function(data) {
            var perform = function() {
                self.requestInProgress(true);
                OctoPrint.plugins.filamentmanager.deleteSpool(data.id)
                    .done(function() {
                        self.requestSpools()
                            .done(self.processSpools)
                            .always(function() {
                                self.requestInProgress(false);
                            });
                    })
                    .fail(function() {
                        var text = gettext("There was an unexpected error while removing the filament spool, " +
                                           "please consult the logs.");
                        new PNotify({title: gettext("Could not delete spool"), text: text, type: "error", hide: false});
                        self.requestInProgress(false);
                    });
            };

            var text = gettext("You are about to delete the filament spool \"%s - %s (%s)\".");
            showConfirmationDialog(_.sprintf(text, data.name, data.profile.material, data.profile.vendor), perform);
        };

        self.duplicateSpool = function(data) {
            data.used = 0;
            self.addSpool(data);
        }

        // import & export

        self.importFilename = ko.observable();

        self.invalidArchive = ko.pureComputed(function() {
            var name = self.importFilename();
            return name !== undefined && !(_.endsWith(name.toLocaleLowerCase(), ".zip"));
        });

        self.enableImport = ko.pureComputed(function() {
            var name = self.importFilename();
            return name !== undefined && name.trim() != "" && !self.invalidArchive();
        });

        self.importButton = $("#settings_plugin_filamentmanager_import_button");
        self.importElement = $("#settings_plugin_filamentmanager_import");

        self.importElement.fileupload({
            dataType: "json",
            maxNumberOfFiles: 1,
            autoUpload: false,
            add: function(e, data) {
                if (data.files.length == 0) {
                    return false;
                }

                self.importFilename(data.files[0].name);

                self.importButton.unbind("click");
                self.importButton.bind("click", function(event) {
                    event.preventDefault();
                    data.submit();
                });
            },
            done: function(e, data) {
                new PNotify({
                    title: gettext("Data import successfull"),
                    type: "success",
                    hide: true
                });

                self.importButton.unbind("click");
                self.importFilename(undefined);

                self.requestInProgress(true);
                $.when(self.requestProfiles(true), self.requestSpools(true))
                    .done(function(profiles, spools) {
                        self.processProfiles(profiles[0]);
                        self.processSpools(spools[0]);
                    })
                    .always(function() {
                        self.requestInProgress(false);
                    });
            },
            fail: function(e, data) {
                new PNotify({
                    title: gettext("Data import failed"),
                    text: gettext("Something went wrong, please consult the logs."),
                    type: "error",
                    hide: false
                });

                self.importButton.unbind("click");
                self.importFilename(undefined);
            }
        });

        self.exportUrl = function() {
            return "plugin/filamentmanager/export?apikey=" + UI_API_KEY;
        }
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FilamentManagerViewModel,
        dependencies: ["settingsViewModel", "printerStateViewModel", "loginStateViewModel", "temperatureViewModel"],
        elements: ["#settings_plugin_filamentmanager",
                   "#settings_plugin_filamentmanager_profiledialog",
                   "#settings_plugin_filamentmanager_spooldialog",
                   "#settings_plugin_filamentmanager_configurationdialog",
                   "#sidebar_plugin_filamentmanager_wrapper"]
    });
});
