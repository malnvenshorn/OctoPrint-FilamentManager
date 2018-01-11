/* global FilamentManager OctoPrint */

FilamentManager.prototype.core.client = function apiClient() {
    const self = this.core.client;

    const pluginUrl = 'plugin/filamentmanager';

    const profileUrl = function apiProfileNamespace(profile) {
        const url = `${pluginUrl}/profiles`;
        return (profile === undefined) ? url : `${url}/${profile}`;
    };

    const spoolUrl = function apiSpoolNamespace(spool) {
        const url = `${pluginUrl}/spools`;
        return (spool === undefined) ? url : `${url}/${spool}`;
    };

    const selectionUrl = function apiSelectionNamespace(selection) {
        const url = `${pluginUrl}/selections`;
        return (selection === undefined) ? url : `${url}/${selection}`;
    };

    self.profile = {
        list(force = false, opts) {
            const query = force ? { force } : {};
            return OctoPrint.getWithQuery(profileUrl(), query, opts);
        },

        get(id, opts) {
            return OctoPrint.get(profileUrl(id), opts);
        },

        add(profile, opts) {
            const data = { profile };
            return OctoPrint.postJson(profileUrl(), data, opts);
        },

        update(id, profile, opts) {
            const data = { profile };
            return OctoPrint.patchJson(profileUrl(id), data, opts);
        },

        delete(id, opts) {
            return OctoPrint.delete(profileUrl(id), opts);
        },
    };

    self.spool = {
        list(force = false, opts) {
            const query = force ? { force } : {};
            return OctoPrint.getWithQuery(spoolUrl(), query, opts);
        },

        get(id, opts) {
            return OctoPrint.get(spoolUrl(id), opts);
        },

        add(spool, opts) {
            const data = { spool };
            return OctoPrint.postJson(spoolUrl(), data, opts);
        },

        update(id, spool, opts) {
            const data = { spool };
            return OctoPrint.patchJson(spoolUrl(id), data, opts);
        },

        delete(id, opts) {
            return OctoPrint.delete(spoolUrl(id), opts);
        },
    };

    self.selection = {
        list(opts) {
            return OctoPrint.get(selectionUrl(), opts);
        },

        update(id, selection, opts) {
            const data = { selection };
            return OctoPrint.patchJson(selectionUrl(id), data, opts);
        },
    };

    self.database = {
        test(config, opts) {
            const url = `${pluginUrl}/database/test`;
            const data = { config };
            return OctoPrint.postJson(url, data, opts);
        },
    };
};
