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

    DB_VERSION = 2

    def __init__(self):
        self.filamentManager = None
        self.filamentOdometer = None
        self.odometerEnabled = False

    # StartupPlugin

    def on_startup(self, host, port):
        self.filamentOdometer = FilamentOdometer(self._logger)

        db_path = os.path.join(self.get_plugin_data_folder(), "filament.db")
        self.filamentManager = FilamentManager(db_path, self._logger)

        if self.filamentManager.init_database():
            if self._settings.get(["_db_version"]) is None:             # inital startup
                self._settings.set(["_db_version"], self.DB_VERSION)    # we got the latest db scheme
            else:
                self.migrate_db_scheme()
        else:
            self._logger.error("Failed to create database")

    def migrate_db_scheme(self):
        if 1 == self._settings.get(["_db_version"]):
            # add temperature column
            sql = "ALTER TABLE spools ADD COLUMN temp_offset INTEGER NOT NULL DEFAULT 0;"
            if self.filamentManager.execute_script(sql):
                self._settings.set(["_db_version"], 2)
            else:
                self._logger.error("Database migration failed from version {} to {}"
                                   .format(self._settings.get(["_db_version"]), 2))

            # migrate selected spools from config.yaml to database
            selections = self._settings.get(["selectedSpools"])
            if selections is not None:
                for key in selections:
                    data = dict(
                                tool=key.replace("tool", ""),
                                spool=dict(
                                    id=selections[key]
                                )
                           )
                    self.filamentManager.update_selection(key.replace("tool", ""), data)
                self._settings.set(["selectedSpools"], None)

    # SettingsPlugin

    def get_settings_defaults(self):
        return dict(
            _db_version=None,
            enableOdometer=True,
            enableWarning=True,
            currencySymbol="€"
        )

    # AssetPlugin

    def get_assets(self):
        return dict(
            css=["css/style.css", "css/font.css"],
            js=["js/filamentmanager.js", "js/warning.js"]
        )

    # TemplatePlugin

    def get_template_configs(self):
        return [
            dict(type="settings", template="settings.jinja2"),
            dict(type="generic", template="settings_profiledialog.jinja2"),
            dict(type="generic", template="settings_spooldialog.jinja2"),
            dict(type="generic", template="settings_configdialog.jinja2"),
            dict(type="sidebar", icon="reel", template="sidebar.jinja2", template_header="sidebar_header.jinja2")
        ]

    # BlueprintPlugin

    @octoprint.plugin.BlueprintPlugin.route("/profiles", methods=["GET"])
    def get_profiles_list(self):
        mod = self.filamentManager.get_profiles_modifications()
        lm = mod["changed_at"] if mod else 0
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
            if profile:
                return jsonify(dict(profile=profile))
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

        for key in ["vendor", "material", "density", "diameter"]:
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
        if not profile:
            return make_response("Unknown profile", 404)

        updated_profile = json_data["profile"]
        merged_profile = dict_merge(profile, updated_profile)

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
        mod_spool = self.filamentManager.get_spools_modifications()
        mod_profile = self.filamentManager.get_profiles_modifications()
        lm = max(mod_spool["changed_at"] if mod_spool else 0,
                 mod_profile["changed_at"] if mod_profile else 0)
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
            if spool:
                return jsonify(dict(spool=spool))
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

        for key in ["name", "profile", "cost", "weight", "used", "temp_offset"]:
            if key not in new_spool:
                return make_response("Spool does not contain mandatory '{}' field".format(key), 400)

        if "id" not in new_spool.get("profile", {}):
            return make_response("Spool does not contain mandatory 'id (profile)' field", 400)

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
        if not spool:
            return make_response("Unknown spool", 404)

        updated_spool = json_data["spool"]
        merged_spool = dict_merge(spool, updated_spool)

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

    @octoprint.plugin.BlueprintPlugin.route("/selections", methods=["GET"])
    def get_selections_list(self):
        # mods = self.filamentManager.get_spools_modifications()
        # lm = mods[0]["changed_at"] if len(mods) > 0 else 0
        # etag = (hashlib.sha1(str(lm))).hexdigest()
        #
        # if check_lastmodified(int(lm)) and check_etag(etag):
        #     return make_response("Not Modified", 304)

        all_selections = self.filamentManager.get_all_selections()
        if all_selections is not None:
            response = jsonify(dict(selections=all_selections))
            # response.set_etag(etag)
            # response.headers["Last-Modified"] = http_date(lm)
            # response.headers["Cache-Control"] = "max-age=0"
            return response
        else:
            return make_response("Database error", 500)

    @octoprint.plugin.BlueprintPlugin.route("/selections/<int:identifier>", methods=["POST"])
    def update_selection(self, identifier):
        if "application/json" not in request.headers["Content-Type"]:
            return make_response("Expected content-type JSON", 400)

        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON body in request", 400)

        if "selection" not in json_data:
            return make_response("No selection included in request", 400)

        selection = json_data["selection"]

        if "tool" not in selection:
            return make_response("Selection does not contain mandatory 'tool' field", 400)
        if "id" not in selection.get("spool", {}):
            return make_response("Selection does not contain mandatory 'id (spool)' field", 400)

        saved_selection = self.filamentManager.update_selection(identifier, selection)

        if saved_selection is not None:
            return jsonify(dict(selection=saved_selection))
        else:
            return make_response("Database error", 500)

    # EventHandlerPlugin

    def on_event(self, event, payload):
        if event == Events.PRINT_STARTED:
            self.odometerEnabled = self._settings.get(["enableOdometer"])
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
            self.odometerEnabled = self._settings.get(["enableOdometer"])

    def _update_filament_usage(self):
        printer_profile = self._printer_profile_manager.get_current_or_default()
        extrusion = self.filamentOdometer.get_values()
        numTools = min(printer_profile['extruder']['count'], len(extrusion))

        for tool in xrange(0, numTools):
            selection = self.filamentManager.get_selection(tool)
            if selection is not None and selection:
                spool = selection["spool"]
                # update spool
                volume = self._calculate_volume(spool["profile"]['diameter'], extrusion[tool]) / 1000
                spool['used'] += volume * spool["profile"]['density']
                self.filamentManager.update_spool(spool["id"], spool)
                self._logger.info("Filament used: " + str(extrusion[tool]) + " mm (tool" + str(tool) + ")")

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
                displayName="Filament Manager",
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


__plugin_name__ = "Filament Manager"


def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FilamentManagerPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information,
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.filament_odometer
    }
