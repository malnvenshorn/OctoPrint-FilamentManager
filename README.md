# OctoPrint-FilamentManager

This OctoPrint plugin makes it easy to manage your inventory of filament spools. You can add all your spools and assign them to print jobs. The Filament Manager will automatically track the amount of extruded filament so you can always see how much is left on your spools.

If you have questions or encounter issues please take a look at the [Frequently Asked Questions](https://github.com/malnvenshorn/OctoPrint-FilamentManager/wiki#faq) first. There might be already an answer. In case you haven't found what you are looking for, feel free to open a [ticket](https://github.com/malnvenshorn/OctoPrint-FilamentManager/issues/new) and I'll try to help. Since OctoPrint provides an own [community forum](https://discourse.octoprint.org/) questions and requests for help should be placed there.

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

    `https://github.com/oschwartz10612/OctoPrint-FilamentManager/archive/master.zip`

1. For PostgreSQL support you need to install an additional dependency:

    `pip install psycopg2`

## Screenshots

![FilamentManager Sidebar](screenshots/filamentmanager_sidebar.png?raw=true)

![FilamentManager Settings Profile](screenshots/filamentmanager_settings_profile.png?raw=true)

![FilamentManager Settings Spool](screenshots/filamentmanager_settings_spool.png?raw=true)

![FilamentManager Settings](screenshots/filamentmanager_settings.png?raw=true)
