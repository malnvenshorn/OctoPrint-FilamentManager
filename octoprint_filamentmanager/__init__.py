# coding=utf-8
from __future__ import absolute_import

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

import math
import os
import hashlib
from flask import jsonify, request, make_response
from werkzeug.exceptions import BadRequest
from werkzeug.http import http_date
import octoprint.plugin
from octoprint.events import Events
from octoprint.server.util.flask import check_lastmodified, check_etag
from octoprint.util import dict_merge
from .manager import FilamentManager
from .odometer import FilamentOdometer


class FilamentManagerPlugin(octoprint.plugin.StartupPlugin,
                            octoprint.plugin.SettingsPlugin,
                            octoprint.plugin.AssetPlugin,
                            octoprint.plugin.TemplatePlugin,
                            octoprint.plugin.BlueprintPlugin,
                            octoprint.plugin.EventHandlerPlugin):

    def __init__(self):
        self.filamentManager = None
        self.filamentOdometer = FilamentOdometer()
        self.odometerEnabled = False

    # StartupPlugin

    def on_after_startup(self):
        db_path = os.path.join(self.get_plugin_data_folder(), "filament.db")
        self.filamentManager = FilamentManager(db_path, self._logger)
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
        mods = self.filamentManager.get_profiles_modifications()
        lm = mods[0]["changed_at"] if len(mods) > 0 else 0
        etag = (hashlib.sha1(str(lm))).hexdigest()

        if check_lastmodified(int(lm)) and check_etag(etag):
            return make_response("Not Modified", 304)

        all_profiles = self.filamentManager.get_all_profiles()
        if all_profiles is not None:
            response = jsonify(dict(profiles=all_profiles))
            response.set_etag(etag)
            response.headers["Last-Modified"] = http_date(lm)
            response.headers["Cache-Control"] = "max-age=0"
            return response
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<int:identifier>", methods=["GET"])
    def get_profile(self, identifier):
        profile = self.filamentManager.get_profile(identifier)
        if profile is not None:
            if len(profile) > 0:
                return jsonify(dict(profile=profile[0]))
            else:
                return make_response("Unknown profile", 404)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles", methods=["POST"])
    def create_profile(self):
        if "application/json" not in request.headers["Content-Type"]:
            return make_response("Expected content-type JSON", 400)

        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON body in request", 400)

        if "profile" not in json_data:
            return make_response("No profile included in request", 400)

        new_profile = json_data["profile"]

        for key in ["name", "weight", "cost", "density", "diameter"]:
            if key not in new_profile:
                return make_response("Profile does not contain mandatory '{}' field".format(key), 400)

        saved_profile = self.filamentManager.create_profile(new_profile)

        if saved_profile is not None:
            return jsonify(dict(profile=saved_profile))
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<int:identifier>", methods=["PATCH"])
    def update_profile(self, identifier):
        if "application/json" not in request.headers["Content-Type"]:
            return make_response("Expected content-type JSON", 400)

        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON body in request", 400)

        if "profile" not in json_data:
            return make_response("No profile included in request", 400)

        profile = self.filamentManager.get_profile(identifier)
        if profile is None:
            return make_response("Database error", 500)
        if len(profile) < 1:
            return make_response("Unknown profile", 404)

        updated_profile = json_data["profile"]
        merged_profile = dict_merge(profile[0], updated_profile)

        saved_profile = self.filamentManager.update_profile(identifier, merged_profile)

        if saved_profile is not None:
            return jsonify(dict(profile=saved_profile))
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<int:identifier>", methods=["DELETE"])
    def delete_profile(self, identifier):
        noerror = self.filamentManager.delete_profile(identifier)
        if noerror:
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools", methods=["GET"])
    def get_spools_list(self):
        mods = self.filamentManager.get_spools_modifications()
        lm = mods[0]["changed_at"] if len(mods) > 0 else 0
        etag = (hashlib.sha1(str(lm))).hexdigest()

        if check_lastmodified(int(lm)) and check_etag(etag):
            return make_response("Not Modified", 304)

        all_spools = self.filamentManager.get_all_spools()
        if all_spools is not None:
            response = jsonify(dict(spools=all_spools))
            response.set_etag(etag)
            response.headers["Last-Modified"] = http_date(lm)
            response.headers["Cache-Control"] = "max-age=0"
            return response
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<int:identifier>", methods=["GET"])
    def get_spool(self, identifier):
        spool = self.filamentManager.get_spool(identifier)
        if spool is not None:
            if len(spool) > 0:
                return jsonify(dict(spool=spool[0]))
            else:
                return make_response("Unknown spool", 404)
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools", methods=["POST"])
    def create_spool(self):
        if "application/json" not in request.headers["Content-Type"]:
            return make_response("Expected content-type JSON", 400)

        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON body in request", 400)

        if "spool" not in json_data:
            return make_response("No spool included in request", 400)

        new_spool = json_data["spool"]

        for key in ["name", "profile_id", "used"]:
            if key not in new_spool:
                return make_response("Spool does not contain mandatory '{}' field".format(key), 400)

        saved_spool = self.filamentManager.create_spool(new_spool)

        if saved_spool is not None:
            return jsonify(dict(spool=saved_spool))
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<int:identifier>", methods=["PATCH"])
    def update_spool(self, identifier):
        if "application/json" not in request.headers["Content-Type"]:
            return make_response("Expected content-type JSON", 400)

        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON body in request", 400)

        if "spool" not in json_data:
            return make_response("No spool included in request", 400)

        spool = self.filamentManager.get_spool(identifier)
        if spool is None:
            return make_response("Database error", 500)
        if len(spool) < 1:
            return make_response("Unknown spool", 404)

        updated_spool = json_data["spool"]
        merged_spool = dict_merge(spool[0], updated_spool)

        saved_spool = self.filamentManager.update_spool(identifier, merged_spool)

        if saved_spool is not None:
            return jsonify(dict(spool=saved_spool))
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<int:identifier>", methods=["DELETE"])
    def delete_spool(self, identifier):
        noerror = self.filamentManager.delete_spool(identifier)
        if noerror:
            return make_response("", 204)
        else:
            return make_response("Database error", 500)

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
                spool_list = self.filamentManager.get_spool(tool)
                if spool_list is not None and len(spool_list) > 0:
                    spool = spool_list[0]
                    profile_list = self.filamentManager.get_profile(spool['profile_id'])
                    if profile_list is not None and len(profile_list) > 0:
                        profile = profile_list[0]
                        # update spool
                        volume = self._calculate_volume(profile['diameter'], extrusion[i]) / 1000
                        spool['used'] += volume * profile['density']
                        self.filamentManager.update_spool(spool['id'], spool)
                        self._logger.info("Filament used: " + str(extrusion[i]) + " mm (tool" + str(i) + ")")

    def _calculate_volume(self, diameter, length):
        radius = diameter / 2
        return length * math.pi * radius * radius

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
