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
                cursor = db.execute(""" SELECT id, vendor, material, density, diameter
                                        FROM profiles ORDER BY material COLLATE NOCASE, vendor COLLATE NOCASE """)
            return self._cursor_to_dict(cursor)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_profiles_modifications(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT changed_at FROM modifications WHERE table_name = 'profiles'")
                return self._cursor_to_dict(cursor, one=True)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_profile(self, identifier):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute(""" SELECT id, vendor, material, density, diameter
                                        FROM profiles WHERE id = ?
                                        ORDER BY material COLLATE NOCASE, vendor COLLATE NOCASE """, (identifier,))
            return self._cursor_to_dict(cursor, one=True)
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

    def _build_spool_dict(self, row, column_names):
        spool = dict(profile=dict())
        for i, value in enumerate(row):
            if i < 6:
                spool[column_names[i][0]] = value
            else:
                spool["profile"][column_names[i][0]] = value
        return spool

    def get_all_spools(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute(""" SELECT s.id, s.name, s.cost, s.weight, s.used, s.temp_offset,
                                               p.id, p.vendor, p.material, p.density, p.diameter
                                        FROM spools AS s, profiles AS p WHERE s.profile_id = p.id
                                        ORDER BY s.name COLLATE NOCASE """)
            return [self._build_spool_dict(row, cursor.description) for row in cursor.fetchall()]
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_spools_modifications(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute("SELECT changed_at FROM modifications WHERE table_name = 'spools'")
                return self._cursor_to_dict(cursor, one=True)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_spool(self, identifier):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute(""" SELECT s.id, s.name, s.cost, s.weight, s.used, s.temp_offset,
                                               p.id, p.vendor, p.material, p.density, p.diameter
                                        FROM spools AS s, profiles AS p WHERE s.profile_id = p.id
                                        AND s.id = ? """, (identifier,))
            result = cursor.fetchone()
            return self._build_spool_dict(result, cursor.description) if result is not None else dict()
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

    def _build_selection_dict(self, row, column_names):
        selection = dict(spool=dict(profile=dict()))
        for i, value in enumerate(row):
            if i < 1:
                selection[column_names[i][0]] = value
            if i < 7:
                selection["spool"][column_names[i][0]] = value
            else:
                selection["spool"]["profile"][column_names[i][0]] = value
        return selection

    def get_all_selections(self):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute(""" SELECT t.tool, s.id, s.name, s.cost, s.weight, s.used, s.temp_offset,
                                               p.id, p.vendor, p.material, p.density, p.diameter
                                        FROM selections AS t, spools AS s, profiles AS p
                                        WHERE t.spool_id = s.id AND s.profile_id = p.id ORDER BY tool """)
            return [self._build_selection_dict(row, cursor.description) for row in cursor.fetchall()]
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def get_selection(self, identifier):
        try:
            with self._db_lock, self._db as db:
                cursor = db.execute(""" SELECT t.tool, s.id, s.name, s.cost, s.weight, s.used, s.temp_offset,
                                               p.id, p.vendor, p.material, p.density, p.diameter
                                        FROM selections AS t, spools AS s, profiles AS p
                                        WHERE t.spool_id = s.id AND s.profile_id = p.id
                                        AND t.tool = ? """, (identifier,))
            result = cursor.fetchone()
            if result is not None:
                return self._build_selection_dict(result, cursor.description)
            else:
                return dict(tool=identifier, spool=None)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    def update_selection(self, identifier, data):
        try:
            with self._db_lock, self._db as db:
                    db.execute("INSERT INTO selections (tool, spool_id) VALUES (?, ?)",
                               (identifier, data["spool"]["id"]))
            return self.get_selection(identifier)
        except sqlite3.Error as error:
            self._log_error(error)
            return None

    # helper

    def _cursor_to_dict(self, cursor, one=False):
        if one:
            result = cursor.fetchone()
            if result is not None:
                return dict((cursor.description[i][0], value) for i, value in enumerate(result))
            else:
                return dict()
        else:
            return [dict((cursor.description[i][0], value) for i, value in enumerate(row))
                    for row in cursor.fetchall()]

    def _log_error(self, error):
        self._logger.error("SQL Error: {}".format(error.args[0]))
