# coding=utf-8

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

from threading import Thread
from select import select as wait_ready
from sqlalchemy import create_engine, text


class PGNotify(object):

    def __init__(self, uri):
        self.subscriber = list()

        engine = create_engine(uri)
        conn = engine.connect()
        conn.execute(text("LISTEN profiles; LISTEN spools;").execution_options(autocommit=True))

        notify_thread = Thread(target=self.notify, args=(conn,))
        notify_thread.daemon = True
        notify_thread.start()

    def notify(self, conn):
        while True:
            if wait_ready([conn.connection], [], [], 5) != ([], [], []):
                conn.connection.poll()
                while conn.connection.notifies:
                    notify = conn.connection.notifies.pop()
                    for func in self.subscriber:
                        func(pid=notify.pid, channel=notify.channel, payload=notify.payload)

    def subscribe(self, func):
        self.subscriber.append(func)

    def unsubscribe(self, func):
        self.subscriber.remove(func)
