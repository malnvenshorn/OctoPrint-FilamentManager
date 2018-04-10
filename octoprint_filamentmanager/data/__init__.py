# coding=utf-8

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

import io
import os
from multiprocessing import Lock

from backports import csv
from uritools import urisplit
from sqlalchemy.engine.url import URL
from sqlalchemy import create_engine, event, text
from sqlalchemy.schema import MetaData, Table, Column, ForeignKeyConstraint, DDL, PrimaryKeyConstraint
from sqlalchemy.sql import insert, update, delete, select
from sqlalchemy.types import INTEGER, VARCHAR, REAL, TIMESTAMP
from sqlalchemy.dialects.postgresql import insert as pg_insert
import sqlalchemy.sql.functions as func

from .listen import PGNotify


class FilamentManager(object):

    DIALECT_SQLITE = "sqlite"
    DIALECT_POSTGRESQL = "postgresql"

    def __init__(self, config):
        self.notify = None
        self.conn = self.connect(config.get("uri", ""),
                                 database=config.get("name", ""),
                                 username=config.get("user", ""),
                                 password=config.get("password", ""))

        # QUESTION thread local connection (pool) vs sharing a serialized connection, pro/cons?
        # from sqlalchemy.orm import sessionmaker, scoped_session
        # Session = scoped_session(sessionmaker(bind=engine))
        # when using a connection pool how do we prevent notifiying ourself on database changes?
        self.lock = Lock()

        if self.engine_dialect_is(self.DIALECT_SQLITE):
            # Enable foreign key constraints
            self.conn.execute(text("PRAGMA foreign_keys = ON").execution_options(autocommit=True))
        elif self.engine_dialect_is(self.DIALECT_POSTGRESQL):
            # Create listener thread
            self.notify = PGNotify(self.conn.engine.url)

    def connect(self, uri, database="", username="", password=""):
        uri_parts = urisplit(uri)

        if uri_parts.scheme == self.DIALECT_SQLITE:
            engine = create_engine(uri, connect_args={"check_same_thread": False})
        elif uri_parts.scheme == self.DIALECT_POSTGRESQL:
            uri = URL(drivername=uri_parts.scheme,
                      host=uri_parts.host,
                      port=uri_parts.getport(default=5432),
                      database=database,
                      username=username,
                      password=password)
            engine = create_engine(uri)
        else:
            raise ValueError("Engine '{engine}' not supported".format(engine=uri_parts.scheme))

        return engine.connect()

    def close(self):
        self.conn.close()

    def engine_dialect_is(self, dialect):
        return self.conn.engine.dialect.name == dialect if self.conn is not None else False

    def initialize(self):
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
                                Column("tool", INTEGER,),
                                Column("client_id", VARCHAR(36)),
                                Column("spool_id", INTEGER),
                                PrimaryKeyConstraint("tool", "client_id", name="selections_pkey"),
                                ForeignKeyConstraint(["spool_id"], ["spools.id"], ondelete="CASCADE"))

        self.versioning = Table("versioning", metadata,
                                Column("schema_id", INTEGER, primary_key=True, autoincrement=False))

        self.modifications = Table("modifications", metadata,
                                   Column("table_name", VARCHAR(255), nullable=False, primary_key=True),
                                   Column("action", VARCHAR(255), nullable=False),
                                   Column("changed_at", TIMESTAMP, nullable=False,
                                          server_default=text("CURRENT_TIMESTAMP")))

        if self.engine_dialect_is(self.DIALECT_POSTGRESQL):
            def should_create_function(name):
                row = self.conn.execute("select proname from pg_proc where proname = '%s'" % name).scalar()
                return not bool(row)

            def should_create_trigger(name):
                row = self.conn.execute("select tgname from pg_trigger where tgname = '%s'" % name).scalar()
                return not bool(row)

            trigger_function = DDL("""
                                   CREATE FUNCTION update_lastmodified()
                                   RETURNS TRIGGER AS $func$
                                   BEGIN
                                       INSERT INTO modifications (table_name, action, changed_at)
                                       VALUES(TG_TABLE_NAME, TG_OP, CURRENT_TIMESTAMP)
                                       ON CONFLICT (table_name) DO UPDATE
                                       SET action=TG_OP, changed_at=CURRENT_TIMESTAMP
                                       WHERE modifications.table_name=TG_TABLE_NAME;
                                       PERFORM pg_notify(TG_TABLE_NAME, TG_OP);
                                       RETURN NULL;
                                   END;
                                   $func$ LANGUAGE plpgsql;
                                   """)

            if should_create_function("update_lastmodified"):
                event.listen(metadata, "after_create", trigger_function)

            for table in [self.profiles.name, self.spools.name]:
                for action in ["INSERT", "UPDATE", "DELETE"]:
                    name = "{table}_on_{action}".format(table=table, action=action.lower())
                    trigger = DDL("""
                                  CREATE TRIGGER {name} AFTER {action} on {table}
                                  FOR EACH ROW EXECUTE PROCEDURE update_lastmodified()
                                  """.format(name=name, table=table, action=action))
                    if should_create_trigger(name):
                        event.listen(metadata, "after_create", trigger)

        elif self.engine_dialect_is(self.DIALECT_SQLITE):
            for table in [self.profiles.name, self.spools.name]:
                for action in ["INSERT", "UPDATE", "DELETE"]:
                    name = "{table}_on_{action}".format(table=table, action=action.lower())
                    trigger = DDL("""
                                  CREATE TRIGGER IF NOT EXISTS {name} AFTER {action} on {table}
                                  FOR EACH ROW BEGIN
                                      REPLACE INTO modifications (table_name, action) VALUES ('{table}','{action}');
                                  END
                                  """.format(name=name, table=table, action=action))
                    event.listen(metadata, "after_create", trigger)

        metadata.create_all(self.conn, checkfirst=True)

    def execute_script(self, script):
        with self.lock, self.conn.begin():
            for stmt in script.split(";"):
                self.conn.execute(text(stmt))

    # versioning

    def get_schema_version(self):
        with self.lock, self.conn.begin():
            return self.conn.execute(select([func.max(self.versioning.c.schema_id)])).scalar()

    def set_schema_version(self, version):
        with self.lock, self.conn.begin():
            self.conn.execute(insert(self.versioning).values((version,)))
            self.conn.execute(delete(self.versioning).where(self.versioning.c.schema_id < version))

    # profiles

    def get_all_profiles(self):
        with self.lock, self.conn.begin():
            stmt = select([self.profiles]).order_by(self.profiles.c.material, self.profiles.c.vendor)
            result = self.conn.execute(stmt)
        return self._result_to_dict(result)

    def get_profiles_lastmodified(self):
        with self.lock, self.conn.begin():
            stmt = select([self.modifications.c.changed_at]).where(self.modifications.c.table_name == "profiles")
            return self.conn.execute(stmt).scalar()

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

    def get_spools_lastmodified(self):
        with self.lock, self.conn.begin():
            stmt = select([func.max(self.modifications.c.changed_at)])\
                .where(self.modifications.c.table_name.in_(["spools", "profiles"]))
            return self.conn.execute(stmt).scalar()

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

    def get_all_selections(self, client_id):
        with self.lock, self.conn.begin():
            j1 = self.selections.join(self.spools, self.selections.c.spool_id == self.spools.c.id)
            j2 = j1.join(self.profiles, self.spools.c.profile_id == self.profiles.c.id)
            stmt = select([self.selections, self.spools, self.profiles]).select_from(j2)\
                .where(self.selections.c.client_id == client_id).order_by(self.selections.c.tool)
        result = self.conn.execute(stmt)
        return [self._build_selection_dict(row, row.keys()) for row in result.fetchall()]

    def get_selection(self, identifier, client_id):
        with self.lock, self.conn.begin():
            j1 = self.selections.join(self.spools, self.selections.c.spool_id == self.spools.c.id)
            j2 = j1.join(self.profiles, self.spools.c.profile_id == self.profiles.c.id)
            stmt = select([self.selections, self.spools, self.profiles]).select_from(j2)\
                .where((self.selections.c.tool == identifier) & (self.selections.c.client_id == client_id))
        result = self.conn.execute(stmt)
        row = result.fetchone()
        return self._build_selection_dict(row, row.keys()) if row is not None else dict(tool=identifier, spool=None)

    def update_selection(self, identifier, client_id, data):
        with self.lock, self.conn.begin():
            values = dict()
            if self.engine_dialect_is(self.DIALECT_SQLITE):
                stmt = insert(self.selections).prefix_with("OR REPLACE")\
                    .values(tool=identifier, client_id=client_id, spool_id=data["spool"]["id"])
            elif self.engine_dialect_is(self.DIALECT_POSTGRESQL):
                stmt = pg_insert(self.selections)\
                    .values(tool=identifier, client_id=client_id, spool_id=data["spool"]["id"])\
                    .on_conflict_do_update(constraint="selections_pkey", set_=dict(spool_id=data["spool"]["id"]))
            self.conn.execute(stmt)
        return self.get_selection(identifier, client_id)

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
                with self.lock, self.conn.begin():
                    for row in csv_reader:
                        values = dict(zip(header, row))

                        if self.engine_dialect_is(self.DIALECT_SQLITE):
                            identifier = values[table.c.id.name]
                            # try to update entry
                            stmt = update(table).values(values).where(table.c.id == identifier)
                            if self.conn.execute(stmt).rowcount == 0:
                                # identifier doesn't match any => insert new entry
                                stmt = insert(table).values(values)
                                self.conn.execute(stmt)
                        elif self.engine_dialect_is(self.DIALECT_POSTGRESQL):
                            stmt = pg_insert(table).values(values)\
                                .on_conflict_do_update(index_elements=[table.c.id], set_=values)
                            self.conn.execute(stmt)

                    if self.engine_dialect_is(self.DIALECT_POSTGRESQL):
                        # update sequence
                        sql = "SELECT setval('{table}_id_seq', max(id)) FROM {table}".format(table=table.name)
                        self.conn.execute(text(sql))

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
