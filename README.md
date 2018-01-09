# OctoPrint-FilamentManager

This OctoPrint plugin helps to manage your filament spools. The project is still under heavy development. So don't rely on it and use it at your own risk. I'm grateful for all reports that help me to track down bugs.

If you have questions or encounter issues please take a look at the [Frequently Asked Questions](https://github.com/malnvenshorn/OctoPrint-FilamentManager/wiki#faq) first. There might be already an answer. In case you haven't found what you are looking for, feel free to open a [ticket](https://github.com/malnvenshorn/OctoPrint-FilamentManager/issues/new) and I'll try to help.

## Features

* Replacing filament volume with weight in sidebar
* Software odometer to measure used filament
* Warn if print exceeds remaining filament on spool
* Assign temperature offset to spools
* Automatically pause print if filament runs out
* Import & export of spool inventory
* Support for PostgreSQL as database for multiple instances

## Setup

1. Install this plugin via the bundled [Plugin Manager](https://github.com/foosel/OctoPrint/wiki/Plugin:-Plugin-Manager)
or manually using this URL:

    `https://github.com/malnvenshorn/OctoPrint-FilamentManager/archive/master.zip`

1. For PostgreSQL support you need to install an additional dependency:

    `pip install psycopg2`

## Screenshots

![FilamentManager Sidebar](screenshots/filamentmanager_sidebar.png?raw=true)

![FilamentManager Settings Profile](screenshots/filamentmanager_settings_profile.png?raw=true)

![FilamentManager Settings Spool](screenshots/filamentmanager_settings_spool.png?raw=true)

![FilamentManager Settings](screenshots/filamentmanager_settings.png?raw=true)
