# coding=utf-8
import sqlite3
from multiprocessing import Lock

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"


class FilamentManager(object):

    def __init__(self, database, logger):
        self._logger = logger
        self._db_lock = Lock()
        self._db = sqlite3.connect(database, check_same_thread=False)
        self._db.execute("PRAGMA foreign_keys = ON")

    def init_database(self):
        scheme = []
        scheme.append(
            """ CREATE TABLE IF NOT EXISTS profiles (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vendor TEXT NOT NULL DEFAULT "",
                    material TEXT NOT NULL DEFAULT "",
                    density REAL NOT NULL DEFAULT 0,
                    diameter REAL NOT NULL DEFAULT 0);

                CREATE TABLE IF NOT EXISTS spools (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile_id INTEGER NOT NULL,
                    name TEXT NOT NULL DEFAULT "",
                    cost REAL NOT NULL DEFAULT 0,
                    weight REAL NOT NULL DEFAULT 0,
                    used REAL NOT NULL DEFAULT 0,
                    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE RESTRICT);

                CREATE TABLE IF NOT EXISTS selections (
                    tool INTEGER PRIMARY KEY ON CONFLICT REPLACE,
                    spool_id INTEGER,
                    FOREIGN KEY (spool_id) REFERENCES spools(id) ON DELETE CASCADE);

                CREATE TABLE IF NOT EXISTS modifications (
                    table_name TEXT NOT NULL PRIMARY KEY ON CONFLICT REPLACE,
                    action TEXT NOT NULL,
                    changed_at TIMESTAMP DEFAULT (strftime('%s', 'now'))); """)

        for table in ["profiles", "spools"]:
            for action in ["INSERT", "UPDATE", "DELETE"]:
                scheme.append(
                    """ CREATE TRIGGER IF NOT EXISTS {table}_on{action} AFTER {action} ON {table}
                        BEGIN
                            INSERT INTO modifications (table_name, action) VALUES ('{table}','{action}');
                        END; """.format(table=table, action=action))

        self.execute_script("".join(scheme))

    def execute_script(self, script):
        try:
            with self._db_lock, self._db as db:
                db.executescript(script)
                return True
        except sqlite3.Error as error:
            self._log_error(error)
            return False

    # profiles

    def get_all_profiles(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT * FROM profiles ORDER BY material COLLATE NOCASE, vendor COLLATE NOCASE")
                return self._cursor_to_dict(cursor)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_profiles_modifications(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT * FROM modifications WHERE table_name = 'profiles'")
                return self._cursor_to_dict(cursor)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_profile(self, identifier):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT * FROM profiles WHERE id = ?", (identifier,))
                return self._cursor_to_dict(cursor)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def create_profile(self, data):
        try:
            with self._db_lock, self._db as db:
                sql = "INSERT INTO profiles (material, vendor, density, diameter) VALUES (?, ?, ?, ?)"
                cursor = db.execute(sql, (data.get("material", ""), data.get("vendor", ""),
                                          data.get("density", 0), data.get("diameter", 0)))
                data["id"] = cursor.lastrowid
                return data
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def update_profile(self, identifier, data):
        try:
            with self._db_lock, self._db as db:
                sql = "UPDATE profiles SET material = ?, vendor = ?, density = ?, diameter = ? WHERE id = ?"
                db.execute(sql, (data.get("material"), data.get("vendor"), data.get("density"),
                                 data.get("diameter"), identifier))
                return data
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def delete_profile(self, identifier):
        try:
            with self._db_lock, self._db as db:
                db.execute("DELETE FROM profiles WHERE id = ?", (identifier,))
                return True
        except sqlite3.Error as error:
            self._log_error(error)
            return False

    # spools

    def _resolve_foreign_keys_for_spool(self, spool):
        # TODO resolve foreign keys, is there a better way to do this?
        profile = self.get_profile(spool["profile_id"])[0]
        del spool["profile_id"]
        spool["profile"] = profile
        return spool

    def get_all_spools(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute(""" SELECT id, profile_id, name, cost, weight, used, temp_offset FROM spools
                                        ORDER BY name COLLATE NOCASE """)
                result = self._cursor_to_dict(cursor)
            return [self._resolve_foreign_keys_for_spool(row) for row in result]
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_spools_modifications(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT changed_at FROM modifications WHERE table_name = 'spools'")
                return self._cursor_to_dict(cursor)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_spool(self, identifier):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute(""" SELECT id, profile_id, name, cost, weight, used, temp_offset FROM spools
                                        WHERE id = ? """, (identifier,))
                result = self._cursor_to_dict(cursor)
            return [self._resolve_foreign_keys_for_spool(row) for row in result]
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def create_spool(self, data):
        try:
            with self._db_lock, self._db as db:
                sql = "INSERT INTO spools (name, profile_id, cost, weight, used, temp_offset) VALUES (?, ?, ?, ?, ?, ?)"
                cursor = db.execute(sql, (data.get("name", ""), data["profile"].get("id", 0), data.get("cost", 0),
                                    data.get("weight", 0), data.get("used", 0), data.get("temp_offset", 0)))
                data["id"] = cursor.lastrowid
                return data
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def update_spool(self, identifier, data):
        try:
            with self._db_lock, self._db as db:
                db.execute(""" UPDATE spools SET name = ?, profile_id = ?, cost = ?, weight = ?, used = ?,
                               temp_offset = ? WHERE id = ? """, (data.get("name"), data["profile"].get("id"),
                           data.get("cost"), data.get("weight"), data.get("used"), data.get("temp_offset"), identifier))
                return data
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def delete_spool(self, identifier):
        try:
            with self._db_lock, self._db as db:
                db.execute("DELETE FROM spools WHERE id = ?", (identifier,))
                return True
        except sqlite3.Error as error:
            self._log_error(error)
            return False

    # selections

    def _resolve_foreign_keys_for_selection(self, selection):
        # TODO resolve foreign keys, is there a better way to do this?
        if selection["spool_id"] is None:
            spool = None
        else:
            spool = self.get_spool(selection["spool_id"])[0]
        del selection["spool_id"]
        selection["spool"] = spool
        return selection

    def get_all_selections(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT tool, spool_id FROM selections ORDER BY tool")
                result = self._cursor_to_dict(cursor)
            return [self._resolve_foreign_keys_for_selection(row) for row in result]
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_selection(self, identifier):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT tool, spool_id FROM selections WHERE tool = ?", (identifier,))
                result = self._cursor_to_dict(cursor)
            return [self._resolve_foreign_keys_for_selection(row) for row in result]
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def update_selection(self, identifier, data):
        try:
            with self._db_lock, self._db as db:
                    db.execute("INSERT INTO selections (tool, spool_id) VALUES (?, ?)",
                               (identifier, data["spool"]["id"]))
            return self.get_selection(identifier)[0]
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    # helper

    def _cursor_to_dict(self, cursor):
        return [dict((cursor.description[i][0], value) for i, value in enumerate(row))
                for row in cursor.fetchall()]

    def _log_error(self, error):
        self._logger.error("SQL Error: {}".format(error.args[0]))
