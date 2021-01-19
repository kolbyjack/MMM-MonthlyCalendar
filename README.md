# Module: MMM-MonthlyCalendar
The module allows you to view your calendar events in a monthly calendar view.

## Installation

In your terminal, go to your MagicMirror's Module folder:
````
cd ~/MagicMirror/modules
````

Clone this repository:
````
git clone https://github.com/kolbyjack/MMM-MonthlyCalendar.git
````

Configure the module in your `config.js` file.

**Note:** After starting the Mirror, it will take a few seconds before events start to appear.

## Using the module

To use this module, add it to the modules array in the `config/config.js` file:
````javascript
modules: [
  {
    module: "MMM-MonthlyCalendar",
    position: "bottom_bar",
    config: { // See "Configuration options" for more information.
      mode: "nextFourWeeks",
    }
  }
]
````

## Configuration options

The following properties can be configured:

|Option|Default|Description|
|---|---|---|
|`mode`|`"currentMonth"`|Whether to show events for the current month, or for the next four weeks.  Valid values are `currentMonth` and `nextFourWeeks`.|
|`firstDayOfWeek`|`"sunday"`|Which day to use as the start of the week.|
|`hideCalendars`|`[]`|A list of calendar names to hide from the view.|
