/* Minimal Thunderbird calendar experiment API for Sentinel.
 * It only creates events and lists writable calendars. The stable ICS export remains the fallback. */
var { ExtensionCommon } = ChromeUtils.importESModule('resource://gre/modules/ExtensionCommon.sys.mjs')
var { cal } = ChromeUtils.importESModule('resource:///modules/calendar/calUtils.sys.mjs')

this.sentinelCalendar = class extends ExtensionCommon.ExtensionAPI {
  getAPI() {
    return {
      sentinelCalendar: {
        async listCalendars() {
          return cal.manager
            .getCalendars()
            .map((calendar) => ({
              id: calendar.id,
              name: calendar.name,
              readOnly: calendar.readOnly,
            }))
        },
        async createEvent(details) {
          const calendars = cal.manager.getCalendars().filter((calendar) => !calendar.readOnly)
          const target =
            calendars.find((calendar) => calendar.getProperty('calendar-main-default') === true || calendar.getProperty('calendar-main-default') === 'true') ??
            calendars[0]
          if (!target) throw new Error('No writable Thunderbird calendar is configured.')

          const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(details.start))
          let start
          if (details.allDay && dateOnly) {
            const [y, m, d] = String(details.start).split('-').map(Number)
            start = new Date(y, m - 1, d, 12, 0, 0, 0)
          } else start = new Date(details.start)
          if (!Number.isFinite(start.getTime())) throw new Error('Invalid event start date.')
          let end = details.end ? new Date(details.end) : null
          if (!end || !Number.isFinite(end.getTime())) {
            end = new Date(start.getTime() + (details.allDay ? 24 : 1) * 3600_000)
          }
          if (details.allDay) {
            start.setHours(12, 0, 0, 0)
            end = new Date(start)
            end.setDate(end.getDate() + 1)
          }

          const item = cal.createEvent()
          item.calendar = target
          item.id = cal.getUUID()
          item.title = details.title || 'Sentinel event'
          item.startDate = cal.dtz.jsDateToDateTime(start, cal.dtz.defaultTimezone)
          item.endDate = cal.dtz.jsDateToDateTime(end, cal.dtz.defaultTimezone)
          if (details.allDay) {
            item.startDate.isDate = true
            item.endDate.isDate = true
          }
          if (details.location) item.setProperty('LOCATION', details.location)
          if (details.description) item.setProperty('DESCRIPTION', details.description)
          const created = await target.addItem(item)
          return { id: created?.id ?? item.id, calendarId: target.id, calendarName: target.name }
        },
      },
    }
  }
}
