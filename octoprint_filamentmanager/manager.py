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

    def get_all_spools(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT * FROM spools ORDER BY name COLLATE NOCASE")
                return self._cursor_to_dict(cursor)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_spools_modifications(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT * FROM modifications WHERE table_name = 'spools'")
                return self._cursor_to_dict(cursor)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_spool(self, identifier):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT * FROM spools WHERE id = ?", (identifier,))
                return self._cursor_to_dict(cursor)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def create_spool(self, data):
        try:
            with self._db_lock, self._db as db:
                sql = "INSERT INTO spools (name, profile_id, cost, weight, used) VALUES (?, ?, ?, ?, ?)"
                cursor = db.execute(sql, (data.get("name", ""), data.get("profile_id", 0), data.get("cost", 0),
                                    data.get("weight", 0), data.get("used", 0)))
                data["id"] = cursor.lastrowid
                return data
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def update_spool(self, identifier, data):
        try:
            with self._db_lock, self._db as db:
                sql = "UPDATE spools SET name = ?, profile_id = ?, cost = ?, weight = ?, used = ? WHERE id = ?"
                db.execute(sql, (data.get("name"), data.get("profile_id"), data.get("cost"),
                                 data.get("weight"), data.get("used"), identifier))
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

    def _cursor_to_dict(self, cursor):
        return [dict((cursor.description[i][0], value) for i, value in enumerate(row))
                for row in cursor.fetchall()]

    def _log_error(self, error):
        self._logger.error("SQL Error: {}".format(error.args[0]))
