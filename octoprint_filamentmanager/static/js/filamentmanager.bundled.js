/*
 * View model for OctoPrint-FilamentManager
 *
 * Author: Sven Lohrmann <malnvenshorn@gmail.com>
 * License: AGPLv3
 */

var FilamentManager = function FilamentManager() {
    this.core.client.call(this);
    return this.core.bridge.call(this);
};

FilamentManager.prototype = {
    constructor: FilamentManager,
    core: {},
    viewModels: {},
    selectedSpools: undefined
};
var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Utils = function () {
    function Utils() {
        _classCallCheck(this, Utils);
    }

    _createClass(Utils, null, [{
        key: "validInt",
        // eslint-disable-line no-unused-vars
        value: function validInt(value, def) {
            var v = Number.parseInt(value, 10);
            return Number.isNaN(v) ? def : v;
        }
    }, {
        key: "validFloat",
        value: function validFloat(value, def) {
            var v = Number.parseFloat(value);
            return Number.isNaN(v) ? def : v;
        }
    }, {
        key: "runRequestChain",
        value: function runRequestChain(requests) {
            var index = 0;

            var next = function callNextRequest() {
                if (index < requests.length) {
                    // Do the next, increment the call index
                    requests[index]().done(function () {
                        index += 1;
                        next();
                    });
                }
            };

            next(); // Start chain
        }
    }, {
        key: "extractToolIDFromName",
        value: function extractToolIDFromName(name) {
            var result = /(\d+)/.exec(name);
            return result === null ? 0 : result[1];
        }
    }]);

    return Utils;
}();
/* global FilamentManager  _ */

FilamentManager.prototype.core.bridge = function pluginBridge() {
    var self = this;

    self.core.bridge = {
        allViewModels: {},

        REQUIRED_VIEWMODELS: ['settingsViewModel', 'printerStateViewModel', 'loginStateViewModel', 'temperatureViewModel', 'filesViewModel'],

        BINDINGS: ['#settings_plugin_filamentmanager', '#settings_plugin_filamentmanager_profiledialog', '#settings_plugin_filamentmanager_spooldialog', '#settings_plugin_filamentmanager_configurationdialog', '#sidebar_plugin_filamentmanager_wrapper', '#plugin_filamentmanager_confirmationdialog', '#plugin_filamentmanager_m600dialog'],

        viewModel: function FilamentManagerViewModel(viewModels) {
            self.core.bridge.allViewModels = _.object(self.core.bridge.REQUIRED_VIEWMODELS, viewModels);
            self.core.callbacks.call(self);

            Object.values(self.viewModels).forEach(function (viewModel) {
                return viewModel.call(self);
            });

            self.viewModels.profiles.updateCallbacks.push(self.viewModels.spools.requestSpools);
            self.viewModels.profiles.updateCallbacks.push(self.viewModels.selections.requestSelectedSpools);
            self.viewModels.spools.updateCallbacks.push(self.viewModels.selections.requestSelectedSpools);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.profiles.requestProfiles);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.spools.requestSpools);
            self.viewModels.import.afterImportCallbacks.push(self.viewModels.selections.requestSelectedSpools);

            self.selectedSpools = self.viewModels.selections.selectedSpools; // for backwards compatibility
            return self;
        }
    };

    return self.core.bridge;
};
/* global FilamentManager Utils */

FilamentManager.prototype.core.callbacks = function octoprintCallbacks() {
    var self = this;

    self.onStartup = function onStartupCallback() {
        self.viewModels.warning.replaceFilamentView();
    };

    self.onBeforeBinding = function onBeforeBindingCallback() {
        self.viewModels.config.loadData();
        self.viewModels.selections.setArraySize();
        self.viewModels.selections.setSubscriptions();
        self.viewModels.warning.setSubscriptions();
    };

    self.onStartupComplete = function onStartupCompleteCallback() {
        var requests = [self.viewModels.profiles.requestProfiles, self.viewModels.spools.requestSpools, self.viewModels.selections.requestSelectedSpools];

        // We chain them because, e.g. selections depends on spools
        Utils.runRequestChain(requests);
    };

    self.onDataUpdaterPluginMessage = function onDataUpdaterPluginMessageCallback(plugin, data) {
        if (plugin !== 'filamentmanager') return;

        var messageType = data.type;
        // const messageData = data.data;
        // TODO needs improvement
        if (messageType === 'data_changed') {
            self.viewModels.profiles.requestProfiles();
            self.viewModels.spools.requestSpools();
            self.viewModels.selections.requestSelectedSpools();
        } else if (messageType === 'm600_command_started') {
            self.viewModels.selections.showM600Dialog();
        } else if (messageType === 'm600_command_finished') {
            self.viewModels.selections.hideM600Dialog();
        }
    };
};
/* global FilamentManager OctoPrint */

FilamentManager.prototype.core.client = function apiClient() {
    var self = this.core.client;

    var pluginUrl = 'plugin/filamentmanager';

    var profileUrl = function apiProfileNamespace(profile) {
        var url = pluginUrl + '/profiles';
        return profile === undefined ? url : url + '/' + profile;
    };

    var spoolUrl = function apiSpoolNamespace(spool) {
        var url = pluginUrl + '/spools';
        return spool === undefined ? url : url + '/' + spool;
    };

    var selectionUrl = function apiSelectionNamespace(selection) {
        var url = pluginUrl + '/selections';
        return selection === undefined ? url : url + '/' + selection;
    };

    self.profile = {
        list: function list() {
            var force = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
            var opts = arguments[1];

            var query = force ? { force: force } : {};
            return OctoPrint.getWithQuery(profileUrl(), query, opts);
        },
        get: function get(id, opts) {
            return OctoPrint.get(profileUrl(id), opts);
        },
        add: function add(profile, opts) {
            var data = { profile: profile };
            return OctoPrint.postJson(profileUrl(), data, opts);
        },
        update: function update(id, profile, opts) {
            var data = { profile: profile };
            return OctoPrint.patchJson(profileUrl(id), data, opts);
        },
        delete: function _delete(id, opts) {
            return OctoPrint.delete(profileUrl(id), opts);
        }
    };

    self.spool = {
        list: function list() {
            var force = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;
            var opts = arguments[1];

            var query = force ? { force: force } : {};
            return OctoPrint.getWithQuery(spoolUrl(), query, opts);
        },
        get: function get(id, opts) {
            return OctoPrint.get(spoolUrl(id), opts);
        },
        add: function add(spool, opts) {
            var data = { spool: spool };
            return OctoPrint.postJson(spoolUrl(), data, opts);
        },
        update: function update(id, spool, opts) {
            var data = { spool: spool };
            return OctoPrint.patchJson(spoolUrl(id), data, opts);
        },
        delete: function _delete(id, opts) {
            return OctoPrint.delete(spoolUrl(id), opts);
        }
    };

    self.selection = {
        list: function list(opts) {
            return OctoPrint.get(selectionUrl(), opts);
        },
        update: function update(id, selection, opts) {
            var data = { selection: selection };
            return OctoPrint.patchJson(selectionUrl(id), data, opts);
        }
    };

    self.database = {
        test: function test(config, opts) {
            var url = pluginUrl + '/database/test';
            var data = { config: config };
            return OctoPrint.postJson(url, data, opts);
        }
    };
};
/* global FilamentManager ko $ */

FilamentManager.prototype.viewModels.config = function configurationViewModel() {
    var self = this.viewModels.config;
    var api = this.core.client;
    var settingsViewModel = this.core.bridge.allViewModels.settingsViewModel;


    var dialog = $('#settings_plugin_filamentmanager_configurationdialog');

    self.showDialog = function showConfigurationDialog() {
        self.loadData();
        dialog.modal('show');
    };

    self.hideDialog = function hideConfigurationDialog() {
        dialog.modal('hide');
    };

    self.config = ko.mapping.fromJS({});

    self.saveData = function savePluginConfiguration(viewModel, event) {
        var target = $(event.target);
        target.prepend('<i class="fa fa-spinner fa-spin"></i> ');

        var data = {
            plugins: {
                filamentmanager: ko.mapping.toJS(self.config)
            }
        };

        settingsViewModel.saveData(data, {
            success: function success() {
                self.hideDialog();
            },
            complete: function complete() {
                $('i.fa-spinner', target).remove();
            },

            sending: true
        });
    };

    self.loadData = function mapPluginConfigurationToObservables() {
        var pluginSettings = settingsViewModel.settings.plugins.filamentmanager;
        ko.mapping.fromJS(ko.toJS(pluginSettings), self.config);
    };

    self.connectionTest = function runExternalDatabaseConnectionTest(viewModel, event) {
        var target = $(event.target);
        target.removeClass('btn-success btn-danger');
        target.prepend('<i class="fa fa-spinner fa-spin"></i> ');
        target.prop('disabled', true);

        var data = ko.mapping.toJS(self.config.database);

        api.database.test(data).done(function () {
            target.addClass('btn-success');
        }).fail(function () {
            target.addClass('btn-danger');
        }).always(function () {
            $('i.fa-spinner', target).remove();
            target.prop('disabled', false);
        });
    };
};
/* global FilamentManager gettext $ ko Utils OctoPrint */

FilamentManager.prototype.viewModels.confirmation = function spoolSelectionConfirmationViewModel() {
    var self = this.viewModels.confirmation;
    var _core$bridge$allViewM = this.core.bridge.allViewModels,
        printerStateViewModel = _core$bridge$allViewM.printerStateViewModel,
        settingsViewModel = _core$bridge$allViewM.settingsViewModel,
        filesViewModel = _core$bridge$allViewM.filesViewModel;
    var selections = this.viewModels.selections;


    var dialog = $('#plugin_filamentmanager_confirmationdialog');
    var button = $('#plugin_filamentmanager_confirmationdialog_print');

    self.selections = ko.observableArray([]);

    self.print = function startResumePrintDummy() {};

    self.checkSelection = function checkIfSpoolSelectionsMatchesSelectedSpoolsInSidebar() {
        var match = true;
        self.selections().forEach(function (value) {
            if (selections.tools()[value.tool]() !== value.spool) match = false;
        });
        button.attr('disabled', !match);
    };

    var showDialog = function showSpoolConfirmationDialog() {
        var s = [];
        printerStateViewModel.filament().forEach(function (value) {
            var toolID = Utils.extractToolIDFromName(value.name());
            s.push({ spool: undefined, tool: toolID });
        });
        self.selections(s);
        button.attr('disabled', true);
        dialog.modal('show');
    };

    var startPrint = printerStateViewModel.print;

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

    var resumePrint = printerStateViewModel.resume;

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

    filesViewModel.loadFile = function confirmSpoolSelectionOnLoadAndPrint(data, printAfterLoad) {
        if (!data) {
            return;
        }

        if (printAfterLoad && filesViewModel.listHelper.isSelected(data) && filesViewModel.enablePrint(data)) {
            // file was already selected, just start the print job
            printerStateViewModel.print();
        } else {
            // select file, start print job (if requested and within dimensions)
            var withinPrintDimensions = filesViewModel.evaluatePrintDimensions(data, true);
            var print = printAfterLoad && withinPrintDimensions;

            OctoPrint.files.select(data.origin, data.path, false).done(function () {
                if (print) printerStateViewModel.print();
            });
        }
    };
};
/* global FilamentManager ko $ PNotify gettext */

FilamentManager.prototype.viewModels.import = function importDataViewModel() {
    var self = this.viewModels.import;

    var importButton = $('#settings_plugin_filamentmanager_import_button');
    var importElement = $('#settings_plugin_filamentmanager_import');

    self.importFilename = ko.observable();
    self.importInProgress = ko.observable(false);

    self.afterImportCallbacks = [];

    self.invalidArchive = ko.pureComputed(function () {
        var name = self.importFilename();
        return name !== undefined && !name.toLocaleLowerCase().endsWith('.zip');
    });

    self.enableImport = ko.pureComputed(function () {
        var name = self.importFilename();
        return name !== undefined && name.trim() !== '' && !self.invalidArchive();
    });

    importElement.fileupload({
        dataType: 'json',
        maxNumberOfFiles: 1,
        autoUpload: false,
        add: function add(e, data) {
            if (data.files.length === 0) return;

            self.importFilename(data.files[0].name);

            importButton.unbind('click');
            importButton.bind('click', function (event) {
                self.importInProgress(true);
                event.preventDefault();
                data.submit();
            });
        },
        done: function done() {
            self.afterImportCallbacks.forEach(function (callback) {
                callback();
            });
        },
        fail: function fail() {
            new PNotify({ // eslint-disable-line no-new
                title: gettext('Data import failed'),
                text: gettext('Something went wrong, please consult the logs.'),
                type: 'error',
                hide: false
            });
        },
        always: function always() {
            importButton.unbind('click');
            self.importFilename(undefined);
            self.importInProgress(false);
        }
    });
};
/* global FilamentManager ko gettext showConfirmationDialog PNotify $ Utils */

FilamentManager.prototype.viewModels.profiles = function profilesViewModel() {
    var self = this.viewModels.profiles;
    var api = this.core.client;

    self.allProfiles = ko.observableArray([]);

    self.cleanProfile = function getDefaultValuesForNewProfile() {
        return {
            id: undefined,
            material: '',
            vendor: '',
            density: 1.25,
            diameter: 1.75
        };
    };

    self.loadedProfile = {
        id: ko.observable(),
        vendor: ko.observable(),
        material: ko.observable(),
        density: ko.observable(),
        diameter: ko.observable(),
        isNew: ko.observable(true)
    };

    self.vendorInvalid = ko.pureComputed(function () {
        return !self.loadedProfile.vendor();
    });
    self.materialInvalid = ko.pureComputed(function () {
        return !self.loadedProfile.material();
    });

    var loadProfile = function loadSelectedProfile() {
        if (self.loadedProfile.id() === undefined) {
            if (!self.loadedProfile.isNew()) {
                // selected 'new profile' in options menu, but no profile created yet
                self.fromProfileData();
            }
        } else {
            // find profile data
            var data = ko.utils.arrayFirst(self.allProfiles(), function (item) {
                return item.id === self.loadedProfile.id();
            });

            if (!data) data = self.cleanProfile();

            // populate data
            self.fromProfileData(data);
        }
    };

    self.loadedProfile.id.subscribe(loadProfile);

    self.fromProfileData = function setLoadedProfileFromJSObject() {
        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.cleanProfile();

        self.loadedProfile.isNew(data.id === undefined);
        self.loadedProfile.id(data.id);
        self.loadedProfile.vendor(data.vendor);
        self.loadedProfile.material(data.material);
        self.loadedProfile.density(data.density);
        self.loadedProfile.diameter(data.diameter);
    };

    self.toProfileData = function getLoadedProfileAsJSObject() {
        var defaultProfile = self.cleanProfile();

        return {
            id: self.loadedProfile.id(),
            vendor: self.loadedProfile.vendor(),
            material: self.loadedProfile.material(),
            density: Utils.validFloat(self.loadedProfile.density(), defaultProfile.density),
            diameter: Utils.validFloat(self.loadedProfile.diameter(), defaultProfile.diameter)
        };
    };

    var dialog = $('#settings_plugin_filamentmanager_profiledialog');

    self.showProfileDialog = function showProfileDialog() {
        self.fromProfileData();
        dialog.modal('show');
    };

    self.requestInProgress = ko.observable(false);

    self.processProfiles = function processRequestedProfiles(data) {
        self.allProfiles(data.profiles);
    };

    self.requestProfiles = function requestAllProfilesFromBackend() {
        var force = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

        self.requestInProgress(true);
        return api.profile.list(force).done(function (response) {
            self.processProfiles(response);
        }).always(function () {
            self.requestInProgress(false);
        });
    };

    self.saveProfile = function saveProfileToBackend() {
        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.toProfileData();

        return self.loadedProfile.isNew() ? self.addProfile(data) : self.updateProfile(data);
    };

    self.addProfile = function addProfileToBackend() {
        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.toProfileData();

        self.requestInProgress(true);
        api.profile.add(data).done(function (response) {
            var id = response.profile.id;

            self.requestProfiles().done(function () {
                self.loadedProfile.id(id);
            });
        }).fail(function () {
            new PNotify({ // eslint-disable-line no-new
                title: gettext('Could not add profile'),
                text: gettext('There was an unexpected error while saving the filament profile, please consult the logs.'),
                type: 'error',
                hide: false
            });
            self.requestInProgress(false);
        });
    };

    self.updateCallbacks = [];

    self.updateProfile = function updateProfileInBackend() {
        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.toProfileData();

        self.requestInProgress(true);
        api.profile.update(data.id, data).done(function () {
            self.requestProfiles();
            self.updateCallbacks.forEach(function (callback) {
                callback();
            });
        }).fail(function () {
            new PNotify({ // eslint-disable-line no-new
                title: gettext('Could not update profile'),
                text: gettext('There was an unexpected error while updating the filament profile, please consult the logs.'),
                type: 'error',
                hide: false
            });
            self.requestInProgress(false);
        });
    };

    self.removeProfile = function removeProfileFromBackend(data) {
        var perform = function performProfileRemoval() {
            api.profile.delete(data.id).done(function () {
                self.requestProfiles();
            }).fail(function () {
                new PNotify({ // eslint-disable-line no-new
                    title: gettext('Could not delete profile'),
                    text: gettext('There was an unexpected error while removing the filament profile, please consult the logs.'),
                    type: 'error',
                    hide: false
                });
                self.requestInProgress(false);
            });
        };

        showConfirmationDialog({
            title: gettext('Delete profile?'),
            message: gettext('You are about to delete the filament profile <strong>' + data.material + ' (' + data.vendor + ')</strong>. Please note that it is not possible to delete profiles with associated spools.'),
            proceed: gettext('Delete'),
            onproceed: perform
        });
    };
};
/* global FilamentManager ko gettext PNotify */

FilamentManager.prototype.viewModels.selections = function selectedSpoolsViewModel() {
    var self = this.viewModels.selections;
    var api = this.core.client;
    var settingsViewModel = this.core.bridge.allViewModels.settingsViewModel;


    self.selectedSpools = ko.observableArray([]);

    // selected spool id for each tool
    self.tools = ko.observableArray([]);
    // set to false if querying selections to prevent triggering the change event again when setting selected spools
    self.enableSpoolUpdate = false;

    self.setArraySize = function setArraySizeToNumberOfTools() {
        var currentProfileData = settingsViewModel.printerProfiles.currentProfileData();
        var numExtruders = currentProfileData ? currentProfileData.extruder.count() : 0;

        if (self.tools().length === numExtruders) return;

        if (self.tools().length < numExtruders) {
            // number of extruders has increased
            for (var i = self.tools().length; i < numExtruders; i += 1) {
                self.selectedSpools().push(undefined);
                self.tools().push(ko.observable(undefined));
            }
        } else {
            // number of extruders has decreased
            for (var _i = numExtruders; _i < self.tools().length; _i += 1) {
                self.tools().pop();
                self.selectedSpools().pop();
            }
        }

        // notify observers
        self.tools.valueHasMutated();
        self.selectedSpools.valueHasMutated();
    };

    self.setSubscriptions = function subscribeToProfileDataObservable() {
        settingsViewModel.printerProfiles.currentProfileData.subscribe(self.setArraySize);
    };

    self.requestInProgress = ko.observable(false);

    self.setSelectedSpools = function setSelectedSpoolsReceivedFromBackend(data) {
        self.enableSpoolUpdate = false;
        data.selections.forEach(function (selection) {
            self.updateSelectedSpoolData(selection);
        });
        self.enableSpoolUpdate = true;
    };

    self.requestSelectedSpools = function requestSelectedSpoolsFromBackend() {
        self.requestInProgress(true);
        return api.selection.list().done(function (data) {
            self.setSelectedSpools(data);
        }).always(function () {
            self.requestInProgress(false);
        });
    };

    self.updateSelectedSpool = function updateSelectedSpoolInBackend(tool) {
        var id = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

        if (!self.enableSpoolUpdate) return;

        var data = { tool: tool, spool: { id: id } };

        self.requestInProgress(true);
        api.selection.update(tool, data).done(function (response) {
            self.updateSelectedSpoolData(response.selection);
        }).fail(function () {
            new PNotify({ // eslint-disable-line no-new
                title: gettext('Could not select spool'),
                text: gettext('There was an unexpected error while selecting the spool, please consult the logs.'),
                type: 'error',
                hide: false
            });
        }).always(function () {
            self.requestInProgress(false);
        });
    };

    self.updateSelectedSpoolData = function updateSelectedSpoolData(data) {
        if (data.tool < self.tools().length) {
            self.tools()[data.tool](data.spool !== null ? data.spool.id : undefined);
            self.selectedSpools()[data.tool] = data.spool !== null ? data.spool : undefined;
            self.selectedSpools.valueHasMutated(); // notifies observers
        }
    };

    var m600Dialog = $('#plugin_filamentmanager_m600dialog');

    self.showM600Dialog = function () {
        m600Dialog.modal('show');
    };

    self.hideM600Dialog = function () {
        m600Dialog.modal('hide');
    };
};
/* global FilamentManager ItemListHelper ko Utils $ PNotify gettext showConfirmationDialog */

FilamentManager.prototype.viewModels.spools = function spoolsViewModel() {
    var self = this.viewModels.spools;
    var api = this.core.client;

    var profilesViewModel = this.viewModels.profiles;

    self.allSpools = new ItemListHelper('filamentSpools', {
        name: function name(a, b) {
            // sorts ascending
            if (a.name.toLocaleLowerCase() < b.name.toLocaleLowerCase()) return -1;
            if (a.name.toLocaleLowerCase() > b.name.toLocaleLowerCase()) return 1;
            return 0;
        },
        material: function material(a, b) {
            // sorts ascending
            if (a.profile.material.toLocaleLowerCase() < b.profile.material.toLocaleLowerCase()) return -1;
            if (a.profile.material.toLocaleLowerCase() > b.profile.material.toLocaleLowerCase()) return 1;
            return 0;
        },
        vendor: function vendor(a, b) {
            // sorts ascending
            if (a.profile.vendor.toLocaleLowerCase() < b.profile.vendor.toLocaleLowerCase()) return -1;
            if (a.profile.vendor.toLocaleLowerCase() > b.profile.vendor.toLocaleLowerCase()) return 1;
            return 0;
        },
        remaining: function remaining(a, b) {
            // sorts descending
            var ra = parseFloat(a.weight) - parseFloat(a.used);
            var rb = parseFloat(b.weight) - parseFloat(b.used);
            if (ra > rb) return -1;
            if (ra < rb) return 1;
            return 0;
        }
    }, {}, 'name', [], [], 10);

    self.pageSize = ko.pureComputed({
        read: function read() {
            return self.allSpools.pageSize();
        },
        write: function write(value) {
            self.allSpools.pageSize(Utils.validInt(value, self.allSpools.pageSize()));
        }
    });

    self.cleanSpool = function getDefaultValuesForNewSpool() {
        return {
            id: undefined,
            name: '',
            cost: 20,
            weight: 1000,
            used: 0,
            temp_offset: 0,
            profile: {
                id: profilesViewModel.allProfiles().length > 0 ? profilesViewModel.allProfiles()[0].id : undefined
            }
        };
    };

    self.loadedSpool = {
        id: ko.observable(),
        name: ko.observable(),
        profile: ko.observable(),
        cost: ko.observable(),
        totalWeight: ko.observable(),
        remaining: ko.observable(),
        temp_offset: ko.observable(),
        isNew: ko.observable(true)
    };

    self.nameInvalid = ko.pureComputed(function () {
        return !self.loadedSpool.name();
    });

    self.fromSpoolData = function setLoadedSpoolsFromJSObject() {
        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.cleanSpool();

        self.loadedSpool.isNew(data.id === undefined);
        self.loadedSpool.id(data.id);
        self.loadedSpool.name(data.name);
        self.loadedSpool.profile(data.profile.id);
        self.loadedSpool.totalWeight(data.weight);
        self.loadedSpool.cost(data.cost);
        self.loadedSpool.remaining(data.weight - data.used);
        self.loadedSpool.temp_offset(data.temp_offset);
    };

    self.toSpoolData = function getLoadedProfileAsJSObject() {
        var defaultSpool = self.cleanSpool();
        var totalWeight = Utils.validFloat(self.loadedSpool.totalWeight(), defaultSpool.weight);
        var remaining = Math.min(Utils.validFloat(self.loadedSpool.remaining(), defaultSpool.weight), totalWeight);

        return {
            id: self.loadedSpool.id(),
            name: self.loadedSpool.name(),
            cost: Utils.validFloat(self.loadedSpool.cost(), defaultSpool.cost),
            weight: totalWeight,
            used: totalWeight - remaining,
            temp_offset: self.loadedSpool.temp_offset(),
            profile: {
                id: self.loadedSpool.profile()
            }
        };
    };

    var dialog = $('#settings_plugin_filamentmanager_spooldialog');

    self.showSpoolDialog = function showSpoolDialog(data) {
        self.fromSpoolData(data);
        dialog.modal('show');
    };

    self.hideSpoolDialog = function hideSpoolDialog() {
        dialog.modal('hide');
    };

    self.requestInProgress = ko.observable(false);

    self.processSpools = function processRequestedSpools(data) {
        self.allSpools.updateItems(data.spools);
    };

    self.requestSpools = function requestAllSpoolsFromBackend(force) {
        self.requestInProgress(true);
        return api.spool.list(force).done(function (response) {
            self.processSpools(response);
        }).always(function () {
            self.requestInProgress(false);
        });
    };

    self.saveSpool = function saveSpoolToBackend() {
        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.toSpoolData();

        return self.loadedSpool.isNew() ? self.addSpool(data) : self.updateSpool(data);
    };

    self.addSpool = function addSpoolToBackend() {
        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.toSpoolData();

        self.requestInProgress(true);
        api.spool.add(data).done(function () {
            self.hideSpoolDialog();
            self.requestSpools();
        }).fail(function () {
            new PNotify({ // eslint-disable-line no-new
                title: gettext('Could not add spool'),
                text: gettext('There was an unexpected error while saving the filament spool, please consult the logs.'),
                type: 'error',
                hide: false
            });
            self.requestInProgress(false);
        });
    };

    self.updateCallbacks = [];

    self.updateSpool = function updateSpoolInBackend() {
        var data = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : self.toSpoolData();

        self.requestInProgress(true);
        api.spool.update(data.id, data).done(function () {
            self.hideSpoolDialog();
            self.requestSpools();
            self.updateCallbacks.forEach(function (callback) {
                callback();
            });
        }).fail(function () {
            new PNotify({ // eslint-disable-line no-new
                title: gettext('Could not update spool'),
                text: gettext('There was an unexpected error while updating the filament spool, please consult the logs.'),
                type: 'error',
                hide: false
            });
            self.requestInProgress(false);
        });
    };

    self.removeSpool = function removeSpoolFromBackend(data) {
        var perform = function performSpoolRemoval() {
            self.requestInProgress(true);
            api.spool.delete(data.id).done(function () {
                self.requestSpools();
            }).fail(function () {
                new PNotify({ // eslint-disable-line no-new
                    title: gettext('Could not delete spool'),
                    text: gettext('There was an unexpected error while removing the filament spool, please consult the logs.'),
                    type: 'error',
                    hide: false
                });
                self.requestInProgress(false);
            });
        };

        showConfirmationDialog({
            title: gettext('Delete spool?'),
            message: gettext('You are about to delete the filament spool <strong>' + data.name + ' - ' + data.profile.material + ' (' + data.profile.vendor + ')</strong>.'),
            proceed: gettext('Delete'),
            onproceed: perform
        });
    };

    self.duplicateSpool = function duplicateAndAddSpoolToBackend(data) {
        var newData = data;
        newData.used = 0;
        self.addSpool(newData);
    };
};
/* global FilamentManager ko Node $ gettext PNotify Utils */

FilamentManager.prototype.viewModels.warning = function insufficientFilamentWarningViewModel() {
    var self = this.viewModels.warning;
    var _core$bridge$allViewM = this.core.bridge.allViewModels,
        printerStateViewModel = _core$bridge$allViewM.printerStateViewModel,
        settingsViewModel = _core$bridge$allViewM.settingsViewModel;
    var selections = this.viewModels.selections;


    printerStateViewModel.filamentWithWeight = ko.observableArray([]);

    printerStateViewModel.formatFilamentWithWeight = function formatFilamentWithWeightInSidebar(filament) {
        if (!filament || !filament.length) return '-';

        var result = (filament.length / 1000).toFixed(2) + 'm';

        if (Object.prototype.hasOwnProperty.call(filament, 'weight') && filament.weight) {
            result += ' / ' + filament.weight.toFixed(2) + 'g';
        }

        return result;
    };

    self.replaceFilamentView = function replaceFilamentViewInSidebar() {
        $('#state').find('.accordion-inner').contents().each(function (index, item) {
            if (item.nodeType === Node.COMMENT_NODE) {
                if (item.nodeValue === ' ko foreach: filament ') {
                    item.nodeValue = ' ko foreach: [] '; // eslint-disable-line no-param-reassign
                    var element = '<!-- ko foreach: filamentWithWeight --> <span data-bind="text: \'Filament (\' + name() + \'): \', title: \'Filament usage for \' + name()"></span><strong data-bind="text: $root.formatFilamentWithWeight(data())"></strong><br> <!-- /ko -->';
                    $(element).insertBefore(item);
                    return false; // exit loop
                }
            }
            return true;
        });
    };

    var filename = void 0;
    var waitForFilamentData = false;

    var warning = null;

    var updateFilament = function updateFilamentWeightAndCheckRemainingFilament() {
        var calculateWeight = function calculateFilamentWeight(length, diameter, density) {
            var radius = diameter / 2;
            var volume = length * Math.PI * radius * radius / 1000;
            return volume * density;
        };

        var showWarning = function showWarningIfRequiredFilamentExceedsRemaining(required, remaining) {
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
                hide: false
            });

            return true;
        };

        var filament = printerStateViewModel.filament();
        var spoolData = selections.selectedSpools();

        var warningIsShown = false; // used to prevent a separate warning message for each tool

        for (var i = 0; i < filament.length; i += 1) {
            var toolID = Utils.extractToolIDFromName(filament[i].name());

            if (!spoolData[toolID]) {
                filament[i].data().weight = 0;
            } else {
                var _filament$i$data = filament[i].data(),
                    length = _filament$i$data.length;

                var _spoolData$toolID$pro = spoolData[toolID].profile,
                    diameter = _spoolData$toolID$pro.diameter,
                    density = _spoolData$toolID$pro.density;


                var requiredFilament = calculateWeight(length, diameter, density);
                var remainingFilament = spoolData[toolID].weight - spoolData[toolID].used;

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

        printerStateViewModel.filament.subscribe(function () {
            // OctoPrint constantly updates the filament observable, to prevent invocing the warning message
            // on every update we only call the updateFilament() method if the selected file has changed
            if (filename !== printerStateViewModel.filename()) {
                // if new file selected but no filament data found (probably because it's still in analysis queue)
                // we set the wait flag to update the view again, when the data arives
                waitForFilamentData = printerStateViewModel.filename() != null && printerStateViewModel.filament().length < 1;
                filename = printerStateViewModel.filename();
                updateFilament();
            } else if (waitForFilamentData && printerStateViewModel.filament().length > 0) {
                waitForFilamentData = false;
                updateFilament();
            }
        });
    };
};
/* global FilamentManager OCTOPRINT_VIEWMODELS */

(function registerViewModel() {
    var Plugin = new FilamentManager();

    OCTOPRINT_VIEWMODELS.push({
        construct: Plugin.viewModel,
        dependencies: Plugin.REQUIRED_VIEWMODELS,
        elements: Plugin.BINDINGS
    });
})();