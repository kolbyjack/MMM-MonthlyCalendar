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
            // Calendar all-day events use an exclusive end date. Normalize
            // midnight to the final included day so date-based layout treats
            // the event's last day as part of the event.
            if (
              e.endDate.getHours() === 0 &&
              e.endDate.getMinutes() === 0 &&
              e.endDate.getSeconds() === 0 &&
              e.endDate.getMilliseconds() === 0
            ) {
              e.endDate = new Date(
                e.endDate.getFullYear(),
                e.endDate.getMonth(),
                e.endDate.getDate() - 1,
                23, 59, 59, 999
              );
            } else {
              // Preserve the existing inclusive-end handling for feeds that
              // provide an end time other than midnight.
              e.endDate = new Date(e.endDate.getTime() - 1000);
            }
          }

          // Treat events on different calendar dates as multi-day, even when
          // their elapsed duration is less than 24 hours.
          if (e.startDate.toDateString() !== e.endDate.toDateString()) {
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
    const weeksToMonthDays = { nextoneweek: 0, currentweek: 0, oneweek: 0, twoweeks: 7, threeweeks: 14, fourweeks: 21, nextfourweeks: 21 };
    const self = this;
    const now = new Date();
    const mode = self.config.mode.toLowerCase();
    let firstDayOfWeek = self.config.firstDayOfWeek.toLowerCase();
    let offset = 0;
    if (firstDayOfWeek === "today") firstDayOfWeek = days[now.getDay()].toLowerCase();
    while (days[0].toLowerCase() !== firstDayOfWeek && offset < 7) { days.push(days.shift()); ++offset; }

    let monthDays, firstCell, weekCount;
    if (mode in weeksToMonthDays) {
      firstCell = now.getDate() - now.getDay() + offset;
      while (firstCell > now.getDate()) firstCell -= 7;
      monthDays = firstCell + weeksToMonthDays[mode];
      weekCount = Math.floor((monthDays - firstCell) / 7) + 1;
    } else {
      if (mode === "lastmonth") now.setMonth(now.getMonth() - 1);
      else if (mode === "nextmonth") now.setMonth(now.getMonth() + 1);
      firstCell = 1 - new Date(now.getFullYear(), now.getMonth(), 1).getDay() + offset;
      while (firstCell > 1) firstCell -= 7;
      monthDays = 32 - new Date(now.getFullYear(), now.getMonth(), 32).getDate();
      weekCount = Math.floor((monthDays - firstCell) / 7) + 1;
    }

    const grid = el("div", { className: "calendar-grid xsmall" });
    grid.style.setProperty("--calendar-columns", self.config.showWeekNumber ? "3ch repeat(7, minmax(0, 1fr))" : "repeat(7, minmax(0, 1fr))");
    const header = el("div", { className: "calendar-header small" });
    if (self.config.showWeekNumber) header.appendChild(el("div", { className: "weeknum" }));
    for (let d = 0; d < 7; d++) {
      const hd = new Date(now.getFullYear(), now.getMonth(), firstCell + d);
      header.appendChild(el("div", { className: "header", innerText: hd.toLocaleString(config.language, { weekday: "long" }) }));
    }
    grid.appendChild(header);

    const ordinal = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    const weeks = [];
    let cursor = new Date(now.getFullYear(), now.getMonth(), firstCell);
    for (let w = 0; w < Math.min(6, weekCount); w++) {
      const week = { start: new Date(cursor), dates: [], events: [] };
      for (let d = 0; d < 7; d++) {
        const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + d);
        week.dates.push(date);
      }
      weeks.push(week);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    }

    const todayOrdinal = ordinal(new Date());
    for (const week of weeks) {
      const row = el("div", { className: "week-row" });
      row.style.setProperty("--calendar-columns", self.config.showWeekNumber ? "3ch repeat(7, minmax(0, 1fr))" : "repeat(7, minmax(0, 1fr))");
      if (self.config.showWeekNumber) row.appendChild(el("div", { className: "weeknum", innerText: getWeekNumber(week.start) }));
      for (let d = 0; d < 7; d++) {
        const date = week.dates[d];
        const cell = el("div", { className: "date-cell" });
        const dayNumber = date.getDate();
        if (!["lastmonth", "nextmonth"].includes(mode)) {
          if (ordinal(date) === todayOrdinal) cell.classList.add("today");
          else if (date.getMonth() !== now.getMonth() && mode === "currentmonth") cell.classList.add("other-month");
          else if (ordinal(date) < todayOrdinal) cell.classList.add("past-date");
        }
        const label = (d === 0 || dayNumber === 1)
          ? date.toLocaleString(config.language, { month: "short", day: "numeric" })
          : dayNumber;
        cell.appendChild(el("div", { className: "date-label", innerText: label }));
        row.appendChild(cell);
      }

      const segments = [];
      for (const e of self.events) {
        const eventStart = ordinal(e.startDate);
        const eventEnd = ordinal(e.endDate);
        const weekStart = ordinal(week.dates[0]);
        const weekEnd = ordinal(week.dates[6]);
        if (eventEnd < weekStart || eventStart > weekEnd) continue;
        const first = Math.max(0, eventStart - weekStart);
        const last = Math.min(6, eventEnd - weekStart);
        segments.push({ event: e, first, last });
      }

      // Greedy interval partitioning: each event occupies the first lane
      // whose existing segments do not overlap its date columns.
      const laneEnds = [];
      for (const segment of segments) {
        let lane = 0;
        while (lane < laneEnds.length && laneEnds[lane] >= segment.first) lane++;
        if (lane === laneEnds.length) laneEnds.push(-1);
        laneEnds[lane] = segment.last;
        segment.lane = lane;
      }

      for (const segment of segments) {
        const e = segment.event;
        const bar = el("div", { className: "event" });
        bar.style.gridColumn = (segment.first + (self.config.showWeekNumber ? 2 : 1)) + " / span " + (segment.last - segment.first + 1);
        bar.style.gridRow = String(segment.lane + 2);
        if (!self.config.wrapTitles) bar.classList.add("event-nowrap");

        const isFirstDay = segment.first === Math.max(0, ordinal(e.startDate) - ordinal(week.dates[0]));
        const isLastDay = segment.last === Math.min(6, ordinal(e.endDate) - ordinal(week.dates[0]));
        if (!e.fullDayEvent && !e.multiDayEvent || (!e.fullDayEvent && isFirstDay)) {
          bar.appendChild(el("span", { className: "event-label", innerText: formatEventTime(e.startDate) }));
        }
        if (self.config.displaySymbol && e.symbol) {
          for (const symbol of e.symbol) bar.appendChild(el("span", { className: "event-label fa fa-" + symbol }));
        }
        bar.appendChild(el("span", { innerText: e.title }));
        if (!e.fullDayEvent && e.multiDayEvent && isLastDay && ordinal(e.endDate) >= ordinal(week.dates[0]) && ordinal(e.endDate) <= ordinal(week.dates[6])) {
          bar.appendChild(el("span", { className: "event-label", innerText: self.config.multiDayEndingTimeSeparator + formatEventTime(e.endDate) }));
        }
        if (e.color) {
          if (e.fullDayEvent || e.multiDayEvent) {
            bar.style.backgroundColor = e.color;
            bar.classList.add(getLuminance(bar.style.backgroundColor) >= self.config.luminanceThreshold ? "event-lightbackground" : "event-darkbackground");
          } else bar.style.color = e.color;
        }
        row.appendChild(bar);
      }
      grid.appendChild(row);
    }
    return grid;
  },
});
