# coding=utf-8
import sqlite3

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"


class FilamentManager(object):

    def __init__(self, database, logger):
        self._logger = logger
        self._db_path = database

    def init_database(self):
        scheme = """ CREATE TABLE IF NOT EXISTS profiles (
                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                     name TEXT NOT NULL,
                     cost REAL NOT NULL,
                     weight REAL NOT NULL,
                     density REAL NOT NULL,
                     diameter REAL NOT NULL);

                     CREATE TABLE IF NOT EXISTS spools (
                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                     profile_id INTEGER NOT NULL,
                     name TEXT NOT NULL,
                     used REAL NOT NULL,
                     FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE RESTRICT); """

        try:
            db = sqlite3.connect(self._db_path)
            db.executescript(scheme)
            db.commit()
            return True
        except sqlite3.Error as error:
            self._log_error(error)
            db.rollback()
            return False
        finally:
            db.close()

    def get_all_profiles(self):
        try:
            db = sqlite3.connect(self._db_path)
            cursor = db.execute("SELECT * FROM profiles ORDER BY name COLLATE NOCASE")
            profiles = self._cursor_to_dict(cursor)
            return profiles
        except sqlite3.Error as error:
            self._log_error(error)
            return None
        finally:
            db.close()

    def create_profile(self, data):
        try:
            db = sqlite3.connect(self._db_path)
            sql = "INSERT INTO profiles (name, cost, weight, density, diameter) VALUES (?, ?, ?, ?, ?)"
            db.execute(sql, (data.get("name", ""), data.get("cost", 0), data.get("weight", 0),
                             data.get("density", 0), data.get("diameter", 0)))
            db.commit()
            return True
        except sqlite3.Error as error:
            self._log_error(error)
            db.rollback()
            return False
        finally:
            db.close()

    def update_profile(self, identifier, data):
        try:
            db = sqlite3.connect(self._db_path)
            sql = "UPDATE profiles SET name = ?, cost = ?, weight = ?, density = ?, diameter = ? WHERE id = ?"
            db.execute(sql, (data.get("name"), data.get("cost"), data.get("weight"),
                             data.get("density"), data.get("diameter"), identifier))
            db.commit()
            return True
        except sqlite3.Error as error:
            self._log_error(error)
            db.rollback()
            return False
        finally:
            db.close()

    def delete_profile(self, identifier):
        try:
            db = sqlite3.connect(self._db_path)
            db.execute("PRAGMA foreign_keys = ON")  # prevents deletion if linked spools exist
            db.execute("DELETE FROM profiles WHERE id = ?", (identifier,))
            db.commit()
            return True
        except sqlite3.Error as error:
            self._log_error(error)
            db.rollback()
            return False
        finally:
            db.close()

    def get_all_spools(self):
        try:
            db = sqlite3.connect(self._db_path)
            cursor = db.execute("SELECT * FROM spools ORDER BY name COLLATE NOCASE")
            spools = self._cursor_to_dict(cursor)
            return spools
        except sqlite3.Error as error:
            self._log_error(error)
            return None
        finally:
            db.close()

    def create_spool(self, data):
        try:
            db = sqlite3.connect(self._db_path)
            db.execute("PRAGMA foreign_keys = ON")  # ensures linked profile exists
            sql = "INSERT INTO spools (name, profile_id, used) VALUES (?, ?, ?)"
            db.execute(sql, (data.get("name", ""), data.get("profile_id", 0), data.get("used", 0)))
            db.commit()
            return True
        except sqlite3.Error as error:
            self._log_error(error)
            db.rollback()
            return False
        finally:
            db.close()

    def update_spool(self, identifier, data):
        try:
            db = sqlite3.connect(self._db_path)
            db.execute("PRAGMA foreign_keys = ON")  # ensures linked profile exists
            sql = "UPDATE spools SET name = ?, profile_id = ?, used = ? WHERE id = ?"
            db.execute(sql, (data.get("name"), data.get("profile_id"), data.get("used"), identifier))
            db.commit()
            return True
        except sqlite3.Error as error:
            self._log_error(error)
            db.rollback()
            return False
        finally:
            db.close()

    def delete_spool(self, identifier):
        try:
            db = sqlite3.connect(self._db_path)
            db.execute("DELETE FROM spools WHERE id = ?", (identifier,))
            db.commit()
            return True
        except sqlite3.Error as error:
            self._log_error(error)
            db.rollback()
            return False
        finally:
            db.close()

    def _cursor_to_dict(self, cursor):
        return [dict((cursor.description[i][0], value) for i, value in enumerate(row))
                for row in cursor.fetchall()]

    def _log_error(self, error):
        self._logger.error("SQL Error: {}".format(error.args[0]))
