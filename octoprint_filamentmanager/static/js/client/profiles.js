(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["OctoPrintClient", "jquery"], factory);
    } else {
        factory(global.OctoPrintClient, global.$);
    }
})(this, function(OctoPrintClient, $) {
    var url = "plugin/filamentmanager/profiles";

    var profileUrl = function(profile) {
        return url + "/" + profile;
    };

    var OctoPrintFilamentProfileClient = function(base) {
        this.base = base;
    };

    OctoPrintFilamentProfileClient.prototype.list = function (opts) {
        return this.base.get(url, opts);
    };

    OctoPrintFilamentProfileClient.prototype.get = function (id, opts) {
        return this.base.get(profileUrl(id), opts);
    };

    OctoPrintFilamentProfileClient.prototype.add = function (profile, opts) {
        profile = profile || {};
        var data = {profile: profile};
        return this.base.postJson(url, data, opts);
    };

    OctoPrintFilamentProfileClient.prototype.update = function (id, profile, opts) {
        profile = profile || {};
        var data = {profile: profile};
        return this.base.patchJson(profileUrl(id), data, opts);
    };

    OctoPrintFilamentProfileClient.prototype.delete = function (id, opts) {
        return this.base.delete(profileUrl(id), opts);
    };

    OctoPrintClient.registerComponent("filamentprofiles", OctoPrintFilamentProfileClient);
    return OctoPrintFilamentProfileClient;
});
