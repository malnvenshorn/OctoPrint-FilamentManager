# coding=utf-8
from __future__ import absolute_import

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

import math
import os
import tempfile
import hashlib
import shutil
from datetime import datetime
from flask import jsonify, request, make_response, Response
from werkzeug.exceptions import BadRequest
from werkzeug.http import http_date
import octoprint.plugin
from octoprint.events import Events
from octoprint.server.util.flask import restricted_access, check_lastmodified, check_etag
from octoprint.server import admin_permission
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
        self.lastPrintState = None
        self.pauseEnabled = False
        self.pauseThreshold = []

    # StartupPlugin

    def on_startup(self, host, port):
        self.filamentOdometer = FilamentOdometer()

        db_path = os.path.join(self.get_plugin_data_folder(), "filament.db")

        if os.path.isfile(db_path) and self._settings.get(["_db_version"]) is None:
            # correct missing _db_version
            self._settings.set(["_db_version"], 1)

        try:
            self.filamentManager = FilamentManager(db_path)
            self.filamentManager.init_database()

            if self._settings.get(["_db_version"]) is None:
                # we assume the database is initialized the first time
                # therefore we got the latest db scheme
                self._settings.set(["_db_version"], self.DB_VERSION)
            else:
                # migrate existing database if neccessary
                self.migrate_db_scheme()
        except Exception as e:
            self._logger.error("Failed to create database: {message}".format(message=str(e)))
        else:
            self._update_pause_threshold()

    def migrate_db_scheme(self):
        if 1 == self._settings.get(["_db_version"]):
            # add temperature column
            sql = "ALTER TABLE spools ADD COLUMN temp_offset INTEGER NOT NULL DEFAULT 0;"
            try:
                self.filamentManager.execute_script(sql)
                self._settings.set(["_db_version"], 2)
            except Exception as e:
                self._logger.error("Database migration failed from version {old} to {new}: {message}"
                                   .format(old=self._settings.get(["_db_version"]), new=2, message=str(e)))
                return

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
            autoPause=False,
            pauseThreshold=100,
            currencySymbol="€"
        )

    # AssetPlugin

    def get_assets(self):
        return dict(
            css=["css/style.css", "css/font.css"],
            js=["js/filamentmanager.js", "js/warning.js", "js/client.js"]
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
        force = request.values.get("force", False)

        mod = self.filamentManager.get_profiles_modifications()
        lm = mod["changed_at"] if mod else 0
        etag = (hashlib.sha1(str(lm))).hexdigest()

        if not force and check_lastmodified(int(lm)) and check_etag(etag):
            return make_response("Not Modified", 304)

        try:
            all_profiles = self.filamentManager.get_all_profiles()
            response = jsonify(dict(profiles=all_profiles))
            response.set_etag(etag)
            response.headers["Last-Modified"] = http_date(lm)
            response.headers["Cache-Control"] = "max-age=0"
            return response
        except Exception as e:
            self._logger.error("Failed to fetch profiles: {message}".format(message=str(e)))
            return make_response("Failed to fetch profiles, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<int:identifier>", methods=["GET"])
    def get_profile(self, identifier):
        try:
            profile = self.filamentManager.get_profile(identifier)
            if profile:
                return jsonify(dict(profile=profile))
            else:
                self._logger.warn("Profile with id {id} does not exist".format(id=identifier))
                return make_response("Unknown profile", 404)
        except Exception as e:
            self._logger.error("Failed to fetch profile with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to fetch profile, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles", methods=["POST"])
    @restricted_access
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

        try:
            saved_profile = self.filamentManager.create_profile(new_profile)
            return jsonify(dict(profile=saved_profile))
        except Exception as e:
            self._logger.error("Failed to create profile: {message}".format(message=str(e)))
            return make_response("Failed to create profile, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<int:identifier>", methods=["PATCH"])
    @restricted_access
    def update_profile(self, identifier):
        if "application/json" not in request.headers["Content-Type"]:
            return make_response("Expected content-type JSON", 400)

        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON body in request", 400)

        if "profile" not in json_data:
            return make_response("No profile included in request", 400)

        try:
            profile = self.filamentManager.get_profile(identifier)
        except Exception as e:
            self._logger.error("Failed to fetch profile with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to fetch profile, see the log for more details", 500)

        if not profile:
            self._logger.warn("Profile with id {id} does not exist".format(id=identifier))
            return make_response("Unknown profile", 404)

        updated_profile = json_data["profile"]
        merged_profile = dict_merge(profile, updated_profile)

        try:
            saved_profile = self.filamentManager.update_profile(identifier, merged_profile)
            self._update_pause_threshold()
            return jsonify(dict(profile=saved_profile))
        except Exception as e:
            self._logger.error("Failed to update profile with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to update profile, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<int:identifier>", methods=["DELETE"])
    @restricted_access
    def delete_profile(self, identifier):
        try:
            self.filamentManager.delete_profile(identifier)
            return make_response("", 204)
        except Exception as e:
            self._logger.error("Failed to delete profile with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to delete profile, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools", methods=["GET"])
    def get_spools_list(self):
        force = request.values.get("force", False)

        mod_spool = self.filamentManager.get_spools_modifications()
        mod_profile = self.filamentManager.get_profiles_modifications()
        lm = max(mod_spool["changed_at"] if mod_spool else 0,
                 mod_profile["changed_at"] if mod_profile else 0)
        etag = (hashlib.sha1(str(lm))).hexdigest()

        if not force and check_lastmodified(int(lm)) and check_etag(etag):
            return make_response("Not Modified", 304)

        try:
            all_spools = self.filamentManager.get_all_spools()
            response = jsonify(dict(spools=all_spools))
            response.set_etag(etag)
            response.headers["Last-Modified"] = http_date(lm)
            response.headers["Cache-Control"] = "max-age=0"
            return response
        except Exception as e:
            self._logger.error("Failed to fetch spools: {message}".format(message=str(e)))
            return make_response("Failed to fetch spools, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<int:identifier>", methods=["GET"])
    def get_spool(self, identifier):
        try:
            spool = self.filamentManager.get_spool(identifier)
            if spool:
                return jsonify(dict(spool=spool))
            else:
                self._logger.warn("Spool with id {id} does not exist".format(id=identifier))
                return make_response("Unknown spool", 404)
        except Exception as e:
            self._logger.error("Failed to fetch spool with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to fetch spool, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools", methods=["POST"])
    @restricted_access
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

        try:
            saved_spool = self.filamentManager.create_spool(new_spool)
            return jsonify(dict(spool=saved_spool))
        except Exception as e:
            self._logger.error("Failed to create spool: {message}".format(message=str(e)))
            return make_response("Failed to create spool, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<int:identifier>", methods=["PATCH"])
    @restricted_access
    def update_spool(self, identifier):
        if "application/json" not in request.headers["Content-Type"]:
            return make_response("Expected content-type JSON", 400)

        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON body in request", 400)

        if "spool" not in json_data:
            return make_response("No spool included in request", 400)

        try:
            spool = self.filamentManager.get_spool(identifier)
        except Exception as e:
            self._logger.error("Failed to fetch spool with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to fetch spool, see the log for more details", 500)

        if not spool:
            self._logger.warn("Spool with id {id} does not exist".format(id=identifier))
            return make_response("Unknown spool", 404)

        updated_spool = json_data["spool"]
        merged_spool = dict_merge(spool, updated_spool)

        try:
            saved_spool = self.filamentManager.update_spool(identifier, merged_spool)
            self._update_pause_threshold()
            return jsonify(dict(spool=saved_spool))
        except Exception as e:
            self._logger.error("Failed to update spool with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to update spool, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<int:identifier>", methods=["DELETE"])
    @restricted_access
    def delete_spool(self, identifier):
        try:
            self.filamentManager.delete_spool(identifier)
            return make_response("", 204)
        except Exception as e:
            self._logger.error("Failed to delete spool with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to delete spool, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/selections", methods=["GET"])
    def get_selections_list(self):
        try:
            all_selections = self.filamentManager.get_all_selections()
            response = jsonify(dict(selections=all_selections))
            return response
        except Exception as e:
            self._logger.error("Failed to fetch selected spools: {message}".format(message=str(e)))
            return make_response("Failed to fetch selected spools, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/selections/<int:identifier>", methods=["PATCH"])
    @restricted_access
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

        try:
            saved_selection = self.filamentManager.update_selection(identifier, selection)
            self._update_pause_threshold()
            return jsonify(dict(selection=saved_selection))
        except Exception as e:
            self._logger.error("Failed to update selected spool for tool {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to update selected spool, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/export", methods=["GET"])
    @restricted_access
    @admin_permission.require(403)
    def export_data(self):
        try:
            tempdir = tempfile.mkdtemp()
            self.filamentManager.export_data(tempdir)
            archive_path = shutil.make_archive(tempfile.mktemp(), "zip", tempdir)
        except Exception as e:
            self._logger.error("Data export failed: {message}".format(message=str(e)))
            return make_response("Data export failed, see the log for more details", 500)
        finally:
            try:
                shutil.rmtree(tempdir)
            except Exception as e:
                self._logger.warn("Could not remove temporary directory {path}: {message}"
                                  .format(path=tempdir, message=str(e)))

        archive_name = "filament_export_{timestamp}.zip".format(timestamp=datetime.now().strftime("%Y-%m-%d_%H-%M-%S"))

        def file_generator():
            with open(archive_path) as f:
                for c in f:
                    yield c
            try:
                os.remove(archive_path)
            except Exception as e:
                self._logger.warn("Could not remove temporary file {path}: {message}"
                                  .format(path=archive_path, message=str(e)))

        response = Response(file_generator(), mimetype="application/zip")
        response.headers.set('Content-Disposition', 'attachment', filename=archive_name)
        return response

    @octoprint.plugin.BlueprintPlugin.route("/import", methods=["POST"])
    @restricted_access
    @admin_permission.require(403)
    def import_data(self):
        input_name = "file"
        input_upload_path = input_name + "." + self._settings.global_get(["server", "uploads", "pathSuffix"])
        input_upload_name = input_name + "." + self._settings.global_get(["server", "uploads", "nameSuffix"])

        if input_upload_path not in request.values or input_upload_name not in request.values:
            return make_response("No file included", 400)

        upload_path = request.values[input_upload_path]
        upload_name = request.values[input_upload_name]

        if not upload_name.lower().endswith(".zip"):
            return make_response("File doesn't have a valid extension for an import archive", 400)

        try:
            tempdir = tempfile.mkdtemp()
            # python 2.7 lacks of shutil.unpack_archive ¯\_(ツ)_/¯
            from zipfile import ZipFile
            with ZipFile(upload_path, "r") as zip_file:
                zip_file.extractall(tempdir)
            self.filamentManager.import_data(tempdir)
        except Exception as e:
            self._logger.error("Data import failed: {message}".format(message=str(e)))
            return make_response("Data import failed, see the log for more details", 500)
        finally:
            try:
                shutil.rmtree(tempdir)
            except Exception as e:
                self._logger.warn("Could not remove temporary directory {path}: {message}"
                                  .format(path=tempdir, message=str(e)))

        return make_response("", 204)

    # EventHandlerPlugin

    def on_event(self, event, payload):
        if event == Events.PRINTER_STATE_CHANGED:
            if payload['state_id'] == "PRINTING":
                if self.lastPrintState == "PAUSED":
                    # resuming print
                    self.filamentOdometer.reset_extruded_length()
                else:
                    # starting new print
                    self.filamentOdometer.reset()
                self.odometerEnabled = self._settings.getBoolean(["enableOdometer"])
                self.pauseEnabled = self._settings.getBoolean(["autoPause"])
                self._logger.debug("Printer State: {}".format(payload["state_string"]))
                self._logger.debug("Odometer: {}".format("Enabled" if self.odometerEnabled else "Disabled"))
                self._logger.debug("AutoPause: {}".format("Enabled" if self.pauseEnabled else "Disabled"))
            elif self.lastPrintState == "PRINTING":
                self._logger.debug("Printer State: {}".format(payload["state_string"]))
                # print state changed from printing, update filament usage
                if self.odometerEnabled:
                    self.odometerEnabled = False
                    self._update_filament_usage()

            # update last print state
            self.lastPrintState = payload['state_id']

    def _update_filament_usage(self):
        printer_profile = self._printer_profile_manager.get_current_or_default()
        extrusion = self.filamentOdometer.get_values()
        numTools = min(printer_profile['extruder']['count'], len(extrusion))

        for tool in xrange(0, numTools):
            self._logger.info("Filament used: {length} mm (tool{id})".format(length=str(extrusion[tool]), id=str(tool)))

            try:
                selection = self.filamentManager.get_selection(tool)
                spool = selection["spool"]

                if not spool:
                    self._logger.warn("No selected spool for tool{id}".format(id=tool))
                    continue

                # update spool
                spool_string = "{name} - {material} ({vendor})"
                spool_string = spool_string.format(name=spool["name"], material=spool["profile"]["material"],
                                                   vendor=spool["profile"]["vendor"])
                volume = self._length_to_volume(spool["profile"]['diameter'], extrusion[tool]) / 1000
                weight = volume * spool["profile"]['density']
                old_value = spool["weight"] - spool["used"]
                spool["used"] += weight
                new_value = spool["weight"] - spool["used"]
                self._logger.debug("Updating remaining filament on spool '{spool}' from {old}g to {new}g ({diff}g)"
                                   .format(spool=spool_string, old=str(old_value), new=str(new_value),
                                           diff=str(new_value - old_value)))
                self.filamentManager.update_spool(spool["id"], spool)
            except Exception as e:
                self._logger.error("Failed to update filament on tool{id}: {message}"
                                   .format(id=str(tool), message=str(e)))

        self._send_client_message("updated_filaments")

    def _send_client_message(self, message_type, data=None):
        self._plugin_manager.send_plugin_message(self._identifier, dict(type=message_type, data=data))

    def _length_to_volume(self, diameter, length):
        radius = diameter / 2
        return length * math.pi * radius * radius

    def _volume_to_length(self, diameter, volume):
        radius = diameter / 2
        return volume / (math.pi * radius * radius)

    # Protocol hook

    def filament_odometer(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        if self.odometerEnabled:
            self.filamentOdometer.parse(gcode, cmd)
            if self.pauseEnabled:
                extrusion = self.filamentOdometer.get_values()
                tool = self.filamentOdometer.get_current_tool()
                try:
                    if self.pauseThreshold[tool] is not None and extrusion[tool] >= self.pauseThreshold[tool]:
                        self._logger.info("Filament is running out, pausing print")
                        self._printer.pause_print()
                except IndexError:
                    # Ignoring index out of range errors
                    # This usually means that the tool has no spool assigned
                    pass

    def _update_pause_threshold(self):
        try:
            selections = self.filamentManager.get_all_selections()
            tmp = []
            for sel in selections:
                if sel["tool"] >= len(tmp):
                    tmp.extend([None for i in xrange(sel["tool"] - len(tmp) + 1)])
                diameter = sel["spool"]["profile"]["diameter"]
                volume = (sel["spool"]["weight"] - sel["spool"]["used"]) / sel["spool"]["profile"]["density"]
                threshold = self._volume_to_length(diameter, volume * 1000) - self._settings.getInt(["pauseThreshold"])
                tmp.insert(sel["tool"], threshold)
            self.pauseThreshold = tmp
        except Exception as e:
            self.pauseThreshold = []
            self._logger.error("Failed to set pause tresholds: {message}".format(message=str(e)))

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
