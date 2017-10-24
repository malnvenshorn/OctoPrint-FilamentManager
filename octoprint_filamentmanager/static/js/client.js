(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["OctoPrintClient", "jquery"], factory);
    } else {
        factory(global.OctoPrintClient, global.$);
    }
})(this, function(OctoPrintClient, $) {
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

    OctoPrintFilamentManagerClient.prototype.profileList = function (opts) {
        return this.base.get(profileUrl(), opts);
    };

    OctoPrintFilamentManagerClient.prototype.profileGet = function (id, opts) {
        return this.base.get(profileUrl(id), opts);
    };

    OctoPrintFilamentManagerClient.prototype.profileAdd = function (profile, opts) {
        profile = profile || {};
        var data = {profile: profile};
        return this.base.postJson(profileUrl(), data, opts);
    };

    OctoPrintFilamentManagerClient.prototype.profileUpdate = function (id, profile, opts) {
        profile = profile || {};
        var data = {profile: profile};
        return this.base.patchJson(profileUrl(id), data, opts);
    };

    OctoPrintFilamentManagerClient.prototype.profileDelete = function (id, opts) {
        return this.base.delete(profileUrl(id), opts);
    };

    OctoPrintFilamentManagerClient.prototype.spoolList = function (opts) {
        return this.base.get(spoolUrl(), opts);
    };

    OctoPrintFilamentManagerClient.prototype.spoolGet = function (id, opts) {
        return this.base.get(spoolUrl(id), opts);
    };

    OctoPrintFilamentManagerClient.prototype.spoolAdd = function (spool, opts) {
        spool = spool || {};
        var data = {spool: spool};
        return this.base.postJson(spoolUrl(), data, opts);
    };

    OctoPrintFilamentManagerClient.prototype.spoolUpdate = function (id, spool, opts) {
        spool = spool || {};
        var data = {spool: spool};
        return this.base.patchJson(spoolUrl(id), data, opts);
    };

    OctoPrintFilamentManagerClient.prototype.spoolDelete = function (id, opts) {
        return this.base.delete(spoolUrl(id), opts);
    };

    OctoPrintFilamentManagerClient.prototype.selectionList = function (opts) {
        return this.base.get(selectionUrl(), opts);
    };

    OctoPrintFilamentManagerClient.prototype.selectionUpdate = function (id, selection, opts) {
        selection = selection || {};
        var data = {selection: selection};
        return this.base.patchJson(selectionUrl(id), data, opts);
    };

    OctoPrintClient.registerPluginComponent("filamentmanager", OctoPrintFilamentManagerClient);
    return OctoPrintFilamentManagerClient;
});
