# coding=utf-8
import re

__author__ = "Sven Lohrmann <malnvenshorn@gmail.com>"
__license__ = "GNU Affero General Public License http://www.gnu.org/licenses/agpl.html"
__copyright__ = "Copyright (C) 2017 Sven Lohrmann - Released under terms of the AGPLv3 License"


class FilamentOdometer(object):

    def __init__(self):
        self.regexE = re.compile(r'.*E(\d+(\.\d+)?)')
        self.regexT = re.compile(r'^T(\d+)')
        self.reset()

    def reset(self):
        self.relativeMode = False
        self.relativeExtrusion = False
        self.lastExtrusion = [0.0]
        self.totalExtrusion = [0.0]
        self.maxExtrusion = [0.0]
        self.currentTool = 0

    def parse(self, gcode, cmd):
        if gcode == "G1" or gcode == "G0":  # move
            e = self._get_float(cmd, self.regexE)
            if e is not None:
                if not self.relativeMode and not self.relativeExtrusion:
                    e -= self.lastExtrusion[self.currentTool]
                self.totalExtrusion[self.currentTool] += e
                self.lastExtrusion[self.currentTool] += e
                self.maxExtrusion[self.currentTool] = max(self.maxExtrusion[self.currentTool],
                                                          self.totalExtrusion[self.currentTool])
        elif gcode == "G90":  # set to absolute positioning
            self.relativeMode = False
        elif gcode == "G91":  # set to relative positioning
            self.relativeMode = True
        elif gcode == "G92":  # set position
            e = self._get_float(cmd, self.regexE)
            if e is not None:
                self.lastExtrusion[self.currentTool] = e
        elif gcode == "M82":  # set extruder to absolute mode
            relativeExtrusion = False
        elif gcode == "M83":  # set extruder to relative mode
            relativeExtrusion = True
        elif gcode.startswith("T"):  # select tool
            t = self._get_int(cmd, self.regexT)
            if t is not None:
                self.currentTool = t
                if len(self.lastExtrusion) <= self.currentTool:
                    for i in range(len(self.lastExtrusion), self.currentTool + 1):
                        self.lastExtrusion.append(0.0)
                        self.totalExtrusion.append(0.0)
                        self.maxExtrusion.append(0.0)

    def get_values(self):
        return self.maxExtrusion

    def _get_int(self, cmd, regex):
        result = regex.match(cmd)
        if result is not None:
            return int(result.group(1))
        else:
            return None

    def _get_float(self, cmd, regex):
        result = regex.match(cmd)
        if result is not None:
            return float(result.group(1))
        else:
            return None
