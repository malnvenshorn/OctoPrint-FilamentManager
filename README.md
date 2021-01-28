# OctoPrint-FilamentManager

## UNDER NEW MANAGEMENT

    Hi everybody,
    because there was no activtiy in the last month on the origial GitHub-Repository from @malnvenshorn,
    the community decided to find a new home of this OctoPrint-Plugin and here it is ;-)
    See https://github.com/OctoPrint/plugins.octoprint.org/issues/471 for more details

    What is my roadmap/stratagy of "hosting" this plugin?
    - First: Plugin should run under the latest versions of python and OctoPrint
    - Analysing/fixing issues that prevent using the plugin
    - An open mind for new ideas....
    - ...but if the effort to implement new features is to height, then it will probably be implemented in my SpoolManager-Plugin
     (https://github.com/OllisGit/OctoPrint-SpoolManager)
    - ...also I will move more and more features from FilamentManager to SpoolManager (e.g. external Database, MultiTool, ...)


# Overview

[![Version](https://img.shields.io/badge/dynamic/json.svg?color=brightgreen&label=version&url=https://api.github.com/repos/OllisGit/OctoPrint-FilamentManager/releases&query=$[0].name)]()
[![Released](https://img.shields.io/badge/dynamic/json.svg?color=brightgreen&label=released&url=https://api.github.com/repos/OllisGit/OctoPrint-FilamentManager/releases&query=$[0].published_at)]()
![GitHub Releases (by Release)](https://img.shields.io/github/downloads/OllisGit/OctoPrint-FilamentManager/latest/total.svg)

This OctoPrint plugin makes it easy to manage your inventory of filament spools. You can add all your spools and assign them to print jobs. The Filament Manager will automatically track the amount of extruded filament so you can always see how much is left on your spools.

If you have questions or encounter issues please take a look at the [Frequently Asked Questions](https://github.com/OllisGit/OctoPrint-FilamentManager/wiki#faq) first. There might be already an answer.
In case you haven't found what you are looking for, feel free to open a [ticket](https://github.com/OllisGit/OctoPrint-FilamentManager/issues/new/choose) and I'll try to help.
Or ask questions and requests for help in the community forum [community forum](https://community.octoprint.org/).

#### Support my Efforts

This plugin, as well as my [other plugins](https://github.com/OllisGit/) were developed in my spare time.
If you like it, I would be thankful about a cup of coffee :)

[![More coffee, more code](https://img.shields.io/badge/Donate-PayPal-green.svg)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=6SW5R6ZUKLB5E&source=url)


## Features

* Software odometer to track amount of extruded filament
* Warns you if the selected spool has not enugh filament left for the print job
* Automatically pause print if filament runs out
* Apply temperature offsets assigned to spools
* Import & export of your spool inventory
* Support for PostgreSQL (>=9.5) as common database for multiple OctoPrint instances

## Setup

1. Install this plugin via the bundled [Plugin Manager](https://github.com/foosel/OctoPrint/wiki/Plugin:-Plugin-Manager)
or manually using this URL:

    `https://github.com/OllisGit/OctoPrint-FilamentManager/releases/latest/download/master.zip`

1. For PostgreSQL support you need to install an additional dependency:

    `pip install psycopg2`

## Screenshots

![FilamentManager Sidebar](screenshots/filamentmanager_sidebar.png?raw=true)

![FilamentManager Settings Profile](screenshots/filamentmanager_settings_profile.png?raw=true)

![FilamentManager Settings Spool](screenshots/filamentmanager_settings_spool.png?raw=true)

![FilamentManager Settings](screenshots/filamentmanager_settings.png?raw=true)
