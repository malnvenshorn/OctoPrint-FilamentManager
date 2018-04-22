# coding=utf-8
from __future__ import absolute_import

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

import os
import tempfile
import shutil
from datetime import datetime

from flask import jsonify, request, make_response, Response
from werkzeug.exceptions import BadRequest

import octoprint.plugin
from octoprint.settings import valid_boolean_trues
from octoprint.server import admin_permission
from octoprint.server.util.flask import restricted_access, check_lastmodified, check_etag
from octoprint.util import dict_merge

from .util import entity_tag, add_revalidation_header_with_no_max_age


class FilamentManagerApi(octoprint.plugin.BlueprintPlugin):

    @octoprint.plugin.BlueprintPlugin.route("/profiles", methods=["GET"])
    def get_profiles_list(self):
        force = request.values.get("force", "false") in valid_boolean_trues

        try:
            lm = self.filamentManager.get_profiles_lastmodified()
        except Exception as e:
            lm = None
            self._logger.error("Failed to fetch profiles lastmodified timestamp: {message}".format(message=str(e)))

        etag = entity_tag(lm)

        if not force and check_lastmodified(lm) and check_etag(etag):
            return make_response("Not Modified", 304)

        try:
            all_profiles = self.filamentManager.get_all_profiles()
            response = jsonify(dict(profiles=all_profiles))
            return add_revalidation_header_with_no_max_age(response, lm, etag)
        except Exception as e:
            self._logger.error("Failed to fetch profiles: {message}".format(message=str(e)))
            return make_response("Failed to fetch profiles, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/profiles/<int:identifier>", methods=["GET"])
    def get_profile(self, identifier):
        try:
            profile = self.filamentManager.get_profile(identifier)
            if profile is not None:
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
        except Exception as e:
            self._logger.error("Failed to update profile with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to update profile, see the log for more details", 500)
        else:
            self.on_data_modified("profiles", "update")
            return jsonify(dict(profile=saved_profile))

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
        force = request.values.get("force", "false") in valid_boolean_trues

        try:
            lm = self.filamentManager.get_spools_lastmodified()
        except Exception as e:
            lm = None
            self._logger.error("Failed to fetch spools lastmodified timestamp: {message}".format(message=str(e)))

        etag = entity_tag(lm)

        if not force and check_lastmodified(lm) and check_etag(etag):
            return make_response("Not Modified", 304)

        try:
            all_spools = self.filamentManager.get_all_spools()
            response = jsonify(dict(spools=all_spools))
            return add_revalidation_header_with_no_max_age(response, lm, etag)
        except Exception as e:
            self._logger.error("Failed to fetch spools: {message}".format(message=str(e)))
            return make_response("Failed to fetch spools, see the log for more details", 500)

    @octoprint.plugin.BlueprintPlugin.route("/spools/<int:identifier>", methods=["GET"])
    def get_spool(self, identifier):
        try:
            spool = self.filamentManager.get_spool(identifier)
            if spool is not None:
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
        except Exception as e:
            self._logger.error("Failed to update spool with id {id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to update spool, see the log for more details", 500)
        else:
            self.on_data_modified("spools", "update")
            return jsonify(dict(spool=saved_spool))

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
            all_selections = self.filamentManager.get_all_selections(self.client_id)
            return jsonify(dict(selections=all_selections))
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

        if self._printer.is_printing() and not self.m600_command_running:
            return make_response("Trying to change filament while printing", 409)

        try:
            saved_selection = self.filamentManager.update_selection(identifier, self.client_id, selection)
        except Exception as e:
            self._logger.error("Failed to update selected spool for tool{id}: {message}"
                               .format(id=str(identifier), message=str(e)))
            return make_response("Failed to update selected spool, see the log for more details", 500)
        else:
            try:
                self.set_temp_offsets([saved_selection])
            except Exception as e:
                self._logger.error("Failed to set temperature offsets: {message}".format(message=str(e)))
            self.on_data_modified("selections", "update")
            return jsonify(dict(selection=saved_selection))

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

        timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        archive_name = "filament_export_{timestamp}.zip".format(timestamp=timestamp)

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
        def unzip(filename, extract_dir):
            # python 2.7 lacks of shutil.unpack_archive ¯\_(ツ)_/¯
            from zipfile import ZipFile
            with ZipFile(filename, "r") as zip_file:
                zip_file.extractall(extract_dir)

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
            unzip(upload_path, tempdir)
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

    @octoprint.plugin.BlueprintPlugin.route("/database/test", methods=["POST"])
    @restricted_access
    def test_database_connection(self):
        if "application/json" not in request.headers["Content-Type"]:
            return make_response("Expected content-type JSON", 400)

        try:
            json_data = request.json
        except BadRequest:
            return make_response("Malformed JSON body in request", 400)

        if "config" not in json_data:
            return make_response("No database configuration included in request", 400)

        config = json_data["config"]

        for key in ["uri", "name", "user", "password"]:
            if key not in config:
                return make_response("Configuration does not contain mandatory '{}' field".format(key), 400)

        try:
            connection = self.filamentManager.connect(config["uri"],
                                                      database=config["name"],
                                                      username=config["user"],
                                                      password=config["password"])
        except Exception as e:
            return make_response("Failed to connect to the database with the given configuration", 400)
        else:
            connection.close()
            return make_response("", 204)
