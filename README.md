# OctoPrint-FilamentManager

This OctoPrint plugin helps to manage your filament spools. The project is still under heavy development. So don't rely on it and use it at your own risk. I'm grateful for all reports that help me to track down bugs.

## Additional features

* Replacing filament volume with weight in sidebar
* Filament odometer to keep track of remaining filament on spool
* Enable warning if print exceeds remaining filament on spool
* Assign temperature offset to spools

## FAQ

[Odometer feature doesn't work when printing from SD](https://github.com/malnvenshorn/OctoPrint-FilamentManager#odometer-feature-doesnt-work-when-printing-from-sd)<br>
[My profiles/spools will not be loaded](https://github.com/malnvenshorn/OctoPrint-FilamentManager#my-profilesspools-will-not-be-loaded)<br>
[Is it possible to change the location of the plugin in the sidebar?](https://github.com/malnvenshorn/OctoPrint-FilamentManager#is-it-possible-to-change-the-location-of-the-plugin-in-the-sidebar)<br>
[How do I install the latest development version?](https://github.com/malnvenshorn/OctoPrint-FilamentManager#how-do-i-install-the-latest-development-version)

##

#### Odometer feature doesn't work when printing from SD

Due to how this feature works it is not possible to count the used filament in this case.

#### My profiles/spools will not be loaded

Try to clear your browser cache and reload the page.

#### Is it possible to change the location of the plugin in the sidebar?

You can reorder the items in the sidebar in the [config.yaml](http://docs.octoprint.org/en/master/configuration/config_yaml.html#appearance). E.g. to put the filament selection below the printer state add the following to your config:

```
appearance:
  components:
    order:
      sidebar:
      - connection
      - state
      - plugin_filamentmanager
```

#### How do I install the latest development version?

You can install it using the folowing link 

`https://github.com/malnvenshorn/OctoPrint-FilamentManager/archive/develop.zip`

## Screenshots

![FilamentManager Sidebar](screenshots/filamentmanager_sidebar.png?raw=true)

![FilamentManager Settings Profile](screenshots/filamentmanager_settings_profile.png?raw=true)

![FilamentManager Settings Spool](screenshots/filamentmanager_settings_spool.png?raw=true)

![FilamentManager Settings](screenshots/filamentmanager_settings.png?raw=true)
