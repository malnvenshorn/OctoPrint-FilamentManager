(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["OctoPrintClient", "jquery"], factory);
    } else {
        factory(global.OctoPrintClient, global.$);
    }
})(this, function(OctoPrintClient, $) {
    var url = "plugin/filamentmanager/selections";

    var selectionUrl = function(selection) {
        return url + "/" + selection;
    };

    var OctoPrintFilamentSelectionClient = function(base) {
        this.base = base;
    };

    OctoPrintFilamentSelectionClient.prototype.list = function (opts) {
        return this.base.get(url, opts);
    };

    OctoPrintFilamentSelectionClient.prototype.update = function (id, selection, opts) {
        selection = selection || {};
        var data = {selection: selection};
        return this.base.patchJson(selectionUrl(id), data, opts);
    };

    OctoPrintClient.registerComponent("filamentselections", OctoPrintFilamentSelectionClient);
    return OctoPrintFilamentSelectionClient;
});
