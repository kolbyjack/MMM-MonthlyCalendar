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

function equals(a, b) {
  if (typeof(a) !== typeof(b)) {
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

Module.register("MMM-MonthlyCalendar", {
  // Default module config
  defaults: {
    mode: "currentMonth",
    firstDayOfWeek: "sunday",
    hideCalendars: [],
  },

  start: function() {
    var self = this;

    self.events = [];
    self.displayedDay = null;
    self.displayedEvents = [];
    self.updateTimer = null;
    self.skippedUpdateCount = 0;
  },

  notificationReceived: function(notification, payload) {
    var self = this;

    if (notification === "CALENDAR_EVENTS") {
      self.events = payload.map(e => {
        e.startDate = new Date(+e.startDate);
        e.endDate = new Date(+e.endDate);

        if (e.fullDayEvent) {
          e.endDate = new Date(e.endDate.getTime() - 1000);
        }

        return e;
      }).filter(e => {
        return !self.config.hideCalendars.includes(e.calendarName);
      });

      if (self.updateTimer !== null) {
        clearTimeout(self.updateTimer);
        ++self.skippedUpdateCount;
      }

      self.updateTimer = setTimeout(() => {
        var today = new Date().setHours(12, 0, 0, 0).valueOf();

        if (today !== self.displayedDay || !equals(self.events, self.displayedEvents)) {
          console.log("MMM-MonthlyCalendar: Skipped " + self.skippedUpdateCount + " updates; " + ((today !== self.displayedDay) ? "new day" : "updated events"));
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

  getDom: function() {
    var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var self = this;
    var now = new Date();
    var table = el("table", { "className": "small wrapper" });
    var row = el("tr");
    var cell;
    var cellIndex, monthDays;
    var today = now.getDate();
    var dateCells = [];
    var startDayOffset = 0;

    while (self.config.firstDayOfWeek.toLowerCase() !== days[0].toLowerCase() && startDayOffset < days.length) {
      days.push(days.shift());
      ++startDayOffset;
    }

    startDayOffset = (startDayOffset % 7);

    if (self.config.mode === "nextFourWeeks") {
      cellIndex = today - now.getDay() + startDayOffset;
      while (cellIndex > today) {
        cellIndex -= 7;
      }
      monthDays = cellIndex + 21;
    } else {
      cellIndex = 1 - new Date(now.getFullYear(), now.getMonth(), 1).getDay() + startDayOffset;
      monthDays = 32 - new Date(now.getFullYear(), now.getMonth(), 32).getDate();
      while (cellIndex > 1) {
        cellIndex -= 7;
      }
    }

    for (var day in days) {
      row.appendChild(el("th", { "className": "header", "innerHTML": days[day] }));
    }
    table.appendChild(row);

    for (var week = 0; week < 6 && cellIndex <= monthDays; ++week) {
      row = el("tr", { "className": "xsmall" });

      for (day = 0; day < 7; ++day, ++cellIndex) {
        var cellDate = new Date(now.getFullYear(), now.getMonth(), cellIndex).getDate();

        cell = el("td", { "className": "cell" });
        if (cellIndex === today) {
          cell.classList.add("today");
        } else if (cellIndex !== cellDate && self.config.mode === "currentMonth") {
          cell.classList.add("other-month");
        } else if (cellIndex < today) {
          cell.classList.add("past-date");
        }
        cell.appendChild(el("div", { "innerHTML": cellDate }));
        row.appendChild(cell);
        dateCells[cellIndex] = cell;
      }

      table.appendChild(row);
    }

    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var monthEnd = new Date(now.getFullYear(), now.getMonth(), monthDays, 23, 59, 59);
    for (var i in self.events) {
      var e = self.events[i];
      var text = e.title;

      for (var eventDate = e.startDate; eventDate <= e.endDate; eventDate = addOneDay(eventDate)) {
        var dayDiff = diffDays(eventDate, monthStart);

        if (dayDiff in dateCells) {
          if (!e.fullDayEvent) {
            function formatTime(d) {
              function z(n) {
                return (n < 10 ? "0" : "") + n;
              }
              var h = d.getHours();
              var m = z(d.getMinutes());
              if (config.timeFormat === 12) {
                return (h % 12 || 12) + ":" + m + (h < 12 ? "am" : "pm");
              } else {
                return h + ":" + m;
              }
            }
            text = formatTime(e.startDate) + " " + text;
          }

          var div = el("div", { "className": "event", "innerText": text });
          if (e.color) {
            var c = e.color;

            if (e.fullDayEvent) {
              div.style.backgroundColor = c;
              if (c[0] === "#") {
                var r, g, b, l;

                if (c.length < 7) {
                  r = parseInt(c[1], 16) * 16 + parseInt(c[1], 16);
                  g = parseInt(c[2], 16) * 16 + parseInt(c[2], 16);
                  b = parseInt(c[3], 16) * 16 + parseInt(c[3], 16);
                } else {
                  r = parseInt(c.substr(1, 2), 16);
                  g = parseInt(c.substr(3, 2), 16);
                  b = parseInt(c.substr(5, 2), 16);
                }

                l = 0.299 * r + 0.587 * g + 0.114 * b;
                if (l >= 128) {
                  div.style.color = "black";
                }
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
