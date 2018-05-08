# coding=utf-8
from __future__ import absolute_import

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"


class Dialect(object):
    postgresql = 'postgresql'
    sqlite = 'sqlite'

    @staticmethod
    def all():
        return [Dialect.postgresql, Dialect.sqlite]
