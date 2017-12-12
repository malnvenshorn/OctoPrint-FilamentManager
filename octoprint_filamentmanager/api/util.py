# coding=utf-8
from __future__ import absolute_import

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"

import hashlib
from werkzeug.http import http_date


def add_revalidation_header_with_no_max_age(response, lm, etag):
    response.set_etag(etag)
    response.headers["Last-Modified"] = http_date(lm)
    response.headers["Cache-Control"] = "max-age=0"
    return response


def entity_tag(lm):
    return (hashlib.sha1(str(lm))).hexdigest()
