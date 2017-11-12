(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["OctoPrintClient", "jquery"], factory);
    } else {
        factory(global.OctoPrintClient, global.$);
    }
})(this, function(OctoPrintClient, $) {
    "use strict";

    var pluginUrl = "plugin/filamentmanager";

    var profileUrl = function(profile) {
        var url = pluginUrl + "/profiles";
        return (profile === undefined) ? url : url + "/" + profile;
    };

    var spoolUrl = function(spool) {
        var url = pluginUrl + "/spools";
        return (spool === undefined) ? url : url + "/" + spool;
    };

    var selectionUrl = function(selection) {
        var url = pluginUrl + "/selections";
        return (selection === undefined) ? url : url + "/" + selection;
    }

    var OctoPrintFilamentManagerClient = function(base) {
        this.base = base;
    };

    OctoPrintFilamentManagerClient.prototype.listProfiles = function (force, opts) {
        force = force || false;
        var query = {};
        if (force) {
            query.force = force || false;
        }
        return this.base.getWithQuery(profileUrl(), query, opts);
    };

    OctoPrintFilamentManagerClient.prototype.getProfile = function (id, opts) {
        return this.base.get(profileUrl(id), opts);
    };

    OctoPrintFilamentManagerClient.prototype.addProfile = function (profile, opts) {
        profile = profile || {};
        var data = {profile: profile};
        return this.base.postJson(profileUrl(), data, opts);
    };

    OctoPrintFilamentManagerClient.prototype.updateProfile = function (id, profile, opts) {
        profile = profile || {};
        var data = {profile: profile};
        return this.base.patchJson(profileUrl(id), data, opts);
    };

    OctoPrintFilamentManagerClient.prototype.deleteProfile = function (id, opts) {
        return this.base.delete(profileUrl(id), opts);
    };

    OctoPrintFilamentManagerClient.prototype.listSpools = function (force, opts) {
        force = force || false;
        var query = {};
        if (force) {
            query.force = force || false;
        }
        return this.base.getWithQuery(spoolUrl(), query, opts);
    };

    OctoPrintFilamentManagerClient.prototype.getSpool = function (id, opts) {
        return this.base.get(spoolUrl(id), opts);
    };

    OctoPrintFilamentManagerClient.prototype.addSpool = function (spool, opts) {
        spool = spool || {};
        var data = {spool: spool};
        return this.base.postJson(spoolUrl(), data, opts);
    };

    OctoPrintFilamentManagerClient.prototype.updateSpool = function (id, spool, opts) {
        spool = spool || {};
        var data = {spool: spool};
        return this.base.patchJson(spoolUrl(id), data, opts);
    };

    OctoPrintFilamentManagerClient.prototype.deleteSpool = function (id, opts) {
        return this.base.delete(spoolUrl(id), opts);
    };

    OctoPrintFilamentManagerClient.prototype.listSelections = function (opts) {
        return this.base.get(selectionUrl(), opts);
    };

    OctoPrintFilamentManagerClient.prototype.updateSelection = function (id, selection, opts) {
        selection = selection || {};
        var data = {selection: selection};
        return this.base.patchJson(selectionUrl(id), data, opts);
    };

    OctoPrintClient.registerPluginComponent("filamentmanager", OctoPrintFilamentManagerClient);
    return OctoPrintFilamentManagerClient;
});
