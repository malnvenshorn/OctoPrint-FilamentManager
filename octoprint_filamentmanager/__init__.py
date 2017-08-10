# coding=utf-8
from __future__ import absolute_import

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

import octoprint.plugin
import sqlite3
import os
from flask import jsonify, request, make_response
from werkzeug.exceptions import BadRequest
from .manager import FilamentManager


class FilamentManagerPlugin(octoprint.plugin.StartupPlugin,
                            octoprint.plugin.SettingsPlugin,
                            octoprint.plugin.AssetPlugin,
                            octoprint.plugin.TemplatePlugin,
                            octoprint.plugin.BlueprintPlugin):

    def __init__(self):
        self._db = None
        self._profiles = None
        self._spools = None
        self.filamentManager = None

    # StartupPlugin

    def on_after_startup(self):
        self._db_path = os.path.join(self.get_plugin_data_folder(), "filament.db")
        self.filamentManager = FilamentManager(self._db_path, self._logger)
        self.filamentManager.init_database()

    # SettingsPlugin

    def get_settings_defaults(self):
        return dict(
            selectedFilament=dict()
        )

    # AssetPlugin

    def get_assets(self):
        return dict(
            js=["js/filamentmanager.js"]
        )

    # TemplatePlugin

    def get_template_configs(self):
        return [
            dict(type="settings", template="filamentmanager_settings.jinja2"),
            dict(type="generic", template="filamentmanager_profiledialog.jinja2"),
            dict(type="generic", template="filamentmanager_spooldialog.jinja2")
        ]

    # BlueprintPlugin

    @octoprint.plugin.BlueprintPlugin.route("/profiles", methods=["GET"])
    def get_profiles_list(self):
        profiles = self.filamentManager.get_all_profiles()

        if profiles is not None:
            return jsonify(profiles=profiles)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles", methods=["POST"])
    def create_profile(self):
        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON data in request", 400)

        success = self.filamentManager.create_profile(json_data)

        if success:
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<string:identifier>", methods=["PATCH"])
    def update_profile(self, identifier):
        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON data in request", 400)

        success = self.filamentManager.update_profile(identifier, json_data)

        if success:
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<string:identifier>", methods=["DELETE"])
    def delete_profile(self, identifier):
        success = self.filamentManager.delete_profile(identifier)

        if success:
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools", methods=["GET"])
    def get_spools_list(self):
        spools = self.filamentManager.get_all_spools()

        if spools is not None:
            return jsonify(spools=spools)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools", methods=["POST"])
    def create_spool(self):
        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON data in request", 400)

        success = self.filamentManager.create_spool(json_data)

        if success:
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<string:identifier>", methods=["PATCH"])
    def update_spool(self, identifier):
        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON data in request", 400)

        success = self.filamentManager.update_spool(identifier, json_data)

        if success:
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<string:identifier>", methods=["DELETE"])
    def delete_spool(self, identifier):
        success = self.filamentManager.delete_spool(identifier)

        if success:
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    # Softwareupdate hook

    def get_update_information(self):
        return dict(
            filamentmanager=dict(
                displayName="FilamentManager",
                displayVersion=self._plugin_version,

                # version check: github repository
                type="github_release",
                user="malnvenshorn",
                repo="OctoPrint-FilamentManager",
                current=self._plugin_version,

                # update method: pip
                pip="https://github.com/malnvenshorn/OctoPrint-FilamentManager/archive/{target_version}.zip"
            )
        )

    def _send_client_message(self, message_type, data=None):
        self._plugin_manager.send_plugin_message(self._identifier, dict(type=message_type, data=data))


__plugin_name__ = "FilamentManager"


def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FilamentManagerPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information
    }
