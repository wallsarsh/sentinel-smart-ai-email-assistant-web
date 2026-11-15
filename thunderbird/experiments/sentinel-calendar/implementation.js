/* Minimal Thunderbird calendar experiment API for Sentinel.
 * It only creates events and lists writable calendars. The stable ICS export remains the fallback. */
/* global ChromeUtils */
var { ExtensionCommon } = ChromeUtils.importESModule('resource://gre/modules/ExtensionCommon.sys.mjs')
var { cal } = ChromeUtils.importESModule('resource:///modules/calendar/calUtils.sys.mjs')
// Thunderbird 140 removed cal.createEvent(); events are constructed from the CalEvent class instead.
var { CalEvent } = ChromeUtils.importESModule('resource:///modules/CalEvent.sys.mjs')

this.sentinelCalendar = class extends ExtensionCommon.ExtensionAPI {
  getAPI() {
    return {
      sentinelCalendar: {
        async listCalendars() {
          return cal.manager.getCalendars().map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            readOnly: calendar.readOnly,
            writable: isWritable(calendar),
          }))
        },
        async createEvent(details) {
          const target = chooseCalendar()
          try {
            return await addEvent(target, details)
          } catch (e) {
            const reason = e?.message || String(e) || 'unknown error'
            console.error(`Sentinel calendar: could not add "${details?.title}" to ${target.name}: ${reason}`)
            throw new Error(`Could not add the event to "${target.name}": ${reason}`, { cause: e })
          }
        },
      },
    }
  }
}

function isDisabled(calendar) {
  const disabled = calendar.getProperty('disabled')
  return disabled === true || disabled === 'true'
}

function isWritable(calendar) {
  return (
    !calendar.readOnly &&
    !isDisabled(calendar) &&
    calendar.getProperty('capabilities.events.supported') !== false
  )
}

/** The default writable event calendar, otherwise the first one the user has enabled. */
function chooseCalendar() {
  const calendars = cal.manager.getCalendars().filter(isWritable)
  if (!calendars.length) {
    throw new Error(
      'No writable Thunderbird calendar is configured. Enable one in the Calendar tab, then try again.',
    )
  }
  const isDefault = (calendar) => {
    const flag = calendar.getProperty('calendar-main-default')
    return flag === true || flag === 'true'
  }
  return calendars.find(isDefault) ?? calendars[0]
}

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))

/** Local noon keeps an all-day date on the intended day across daylight-saving changes. */
function localNoon(value) {
  const [y, m, d] = String(value).split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

function eventBounds(details) {
  const allDay = details.allDay === true || isDateOnly(details.start)
  if (allDay) {
    const start = isDateOnly(details.start) ? localNoon(details.start) : new Date(details.start)
    if (!Number.isFinite(start.getTime())) throw new Error('Invalid event start date.')
    start.setHours(12, 0, 0, 0)
    // DTEND for an all-day item is exclusive; a missing or same-day end means one day.
    let end = isDateOnly(details.end) ? localNoon(details.end) : null
    if (!end || end.getTime() <= start.getTime()) {
      end = new Date(start)
      end.setDate(end.getDate() + 1)
    }
    return { allDay, start, end }
  }
  const start = new Date(details.start)
  if (!Number.isFinite(start.getTime())) throw new Error('Invalid event start date.')
  let end = details.end ? new Date(details.end) : null
  if (!end || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 3600_000)
  }
  return { allDay, start, end }
}

async function addEvent(target, details) {
  const { allDay, start, end } = eventBounds(details)
  const uid = details.uid || cal.getUUID()

  // Stable UIDs make a repeated click idempotent. Network calendars may fail the lookup;
  // creating the event is still the user's explicit request.
  try {
    const existing = await target.getItem(uid)
    if (existing) {
      return { id: existing.id, calendarId: target.id, calendarName: target.name, existing: true }
    }
  } catch {
    /* ignore and create */
  }

  const item = new CalEvent()
  item.calendar = target
  item.id = uid
  item.title = details.title || 'Sentinel event'
  item.startDate = cal.dtz.jsDateToDateTime(start, cal.dtz.defaultTimezone)
  item.endDate = cal.dtz.jsDateToDateTime(end, cal.dtz.defaultTimezone)
  if (allDay) {
    item.startDate.isDate = true
    item.endDate.isDate = true
  }
  if (details.location) item.setProperty('LOCATION', details.location)
  if (details.description) item.setProperty('DESCRIPTION', details.description)

  const created = await target.addItem(item)
  return {
    id: created?.id ?? item.id,
    calendarId: target.id,
    calendarName: target.name,
    allDay,
    start: start.toISOString(),
    end: end.toISOString(),
  }
}
