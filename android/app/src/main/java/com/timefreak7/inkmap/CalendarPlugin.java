package com.timefreak7.inkmap;

import android.Manifest;
import android.database.Cursor;
import android.provider.CalendarContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

// Reads the phone's own calendar (what Google Calendar and others keep on the device), with no network.
// Only events that could be travel come back: ones with a place, or flights. Nothing is changed or kept here.
@CapacitorPlugin(name = "Calendar", permissions = { @Permission(alias = "calendar", strings = { Manifest.permission.READ_CALENDAR }) })
public class CalendarPlugin extends Plugin {
    @PluginMethod
    public void events(PluginCall call) {
        requestPermissionForAlias("calendar", call, "afterPermission");
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            call.reject("No permission to read the calendar.");
            return;
        }
        new Thread(() -> run(call)).start();
    }

    private void run(PluginCall call) {
        String[] cols = { CalendarContract.Events.TITLE, CalendarContract.Events.EVENT_LOCATION, CalendarContract.Events.DTSTART,
            CalendarContract.Events.DTEND, CalendarContract.Events.ALL_DAY, CalendarContract.Events.EVENT_TIMEZONE };
        String where = "(" + CalendarContract.Events.EVENT_LOCATION + " != '' OR " + CalendarContract.Events.TITLE + " LIKE '%flight%')"
            + " AND " + CalendarContract.Events.DELETED + " = 0 AND " + CalendarContract.Events.DTSTART + " < ?";
        JSArray events = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(CalendarContract.Events.CONTENT_URI, cols, where,
                new String[] { String.valueOf(System.currentTimeMillis()) }, null)) {
            while (c != null && c.moveToNext()) {
                long start = c.getLong(2), end = c.isNull(3) ? start : c.getLong(3);
                boolean allDay = c.getInt(4) == 1;
                // All-day events are stored at UTC midnight; timed ones belong to the day in their own time zone.
                TimeZone tz = allDay ? TimeZone.getTimeZone("UTC") : c.isNull(5) ? TimeZone.getDefault() : TimeZone.getTimeZone(c.getString(5));
                if (allDay && end > start) end -= 1; // all-day end is exclusive (midnight after the last day)
                JSObject e = new JSObject();
                e.put("title", c.getString(0));
                e.put("location", c.getString(1));
                e.put("from", day(start, tz));
                e.put("to", day(Math.max(start, end), tz));
                events.put(e);
            }
        } catch (Exception e) { // on a background thread: an uncaught exception would close the app
            call.reject(e instanceof SecurityException ? "No permission to read the calendar." : "Could not read the calendar: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("events", events);
        call.resolve(result);
    }

    private static String day(long millis, TimeZone tz) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        f.setTimeZone(tz);
        return f.format(new Date(millis));
    }
}
