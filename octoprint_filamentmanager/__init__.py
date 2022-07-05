# coding=utf-8
from __future__ import absolute_import

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

from math import pi as PI

import octoprint.plugin
from octoprint.settings import valid_boolean_trues
from octoprint.events import Events
from octoprint.util import dict_merge
from octoprint.util.version import is_octoprint_compatible

from .api import FilamentManagerApi
from .data import FilamentManager
from .newodometer import NewFilamentOdometer
# from .odometer import FilamentOdometer


class FilamentManagerPlugin(FilamentManagerApi,
                            octoprint.plugin.StartupPlugin,
                            octoprint.plugin.ShutdownPlugin,
                            octoprint.plugin.SettingsPlugin,
                            octoprint.plugin.AssetPlugin,
                            octoprint.plugin.TemplatePlugin,
                            octoprint.plugin.EventHandlerPlugin):

    DB_VERSION = 3

    def __init__(self):
        self.client_id = None
        self.filamentManager = None
        # self.filamentOdometer = None
        self.myFilamentOdometer = None
        self.lastPrintState = None

        self.odometerEnabled = False
        self.pauseEnabled = False
        self.pauseThresholds = dict()

    def initialize(self):
        def get_client_id():
            client_id = self._settings.get(["database", "clientID"])
            if client_id is None:
                from uuid import uuid1
                client_id = str(uuid1())
                self._settings.set(["database", "clientID"], client_id)
            return client_id

        self.client_id = get_client_id()

        # self.filamentOdometer = FilamentOdometer()
        # self.filamentOdometer.set_g90_extruder(self._settings.get_boolean(["feature", "g90InfluencesExtruder"]))

        self.myFilamentOdometer = NewFilamentOdometer()
        self.myFilamentOdometer.set_g90_extruder(self._settings.get_boolean(["feature", "g90InfluencesExtruder"]))

        self.alreadyCanceled = False

        db_config = self._settings.get(["database"], merged=True)
        migrate_schema_version = False

        if db_config["useExternal"] not in valid_boolean_trues:
            import os
            # set uri for internal sqlite database
            db_path = os.path.join(self.get_plugin_data_folder(), "filament.db")
            db_config["uri"] = "sqlite:///" + db_path
            migrate_schema_version = os.path.isfile(db_path)

        try:
            # initialize database
            self.filamentManager = FilamentManager(db_config)
            self.filamentManager.initialize()

            schema_version = self.filamentManager.get_schema_version()

            # migrate schema version to database if needed
            # since plugin version 0.5.0 the schema version will be expected in the database
            if schema_version is None and migrate_schema_version:
                # three conditions must be met:
                # - internal database is selected
                # - database was not newly created
                # - there is no schema version in the database already
                if self._settings.get(["_db_version"]) is None:
                    # no version was set before 0.3.0 => expecting the first schema
                    schema_version = 1
                else:
                    # migrate schema version from config.yaml
                    schema_version = self._settings.getInt(["_db_version"])
                self._logger.warn("No schema_id found in database, setting id to %s" % schema_version)
                self.filamentManager.set_schema_version(schema_version)

            # migrate database schema if needed
            if schema_version is None:
                # we assume the database is initialized the first time => we got the latest db scheme
                self.filamentManager.set_schema_version(self.DB_VERSION)
            elif schema_version < self.DB_VERSION:
                # migrate existing database
                self.migrate_database_schema(self.DB_VERSION, schema_version)
                self.filamentManager.set_schema_version(self.DB_VERSION)
                self._logger.info("Updated database schema from version {old} to {new}"
                                  .format(old=schema_version, new=self.DB_VERSION))
        except Exception as e:
            self._logger.error("Failed to initialize database: {message}".format(message=str(e)))
            self._logger.exception("Failed to initialize database: {message}".format(message=str(e)))

    def migrate_database_schema(self, target, current):
        if current <= 1:
            # add temperature column
            sql = "ALTER TABLE spools ADD COLUMN temp_offset INTEGER NOT NULL DEFAULT 0;"
            self.filamentManager.execute_script(sql)

        if current <= 2:
            # recreate tables except profiles and spools
            sql = """ DROP TABLE modifications;
                      DROP TABLE selections;
                      DROP TRIGGER profiles_onINSERT;
                      DROP TRIGGER profiles_onUPDATE;
                      DROP TRIGGER profiles_onDELETE;
                      DROP TRIGGER spools_onINSERT;
                      DROP TRIGGER spools_onUPDATE;
                      DROP TRIGGER spools_onDELETE; """
            self.filamentManager.execute_script(sql)
            self.filamentManager.initialize()

    def on_after_startup(self):
        self.odometerEnabled = self._settings.get_boolean(["enableOdometer"])
        self.pauseEnabled = self._settings.get_boolean(["autoPause"])

        # subscribe to the notify channel so that we get notified if another client has altered the data
        # notify is not available if we are connected to the internal sqlite database
        if self.filamentManager is not None and self.filamentManager.notify is not None:
            def notify(pid, channel, payload):
                # ignore notifications triggered by our own connection
                if pid != self.filamentManager.conn.connection.get_backend_pid():
                    self.send_client_message("data_changed", data=dict(table=channel, action=payload))
                    self.on_data_modified(channel, payload)
            self.filamentManager.notify.subscribe(notify)

        # initialize the pause thresholds
        self.update_pause_thresholds()

        # set temperature offsets for saved selections
        self.assign_temperature_offset()

    def on_shutdown(self):
        if self.filamentManager is not None:
            self.filamentManager.close()

    def on_data_modified(self, data, action):
        if action.lower() == "update":
            # if either profiles, spools or selections are updated
            # we have to recalculate the pause thresholds
            self.update_pause_thresholds()

    def send_client_message(self, message_type, data=None):
        self._plugin_manager.send_plugin_message(self._identifier, dict(type=message_type, data=data))

    def set_temp_offsets(self, selections):
        offset_dict = dict()
        for tool in selections:
            offset_dict["tool%s" % tool["tool"]] = tool["spool"]["temp_offset"] if tool["spool"] is not None else 0
        self._printer.set_temperature_offset(offset_dict)

    # SettingsPlugin

    def get_settings_version(self):
        return 1

    def get_settings_defaults(self):
        return dict(
            enableOdometer=True,
            enableWarning=True,
            autoPause=False,
            pauseThreshold=100,
            database=dict(
                useExternal=False,
                uri="postgresql://",
                name="",
                user="",
                password="",
                clientID=None,
            ),
            currencySymbol="€",
            confirmSpoolSelection=False,
        )

    def on_settings_migrate(self, target, current=None):
        if current is None or current < 1:
            self._settings.set(["selectedSpools"], None)
            self._settings.set(["_db_version"], None)

    def on_settings_save(self, data):
        # before saving
        old_threshold = self._settings.getFloat(["pauseThreshold"])
        octoprint.plugin.SettingsPlugin.on_settings_save(self, data)

        # after saving
        if old_threshold != self._settings.getFloat(["pauseThreshold"]):
            # if the threshold settings has been modified
            # we have to recalculate the pause thresholds
            self.update_pause_thresholds()

        # self.filamentOdometer.set_g90_extruder(self._settings.get_boolean(["feature", "g90InfluencesExtruder"]))
        self.myFilamentOdometer.set_g90_extruder(self._settings.get_boolean(["feature", "g90InfluencesExtruder"]))

        self.odometerEnabled = self._settings.get_boolean(["enableOdometer"])
        self.pauseEnabled = self._settings.get_boolean(["autoPause"])

    # AssetPlugin

    def get_assets(self):
        return dict(
            css=["css/filamentmanager.min.css"],
            js=["js/filamentmanager.bundled.js"],
        )

    # TemplatePlugin

    def get_template_configs(self):
        return [
            dict(type="settings", template="settings.jinja2"),
            dict(type="generic", template="settings_profiledialog.jinja2"),
            dict(type="generic", template="settings_spooldialog.jinja2"),
            dict(type="generic", template="settings_configdialog.jinja2"),
            dict(type="sidebar", icon="reel", template="sidebar.jinja2", template_header="sidebar_header.jinja2"),
            dict(type="generic", template="spool_confirmation.jinja2"),
        ]

    # EventHandlerPlugin

    def on_event(self, event, payload):
        # if event == Events.PRINTER_STATE_CHANGED:
        #     self.on_printer_state_changed(payload)

        if Events.PRINT_STARTED == event:
            self.alreadyCanceled = False
            self._printJobStarted(payload)
        elif Events.PRINT_PAUSED == event:
            self.alreadyCanceled = True
            self._printJobPaused()
        elif Events.PRINT_RESUMED == event:
            self.alreadyCanceled = True
            self._printJobResumed()
        elif Events.PRINT_DONE == event:
            self._printJobFinished()
        elif Events.PRINT_FAILED == event:
            if self.alreadyCanceled == False:
                self._printJobFinished()
        elif Events.PRINT_CANCELLED == event:
            self.alreadyCanceled = True
            self._printJobFinished()

        elif Events.CONNECTED == event:
            self.assign_temperature_offset()

        pass

    def _printJobStarted(self, payload):

        # starting new print
        # self.filamentOdometer.reset()
        self.myFilamentOdometer.reset()

        self.odometerEnabled = self._settings.get_boolean(["enableOdometer"])
        self.pauseEnabled = self._settings.get_boolean(["autoPause"])
        self._logger.debug("Printer started")
        self._logger.debug("Odometer: %s" % ("On" if self.odometerEnabled else "Off"))
        self._logger.debug("AutoPause: %s" % ("On" if self.pauseEnabled and self.odometerEnabled else "Off"))

        pass

    def _printJobPaused(self):
        # do nothing
        pass

    def _printJobResumed(self):
        # do nothing
        pass

    def _printJobFinished(self):
        self.update_filament_usage()
        pass

    # def on_printer_state_changed(self, payload):
    #     if payload['state_id'] == "PRINTING":
    #         if self.lastPrintState == "PAUSED":
    #             # resuming print
    #             # no idea why on pausing the extruded length should be reseted self.filamentOdometer.reset_extruded_length()
    #             pass
    #         else:
    #             # starting new print
    #             # self.filamentOdometer.reset()
    #             self.myFilamentOdometer.reset()
    #         self.odometerEnabled = self._settings.get_boolean(["enableOdometer"])
    #         self.pauseEnabled = self._settings.get_boolean(["autoPause"])
    #         self._logger.debug("Printer State: %s" % payload["state_string"])
    #         self._logger.debug("Odometer: %s" % ("On" if self.odometerEnabled else "Off"))
    #         self._logger.debug("AutoPause: %s" % ("On" if self.pauseEnabled and self.odometerEnabled else "Off"))
    #     elif self.lastPrintState == "PRINTING":
    #         # print state changed from printing => update filament usage
    #         self._logger.debug("Printer State: %s" % payload["state_string"])
    #         if self.odometerEnabled:
    #             self.odometerEnabled = False  # disabled because we don't want to track manual extrusion
    #             self.update_filament_usage()
    #
    #     # update last print state
    #     self.lastPrintState = payload['state_id']

    def assign_temperature_offset(self):
        try:
            all_selections = self.filamentManager.get_all_selections(self.client_id)
            self.set_temp_offsets(all_selections)
        except Exception as e:
            self._logger.error("Failed to set temperature offsets: {message}".format(message=str(e)))
            self._logger.exception("Failed to set temperature offsets: {message}".format(message=str(e)))

    def update_filament_usage(self):
        printer_profile = self._printer_profile_manager.get_current_or_default()
        # extrusion = self.filamentOdometer.get_extrusion()
        extrusion = self.myFilamentOdometer.getExtrusionAmount()

        printerProfileToolCount = printer_profile['extruder']['count']
        self._logger.info("Updating Filament usage for octoprint configured toolcount: {toolCount}"
                          .format(toolCount=str(printerProfileToolCount)))

        self._logger.info("Filament tracked toolcount: {toolCount}"
                          .format(toolCount=str(len(extrusion))))

        self._logger.info("Filament tracked values: {trackedValues}"
                          .format(trackedValues=str(extrusion)))

        numTools = min(printerProfileToolCount, len(extrusion))

        def calculate_weight(length, profile):
            radius = profile["diameter"] / 2  # mm
            volume = (length * PI * radius * radius) / 1000  # cm³
            return volume * profile["density"]  # g


        for tool in range(0, numTools):
            self._logger.info("Filament used: {length} mm (tool{id})"
                              .format(length=str(extrusion[tool]), id=str(tool)))

            try:
                selection = self.filamentManager.get_selection(tool, self.client_id)
                spool = selection["spool"]

                if spool is None:
                    # spool not found => skip
                    self._logger.warn("No selected spool for tool{id}".format(id=tool))
                    continue

                # update spool
                weight = calculate_weight(extrusion[tool], spool["profile"])
                old_value = spool["weight"] - spool["used"]
                spool["used"] += weight
                new_value = spool["weight"] - spool["used"]

                self.filamentManager.update_spool(spool["id"], spool)

                # logging
                spool_string = "{name} - {material} ({vendor})"
                spool_string = spool_string.format(name=spool["name"], material=spool["profile"]["material"],
                                                   vendor=spool["profile"]["vendor"])
                self._logger.info("Updated remaining filament on spool '{spool}' from {old}g to {new}g ({diff}g)"
                                   .format(spool=spool_string, old=str(old_value), new=str(new_value),
                                           diff=str(new_value - old_value)))
            except Exception as e:
                self._logger.error("Failed to update filament on tool{id}: {message}"
                                   .format(id=str(tool), message=str(e)))
                self._logger.exception("Failed to update filament on tool{id}: {message}"
                                   .format(id=str(tool), message=str(e)))

        self.send_client_message("data_changed", data=dict(table="spools", action="update"))
        self.on_data_modified("spools", "update")

    # Protocol hook
    def filament_odometer(self, comm_instance, phase, cmd, cmd_type, gcode, *args, **kwargs):
        # is enabled in plugin settings and is currently prining

        if self.odometerEnabled and self._printer.is_printing():
            # self.filamentOdometer.parse(gcode, cmd)
            self.myFilamentOdometer.processGCodeLine(cmd)

            if self.pauseEnabled and self.check_threshold():
                self._logger.info("Filament is running out, pausing print")
                self._printer.pause_print()

    def check_threshold(self):
        # extrusion = self.filamentOdometer.get_extrusion()
        extrusion = self.myFilamentOdometer.getExtrusionAmount()
        # tool = self.filamentOdometer.get_current_tool()
        tool = self.myFilamentOdometer.getCurrentTool()
        threshold = self.pauseThresholds.get("tool%s" % tool)

        return (threshold is not None and extrusion[tool] >= threshold)

    def update_pause_thresholds(self):
        def set_threshold(selection):
            def threshold(spool):
                radius = spool["profile"]["diameter"] / 2
                volume = (spool["weight"] - spool["used"]) / spool["profile"]["density"]
                length = (volume * 1000) / (PI * radius * radius)
                return length - self._settings.getFloat(["pauseThreshold"])

            try:
                spool = selection["spool"]
                if spool is not None:
                    self.pauseThresholds["tool%s" % selection["tool"]] = threshold(spool)
            except ZeroDivisionError:
                tool = selection["tool"]
                self._logger.warn("ZeroDivisionError while calculating pause threshold for tool{tool}, "
                                  "pause feature not available for selected spool".format(tool=tool))

        self.pauseThresholds = dict()

        try:
            selections = self.filamentManager.get_all_selections(self.client_id)
        except Exception as e:
            self._logger.error("Failed to fetch selected spools, pause feature will not be available: {message}"
                               .format(message=str(e)))
            self._logger.exception("Failed to fetch selected spools, pause feature will not be available: {message}"
                               .format(message=str(e)))
        else:
            for s in selections:
                set_threshold(s)

        self._logger.debug("Updated thresholds: {thresholds}".format(thresholds=str(self.pauseThresholds)))

    # Softwareupdate hook

    def get_update_information(self):
        return dict(
            filamentmanager=dict(
                displayName="Filament Manager",
                displayVersion=self._plugin_version,

                # version check: github repository
                type="github_release",
                user="OllisGit",
                repo="OctoPrint-FilamentManager",
                current=self._plugin_version,

                # update method: pip
                #pip="https://github.com/malnvenshorn/OctoPrint-FilamentManager/archive/{target_version}.zip"
                pip="https://github.com/OllisGit/OctoPrint-FilamentManager/releases/latest/download/master.zip"
            )
        )


__plugin_name__ = "Filament Manager"
__plugin_pythoncompat__ = ">=2.7,<4"
__required_octoprint_version__ = ">=1.3.6"


def __plugin_load__():
    if not is_octoprint_compatible(__required_octoprint_version__):
        import logging
        logger = logging.getLogger(__name__)
        logger.error("OctoPrint version is not compatible ({version} required)"
                     .format(version=__required_octoprint_version__))
        return

    global __plugin_implementation__
    __plugin_implementation__ = FilamentManagerPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.check_config": __plugin_implementation__.get_update_information,
        "octoprint.comm.protocol.gcode.sent": __plugin_implementation__.filament_odometer
    }
