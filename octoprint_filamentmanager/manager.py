# coding=utf-8

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

import io
import os
from multiprocessing import Lock

from backports import csv
from uritools import uricompose, urisplit
from sqlalchemy import create_engine, event, text
from sqlalchemy.schema import MetaData, Table, Column, ForeignKeyConstraint, DDL
from sqlalchemy.sql import insert, update, delete, select, label
from sqlalchemy.types import INTEGER, VARCHAR, REAL, TIMESTAMP
import sqlalchemy.sql.functions as func


class FilamentManager(object):

    ENGINE_SQLITE = "sqlite"
    ENGINE_POSTGRESQL = "postgresql"

    def __init__(self, uri, database, user, password):
        # QUESTION thread local connection vs sharing a serialized connection, pro/cons?
        # from sqlalchemy.orm import sessionmaker, scoped_session
        # Session = scoped_session(sessionmaker(bind=engine))
        self.lock = Lock()

        uri_parts = urisplit(uri)

        if uri_parts.scheme == self.ENGINE_SQLITE:
            self.engine = create_engine(uri, connect_args={"check_same_thread": False})
            self.conn = self.engine.connect()
            self.conn.execute("PRAGMA foreign_keys = ON")
        elif uri_parts.scheme == self.ENGINE_POSTGRESQL:
            uri = uricompose(scheme=uri_parts.scheme, host=uri_parts.host, port=uri_parts.port,
                             path="/{}".format(database), userinfo="{}:{}".format(user, password))
            self.engine = create_engine(uri)
            self.conn = self.engine.connect()
        else:
            raise ValueError("Engine '{engine}' not supported".format(engine=uri_parts.scheme))

    def init_database(self):
        metadata = MetaData()

        self.profiles = Table("profiles", metadata,
                              Column("id", INTEGER, primary_key=True, autoincrement=True),
                              Column("vendor", VARCHAR(255), nullable=False, server_default=""),
                              Column("material", VARCHAR(255), nullable=False, server_default=""),
                              Column("density", REAL, nullable=False, server_default="0"),
                              Column("diameter", REAL, nullable=False, server_default="0"))

        self.spools = Table("spools", metadata,
                            Column("id", INTEGER, primary_key=True, autoincrement=True),
                            Column("profile_id", INTEGER, nullable=False),
                            Column("name", VARCHAR(255), nullable=False, server_default=""),
                            Column("cost", REAL, nullable=False, server_default="0"),
                            Column("weight", REAL, nullable=False, server_default="0"),
                            Column("used", REAL, nullable=False, server_default="0"),
                            Column("temp_offset", INTEGER, nullable=False, server_default="0"),
                            ForeignKeyConstraint(["profile_id"], ["profiles.id"], ondelete="RESTRICT"))

        self.selections = Table("selections", metadata,
                                Column("tool", INTEGER, primary_key=True, autoincrement=False),
                                Column("spool_id", INTEGER),
                                ForeignKeyConstraint(["spool_id"], ["spools.id"], ondelete="CASCADE"))

        self.versioning = Table("versioning", metadata,
                                Column("schema_id", INTEGER, primary_key=True, autoincrement=False))

        self.modifications = Table("modifications", metadata,
                                   Column("table_name", VARCHAR(255), nullable=False, primary_key=True),
                                   Column("action", VARCHAR(255), nullable=False),
                                   Column("changed_at", TIMESTAMP, nullable=False,
                                          server_default=text("CURRENT_TIMESTAMP")))

        for table in ["profiles", "spools"]:
            for action in ["INSERT", "UPDATE", "DELETE"]:
                event.listen(metadata, "after_create",
                             DDL(""" CREATE TRIGGER IF NOT EXISTS {table}_on{action}
                                     AFTER {action} ON {table} FOR EACH ROW
                                     BEGIN
                                         REPLACE INTO modifications (table_name, action) VALUES ('{table}','{action}');
                                     END; """.format(table=table, action=action)))

        metadata.create_all(self.conn, checkfirst=True)

    def execute_script(self, script):
        with self.lock, self.conn.begin():
            for stmt in script.split(";"):
                self.conn.execute(text(stmt))

    # profiles

    def get_all_profiles(self):
        with self.lock, self.conn.begin():
            stmt = select([self.profiles]).order_by(self.profiles.c.material, self.profiles.c.vendor)
            result = self.conn.execute(stmt)
        return self._result_to_dict(result)

    def get_profiles_modifications(self):
        with self.lock, self.conn.begin():
            stmt = select([self.modifications.c.changed_at]).where(self.modifications.c.table_name == "profiles")
            result = self.conn.execute(stmt)
        return self._result_to_dict(result, one=True)

    def get_profile(self, identifier):
        with self.lock, self.conn.begin():
            stmt = select([self.profiles]).where(self.profiles.c.id == identifier)\
                .order_by(self.profiles.c.material, self.profiles.c.vendor)
            result = self.conn.execute(stmt)
        return self._result_to_dict(result, one=True)

    def create_profile(self, data):
        with self.lock, self.conn.begin():
            stmt = insert(self.profiles)\
                .values(vendor=data["vendor"], material=data["material"], density=data["density"],
                        diameter=data["diameter"])
            result = self.conn.execute(stmt)
        data["id"] = result.lastrowid
        return data

    def update_profile(self, identifier, data):
        with self.lock, self.conn.begin():
            stmt = update(self.profiles).where(self.profiles.c.id == identifier)\
                .values(vendor=data["vendor"], material=data["material"], density=data["density"],
                        diameter=data["diameter"])
            self.conn.execute(stmt)
        return data

    def delete_profile(self, identifier):
        with self.lock, self.conn.begin():
            stmt = delete(self.profiles).where(self.profiles.c.id == identifier)
            self.conn.execute(stmt)

    # spools

    def _build_spool_dict(self, row, column_names):
        spool = dict(profile=dict())
        for i, value in enumerate(row):
            if i < len(self.spools.columns):
                spool[column_names[i]] = value
            else:
                spool["profile"][column_names[i]] = value
        del spool["profile_id"]
        return spool

    def get_all_spools(self):
        with self.lock, self.conn.begin():
            j = self.spools.join(self.profiles, self.spools.c.profile_id == self.profiles.c.id)
            stmt = select([self.spools, self.profiles]).select_from(j).order_by(self.spools.c.name)
            result = self.conn.execute(stmt)
        return [self._build_spool_dict(row, row.keys()) for row in result.fetchall()]

    def get_spools_modifications(self):
        with self.lock, self.conn.begin():
            stmt = select([func.max(self.modifications.c.changed_at).label("changed_at")])\
                .where(self.modifications.c.table_name.in_(["spools", "profiles"]))
            result = self.conn.execute(stmt)
        return self._result_to_dict(result, one=True)

    def get_spool(self, identifier):
        with self.lock, self.conn.begin():
            j = self.spools.join(self.profiles, self.spools.c.profile_id == self.profiles.c.id)
            stmt = select([self.spools, self.profiles]).select_from(j)\
                .where(self.spools.c.id == identifier).order_by(self.spools.c.name)
            result = self.conn.execute(stmt)
        row = result.fetchone()
        return self._build_spool_dict(row, row.keys()) if row is not None else None

    def create_spool(self, data):
        with self.lock, self.conn.begin():
            stmt = insert(self.spools)\
                .values(name=data["name"], cost=data["cost"], weight=data["weight"], used=data["used"],
                        temp_offset=data["temp_offset"], profile_id=data["profile"]["id"])
            result = self.conn.execute(stmt)
        data["id"] = result.lastrowid
        return data

    def update_spool(self, identifier, data):
        with self.lock, self.conn.begin():
            stmt = update(self.spools).where(self.spools.c.id == identifier)\
                .values(name=data["name"], cost=data["cost"], weight=data["weight"], used=data["used"],
                        temp_offset=data["temp_offset"], profile_id=data["profile"]["id"])
            self.conn.execute(stmt)
        return data

    def delete_spool(self, identifier):
        with self.lock, self.conn.begin():
            stmt = delete(self.spools).where(self.spools.c.id == identifier)
            self.conn.execute(stmt)

    # selections

    def _build_selection_dict(self, row, column_names):
        sel = dict(spool=dict(profile=dict()))
        for i, value in enumerate(row):
            if i < len(self.selections.columns):
                sel[column_names[i]] = value
            elif i < len(self.selections.columns)+len(self.spools.columns):
                sel["spool"][column_names[i]] = value
            else:
                sel["spool"]["profile"][column_names[i]] = value
        del sel["spool_id"]
        del sel["spool"]["profile_id"]
        return sel

    def get_all_selections(self):
        with self.lock, self.conn.begin():
            j1 = self.selections.join(self.spools, self.selections.c.spool_id == self.spools.c.id)
            j2 = j1.join(self.profiles, self.spools.c.profile_id == self.profiles.c.id)
            stmt = select([self.selections, self.spools, self.profiles]).select_from(j2)\
                .order_by(self.selections.c.tool)
        result = self.conn.execute(stmt)
        return [self._build_selection_dict(row, row.keys()) for row in result.fetchall()]

    def get_selection(self, identifier):
        with self.lock, self.conn.begin():
            j1 = self.selections.join(self.spools, self.selections.c.spool_id == self.spools.c.id)
            j2 = j1.join(self.profiles, self.spools.c.profile_id == self.profiles.c.id)
            stmt = select([self.selections, self.spools, self.profiles]).select_from(j2)\
                .where(self.selections.c.tool == identifier)
        result = self.conn.execute(stmt)
        row = result.fetchone()
        return self._build_selection_dict(row, row.keys()) if row is not None else dict(tool=identifier, spool=None)

    def update_selection(self, identifier, data):
        with self.lock, self.conn.begin():
            self.conn.execute(text("REPLACE INTO selections (tool, spool_id) VALUES (:tool, :spool_id)"),
                              tool=identifier, spool_id=data["spool"]["id"])
        return self.get_selection(identifier)

    def export_data(self, dirpath):
        def to_csv(table):
            with self.lock, self.conn.begin():
                result = self.conn.execute(select([table]))
                filepath = os.path.join(dirpath, table.name + ".csv")
                with io.open(filepath, mode="w", encoding="utf-8") as csv_file:
                    csv_writer = csv.writer(csv_file)
                    csv_writer.writerow(table.columns.keys())
                    csv_writer.writerows(result)

        tables = [self.profiles, self.spools]
        for t in tables:
            to_csv(t)

    def import_data(self, dirpath):
        def from_csv(table):
            filepath = os.path.join(dirpath, table.name + ".csv")
            with io.open(filepath, mode="r", encoding="utf-8") as csv_file:
                csv_reader = csv.reader(csv_file)
                header = next(csv_reader)
                equal_column_order = (header == table.columns.keys())
                with self.lock, self.conn.begin():
                    for row in csv_reader:
                        values = row if equal_column_order else dict(zip(header, row))
                        self.conn.execute(insert(table).prefix_with("OR IGNORE").values(values))

        tables = [self.profiles, self.spools]
        for t in tables:
            from_csv(t)

    # helper

    def _result_to_dict(self, result, one=False):
        if one:
            row = result.fetchone()
            return dict(row) if row is not None else None
        else:
            return [dict(row) for row in result.fetchall()]
