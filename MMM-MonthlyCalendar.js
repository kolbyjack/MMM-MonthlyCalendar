// MMM-MonthlyCalendar.js

function el(tag, options) {
  var result = document.createElement(tag);

  options = options || {};
  for (var key in options) {
    result[key] = options[key];
  }

  return result;
}

function addOneDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function diffDays(a, b) {
  a = new Date(a);
  b = new Date(b);

  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);

  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

// Adapted from https://stackoverflow.com/a/6117889/245795
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - d.getUTCDay());
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function formatEventTime(d) {
  var h = d.getHours();
  var m = d.getMinutes().toString().padStart(2, "0");
  if (config.timeFormat === 12) {
    return (h % 12 || 12) + (m > 0 ? `:${m}` : "") + (h < 12 ? "am" : "pm");
  } else {
    return `${h}:${m}`;
  }
}

function equals(a, b) {
  if (typeof (a) !== typeof (b)) {
    return false;
  }

  if (!!a && (a.constructor === Array || a.constructor === Object)) {
    for (var key in a) {
      if (!b.hasOwnProperty(key) || !equals(a[key], b[key])) {
        return false;
      }
    }

    return true;
  } else if (!!a && a.constructor == Date) {
    return a.valueOf() === b.valueOf();
  }

  return a === b;
}

function getLuminance(color) {
  try {
    const [r, g, b, a, s, d] = color.match(/([0-9.]+)/g);
    return 0.299 * +r + 0.587 * +g + 0.114 * +b;
  } catch {
    return 0;
  }
}

Module.register("MMM-MonthlyCalendar", {
  // Default module config
  defaults: {
    mode: "currentMonth",
    firstDayOfWeek: "sunday",
    showWeekNumber: false,
    displaySymbol: false,
    wrapTitles: false,
    hideCalendars: [],
    luminanceThreshold: 110,
    multiDayEndingTimeSeparator: " until ",
    hideDuplicateEvents: true
  },

  start: function () {
    var self = this;

    self.sourceEvents = {};
    self.events = [];
    self.displayedDay = null;
    self.displayedEvents = [];
    self.updateTimer = null;
    self.skippedUpdateCount = 0;
  },

  notificationReceived: function (notification, payload, sender) {
    var self = this;

    if (notification === "CALENDAR_EVENTS") {
      if (!Array.isArray(payload)) {
        console.error("Payload is not an array:", payload);
        return;
      }

      // Step 1: Parse and filter incoming events
      self.sourceEvents[sender.identifier] = payload
        .map((e) => {
          e.startDate = new Date(+e.startDate);
          e.endDate = new Date(+e.endDate);

          if (e.fullDayEvent) {
            e.endDate = new Date(e.endDate.getTime() - 1000);

            if (e.startDate > e.endDate) {
              e.startDate = new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate(), 1);
            } else {
              e.startDate = new Date(e.startDate.getTime() + 60 * 60 * 1000);
            }
          }

          // If not a full-day event, check if it spans multiple days
          if (((e.endDate.getTime() - e.startDate.getTime()) / 1000) > 86400) {
            e.multiDayEvent = true;
          }

          return e;
        })
        .filter((e) => !self.config.hideCalendars.includes(e.calendarName));

      // Step 2: Schedule update
      if (self.updateTimer !== null) {
        clearTimeout(self.updateTimer);
        ++self.skippedUpdateCount;
      }

      self.updateTimer = setTimeout(() => {
        const today = new Date().setHours(12, 0, 0, 0).valueOf();

        // Step 3: Combine and sort events
        self.events = Object.values(self.sourceEvents)
          .flat()
          .sort((a, b) => {
            if (a.startDate != b.startDate) return a.startDate - b.startDate;
            if (a.endDate != b.endDate) return a.endDate - b.endDate;
            return a.title.localeCompare(b.title);
          });

        // Step 4: Remove duplicates using a hash table
        if (self.config.hideDuplicateEvents) {
          const seenEvents = new Map(); // Hash table for deduplication
          self.events = self.events.filter((event) => {
            const key = `${event.title}|${event.startDate.valueOf()}|${event.endDate.valueOf()}`;
            if (seenEvents.has(key)) {
              return false; // Duplicate
            }
            seenEvents.set(key, true);
            return true; // Unique
          });
        }

        // Step 5: Update DOM if needed
        if (today !== self.displayedDay || !equals(self.events, self.displayedEvents)) {
          self.displayedDay = today;
          self.displayedEvents = self.events;
          self.updateTimer = null;
          self.skippedUpdateCount = 0;
          self.updateDom();
        }
      }, 5000);
    }
  },

  getStyles: function () {
    return ["MMM-MonthlyCalendar.css"];
  },

  getDom: function () {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weeksToMonthDays = {
      "nextoneweek": 0,
      "currentweek": 0,
      "oneweek": 0,
      "twoweeks": 7,
      "threeweeks": 14,
      "fourweeks": 21,
      "nextfourweeks": 21,
    };
    const self = this;
    const now = new Date();
    const table = el("table", { "className": "small wrapper" });
    const today = now.getDate();
    const mode = self.config.mode.toLowerCase();
    let firstDayOfWeek = self.config.firstDayOfWeek.toLowerCase();
    var row = el("tr");
    var cell;
    var cellIndex, monthDays;
    var dateCells = [];
    var startDayOffset = 0;

    if (firstDayOfWeek === "today") {
      firstDayOfWeek = days[now.getDay()].toLowerCase();
    }

    while (firstDayOfWeek !== days[0].toLowerCase() && startDayOffset < days.length) {
      days.push(days.shift());
      ++startDayOffset;
    }

    startDayOffset = (startDayOffset % 7);

    if (mode in weeksToMonthDays) {
      cellIndex = today - now.getDay() + startDayOffset;
      while (cellIndex > today) {
        cellIndex -= 7;
      }
      monthDays = cellIndex + weeksToMonthDays[mode];
    } else {
      if (mode === "lastmonth") {
        now.setMonth(now.getMonth() - 1);
      } else if (mode === "nextmonth") {
        now.setMonth(now.getMonth() + 1);
      }
      cellIndex = 1 - new Date(now.getFullYear(), now.getMonth(), 1).getDay() + startDayOffset;
      monthDays = 32 - new Date(now.getFullYear(), now.getMonth(), 32).getDate();
      while (cellIndex > 1) {
        cellIndex -= 7;
      }
    }

    if (self.config.showWeekNumber) {
      row.appendChild(el("th", { "className": "weeknum" }));
    }

    for (var day = 0; day < 7; ++day) {
      const headerDate = new Date(now.getFullYear(), now.getMonth(), cellIndex + day);
      row.appendChild(el("th", { "className": "header", "innerHTML": headerDate.toLocaleString(config.language, { weekday: "long" }) }));
    }
    table.appendChild(row);

    for (var week = 0; week < 6 && cellIndex <= monthDays; ++week) {
      row = el("tr", { "className": "xsmall" });
      if (self.config.showWeekNumber) {
        const weekDate = new Date(now.getFullYear(), now.getMonth(), cellIndex);
        row.appendChild(el("td", { "className": "weeknum", "innerHTML": getWeekNumber(weekDate) }));
      }

      for (day = 0; day < 7; ++day, ++cellIndex) {
        var cellDate = new Date(now.getFullYear(), now.getMonth(), cellIndex);
        var cellDay = cellDate.getDate();

        cell = el("td", { "className": "cell" });
        if (["lastmonth", "nextmonth"].includes(mode)) {
          // Do nothing
        } else if (cellIndex === today) {
          cell.classList.add("today");
        } else if (cellIndex !== cellDay && mode === "currentmonth") {
          cell.classList.add("other-month");
        } else if (cellIndex < today) {
          cell.classList.add("past-date");
        }

        if ((week === 0 && day === 0) || cellDay === 1) {
          cellDay = cellDate.toLocaleString(config.language, { month: "short", day: "numeric" });
        }

        cell.appendChild(el("div", { "innerHTML": cellDay }));
        row.appendChild(cell);
        dateCells[cellIndex] = cell;
      }

      table.appendChild(row);
    }

    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var monthEnd = new Date(now.getFullYear(), now.getMonth(), monthDays, 23, 59, 59);
    for (var i in self.events) {
      var e = self.events[i];

      for (var eventDate = e.startDate; eventDate <= e.endDate; eventDate = addOneDay(eventDate)) {
        var dayDiff = diffDays(eventDate, monthStart);

        if (dayDiff in dateCells) {
          let div = el("div", { "className": "event" });
          if (!self.config.wrapTitles) {
            div.classList.add("event-nowrap");
          }

          // Print the time if it is NOT a full day event.
          // And if it is NOT the 2nd or later day of a multi-day event.
          if (!e.fullDayEvent && !(e.multiDayEvent && (eventDate > e.startDate))) {
            div.appendChild(el("span", { "className": "event-label", "innerText": formatEventTime(e.startDate) }));
          }

          if (self.config.displaySymbol) {
            for (let symbol of e.symbol) {
              div.appendChild(el("span", { "className": `event-label fa fa-${symbol}` }));
            }
          }

          div.appendChild(el("span", { "innerText": e.title }));

          // Print ending time if last day of multi-day event.
          if (e.multiDayEvent && (eventDate.toDateString() == e.endDate.toDateString())) {
            div.appendChild(el("span", { "className": "event-label", "innerText": self.config.multiDayEndingTimeSeparator + formatEventTime(e.endDate) }));
          }

          if (e.color) {
            var c = e.color;

            if (e.fullDayEvent || e.multiDayEvent) {
              div.style.backgroundColor = c;
              if (getLuminance(div.style.backgroundColor) >= self.config.luminanceThreshold) {
                div.className += " event-lightbackground";
              } else {
                div.className += " event-darkbackground";
              }
            } else {
              div.style.color = c;
            }
          }

          dateCells[dayDiff].appendChild(div);
        }
      }
    }

    return table;
  },
});
