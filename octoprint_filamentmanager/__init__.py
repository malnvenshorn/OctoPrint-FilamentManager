# coding=utf-8
from __future__ import absolute_import

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

import octoprint.plugin
import os
from flask import jsonify, request, make_response
from werkzeug.exceptions import BadRequest
from .manager import FilamentManager
from octoprint.events import Events
import re
import math
from .odometer import FilamentOdometer


class FilamentManagerPlugin(octoprint.plugin.StartupPlugin,
                            octoprint.plugin.SettingsPlugin,
                            octoprint.plugin.AssetPlugin,
                            octoprint.plugin.TemplatePlugin,
                            octoprint.plugin.BlueprintPlugin,
                            octoprint.plugin.EventHandlerPlugin):

    def __init__(self):
        self._profiles = None
        self._spools = None
        self.filamentManager = None
        self.filamentOdometer = FilamentOdometer()
        self.odometerEnabled = False

    # StartupPlugin

    def on_after_startup(self):
        self._db_path = os.path.join(self.get_plugin_data_folder(), "filament.db")
        self.filamentManager = FilamentManager(self._db_path, self._logger)
        self.filamentManager.init_database()

    # SettingsPlugin

    def get_settings_defaults(self):
        return dict(
            selectedSpools=dict(),
            enableTracking=True,
            enableWarning=True
        )

    # AssetPlugin

    def get_assets(self):
        return dict(
            css=["css/filamentmanager.css"],
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
        if self._profiles is None:
            self._profiles = self.filamentManager.get_all_profiles()

        profiles = self._profiles

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
            self._profiles = None
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
            self._profiles = None
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<string:identifier>", methods=["DELETE"])
    def delete_profile(self, identifier):
        success = self.filamentManager.delete_profile(identifier)

        if success:
            self._profiles = None
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools", methods=["GET"])
    def get_spools_list(self):
        if self._spools is None:
            self._spools = self.filamentManager.get_all_spools()

        spools = self._spools

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
            self._spools = None
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
            self._spools = None
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<string:identifier>", methods=["DELETE"])
    def delete_spool(self, identifier):
        success = self.filamentManager.delete_spool(identifier)

        if success:
            self._spools = None
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    def _get_first_item(self, lst, identifier):
        for item in lst:
            if item['id'] == identifier:
                return item
        else:
            return None

    # def _send_client_message(self, message_type, data=None):
    #     self._plugin_manager.send_plugin_message(self._identifier, dict(type=message_type, data=data))

    # EventHandlerPlugin

    def on_event(self, event, payload):
        if event == Events.PRINT_STARTED:
            self.odometerEnabled = self._settings.get(["enableTracking"])
            self.filamentOdometer.reset()
        elif event in [Events.PRINT_DONE, Events.PRINT_FAILED]:
            if self.odometerEnabled:
                self._update_filament_usage()
            self.odometerEnabled = False
        elif event == Events.PRINT_PAUSED:
            if self.odometerEnabled:
                # take into account a possible filament change
                self._update_filament_usage()
                self.filamentOdometer.reset_extruded_length()
            self.odometerEnabled = False
        elif event == Events.PRINT_RESUMED:
            self.odometerEnabled = self._settings.get(["enableTracking"])

    def _update_filament_usage(self):
        printer_profile = self._printer_profile_manager.get_current_or_default()
        extrusion = self.filamentOdometer.get_values()
        numTools = min(printer_profile['extruder']['count'], len(extrusion))

        for i in range(0, numTools):
            tool = self._settings.get(["selectedSpools", "tool" + str(i)])
            if tool is not None:
                if self._spools is None:
                    self._spools = self.filamentManager.get_all_spools()
                spool = self._get_first_item(self._spools, tool)
                if spool is not None:
                    if self._profiles is None:
                        self._profiles = self.filamentManager.get_all_profiles()
                    profile = self._get_first_item(self._profiles, spool['profile_id'])
                    if profile is not None:
                        # update spool
                        volume = self._calculate_volume(profile['diameter'], extrusion[i])
                        spool['used'] += volume * profile['density']
                        self.filamentManager.update_spool(spool['id'], spool)
                        self._logger.info("Filament used: " + str(extrusion[i]) + " mm (tool" + str(i) + ")")

        self._spools = None  # force refresh

    def _calculate_volume(self, diameter, length):
        radius = (diameter / 2) / 10  # cm
        length = length / 10          # cm
        return length * math.pi * radius * radius  # cm³

    # Protocol hook

    def filament_odometer(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        if self.odometerEnabled and gcode is not None:
            self.filamentOdometer.parse(gcode, cmd)

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


__plugin_name__ = "FilamentManager"


def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FilamentManagerPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information,
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.filament_odometer
    }
