(function (global, factory) {
    if (typeof define === "function" && define.amd) {
        define(["OctoPrintClient", "jquery"], factory);
    } else {
        factory(global.OctoPrintClient, global.$);
    }
})(this, function(OctoPrintClient, $) {
    var url = "plugin/filamentmanager/spools";

    var spoolUrl = function(spool) {
        return url + "/" + spool;
    };

    var OctoPrintFilamentSpoolClient = function(base) {
        this.base = base;
    };

    OctoPrintFilamentSpoolClient.prototype.list = function (opts) {
        return this.base.get(url, opts);
    };

    OctoPrintFilamentSpoolClient.prototype.get = function (id, opts) {
        return this.base.get(spoolUrl(id), opts);
    };

    OctoPrintFilamentSpoolClient.prototype.add = function (spool, opts) {
        spool = spool || {};
        var data = {spool: spool};
        return this.base.postJson(url, data, opts);
    };

    OctoPrintFilamentSpoolClient.prototype.update = function (id, spool, opts) {
        spool = spool || {};
        var data = {spool: spool};
        return this.base.patchJson(spoolUrl(id), data, opts);
    };

    OctoPrintFilamentSpoolClient.prototype.delete = function (id, opts) {
        return this.base.delete(spoolUrl(id), opts);
    };

    OctoPrintClient.registerComponent("filamentspools", OctoPrintFilamentSpoolClient);
    return OctoPrintFilamentSpoolClient;
});
