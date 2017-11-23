/* global FilamentManager OCTOPRINT_VIEWMODELS */

(function registerViewModel() {
    const Plugin = new FilamentManager();

    OCTOPRINT_VIEWMODELS.push({
        construct: Plugin.viewModel,
        dependencies: Plugin.REQUIRED_VIEWMODELS,
        elements: Plugin.BINDINGS,
    });
}());
