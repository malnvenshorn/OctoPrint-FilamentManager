/* global FilamentManager ko gettext showConfirmationDialog PNotify $ Utils */

FilamentManager.prototype.viewModels.profiles = function profilesViewModel() {
    const self = this.viewModels.profiles;
    const api = this.core.client;

    self.allProfiles = ko.observableArray([]);

    self.cleanProfile = function getDefaultValuesForNewProfile() {
        return {
            id: undefined,
            material: '',
            vendor: '',
            density: 1.25,
            diameter: 1.75,
        };
    };

    self.loadedProfile = {
        id: ko.observable(),
        vendor: ko.observable(),
        material: ko.observable(),
        density: ko.observable(),
        diameter: ko.observable(),
        isNew: ko.observable(true),
    };

    self.vendorInvalid = ko.pureComputed(() => !self.loadedProfile.vendor());
    self.materialInvalid = ko.pureComputed(() => !self.loadedProfile.material());

    const loadProfile = function loadSelectedProfile() {
        if (self.loadedProfile.id() === undefined) {
            if (!self.loadedProfile.isNew()) {
                // selected 'new profile' in options menu, but no profile created yet
                self.fromProfileData();
            }
        } else {
            // find profile data
            let data = ko.utils.arrayFirst(self.allProfiles(), item => item.id === self.loadedProfile.id());

            if (!data) data = self.cleanProfile();

            // populate data
            self.fromProfileData(data);
        }
    };

    self.loadedProfile.id.subscribe(loadProfile);

    self.fromProfileData = function setLoadedProfileFromJSObject(data = self.cleanProfile()) {
        self.loadedProfile.isNew(data.id === undefined);
        self.loadedProfile.id(data.id);
        self.loadedProfile.vendor(data.vendor);
        self.loadedProfile.material(data.material);
        self.loadedProfile.density(data.density);
        self.loadedProfile.diameter(data.diameter);
    };

    self.toProfileData = function getLoadedProfileAsJSObject() {
        const defaultProfile = self.cleanProfile();

        return {
            id: self.loadedProfile.id(),
            vendor: self.loadedProfile.vendor(),
            material: self.loadedProfile.material(),
            density: Utils.validFloat(self.loadedProfile.density(), defaultProfile.density),
            diameter: Utils.validFloat(self.loadedProfile.diameter(), defaultProfile.diameter),
        };
    };

    const dialog = $('#settings_plugin_filamentmanager_profiledialog');

    self.showProfileDialog = function showProfileDialog() {
        self.fromProfileData();
        dialog.modal('show');
    };

    self.requestInProgress = ko.observable(false);

    self.processProfiles = function processRequestedProfiles(data) {
        self.allProfiles(data.profiles);
    };

    self.requestProfiles = function requestAllProfilesFromBackend(force = false) {
        self.requestInProgress(true);
        return api.profile.list(force)
            .done((response) => { self.processProfiles(response); })
            .always(() => { self.requestInProgress(false); });
    };

    self.saveProfile = function saveProfileToBackend(data = self.toProfileData()) {
        return self.loadedProfile.isNew() ? self.addProfile(data) : self.updateProfile(data);
    };

    self.addProfile = function addProfileToBackend(data = self.toProfileData()) {
        self.requestInProgress(true);
        api.profile.add(data)
            .done((response) => {
                const { id } = response.profile;
                self.requestProfiles().done(() => { self.loadedProfile.id(id); });
            })
            .fail(() => {
                new PNotify({ // eslint-disable-line no-new
                    title: gettext('Could not add profile'),
                    text: gettext('There was an unexpected error while saving the filament profile, please consult the logs.'),
                    type: 'error',
                    hide: false,
                });
                self.requestInProgress(false);
            });
    };

    self.updateCallbacks = [];

    self.updateProfile = function updateProfileInBackend(data = self.toProfileData()) {
        self.requestInProgress(true);
        api.profile.update(data.id, data)
            .done(() => {
                self.requestProfiles();
                self.updateCallbacks.forEach((callback) => { callback(); });
            })
            .fail(() => {
                new PNotify({ // eslint-disable-line no-new
                    title: gettext('Could not update profile'),
                    text: gettext('There was an unexpected error while updating the filament profile, please consult the logs.'),
                    type: 'error',
                    hide: false,
                });
                self.requestInProgress(false);
            });
    };

    self.removeProfile = function removeProfileFromBackend(data) {
        const perform = function performProfileRemoval() {
            api.profile.delete(data.id)
                .done(() => {
                    self.requestProfiles();
                })
                .fail(() => {
                    new PNotify({ // eslint-disable-line no-new
                        title: gettext('Could not delete profile'),
                        text: gettext('There was an unexpected error while removing the filament profile, please consult the logs.'),
                        type: 'error',
                        hide: false,
                    });
                    self.requestInProgress(false);
                });
        };

        showConfirmationDialog({
            title: gettext('Delete profile?'),
            message: gettext(`You are about to delete the filament profile <strong>${data.material} (${data.vendor})</strong>. Please note that it is not possible to delete profiles with associated spools.`),
            proceed: gettext('Delete'),
            onproceed: perform,
        });
    };
};
