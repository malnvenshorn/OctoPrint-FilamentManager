/*
 * View model for OctoPrint-FilamentManager
 *
 * Author: Sven Lohrmann <malnvenshorn@gmail.com>
 * License: AGPLv3
 */

const FilamentManager = function FilamentManager() {
    this.core.client.call(this);
    return this.core.bridge.call(this);
};

FilamentManager.prototype = {
    constructor: FilamentManager,
    core: {},
    viewModels: {},
    selectedSpools: undefined,
};
