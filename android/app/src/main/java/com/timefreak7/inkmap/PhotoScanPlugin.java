package com.timefreak7.inkmap;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

// Reads place and date from photos through MediaStore with ACCESS_MEDIA_LOCATION, because Android's photo
// picker removes location data. Only the numbers leave this class; photos are never copied or kept.
@CapacitorPlugin(
    name = "PhotoScan",
    permissions = {
        @Permission(alias = "images", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "legacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }),
    }
)
public class PhotoScanPlugin extends Plugin {
    // Scans photos added after `after` (MediaStore DATE_ADDED, seconds) and resolves
    // { points: [{ lat, lon, day }], lastAdded, scanned }. Emits "progress" { done, total } while it runs.
    @PluginMethod
    public void scan(PluginCall call) {
        String read = Build.VERSION.SDK_INT >= 33 ? "images" : "legacy";
        String[] aliases = Build.VERSION.SDK_INT >= 29 ? new String[] { read, "location" } : new String[] { read };
        requestPermissionForAliases(aliases, call, "afterPermissions");
    }

    @PermissionCallback
    private void afterPermissions(PluginCall call) {
        String read = Build.VERSION.SDK_INT >= 33 ? "images" : "legacy";
        if (getPermissionState(read) != PermissionState.GRANTED) {
            call.reject("No permission to read photos");
            return;
        }
        // Thousands of photos take minutes: off the main thread, so the app stays usable.
        new Thread(() -> run(call)).start();
    }

    private void run(PluginCall call) {
        long after = call.getLong("after", 0L);
        JSArray points = new JSArray();
        long lastAdded = after;
        int scanned = 0;
        String[] projection = { MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_TAKEN, MediaStore.Images.Media.DATE_ADDED };
        try (Cursor c = getContext().getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection,
                MediaStore.Images.Media.DATE_ADDED + " > ?", new String[] { String.valueOf(after) },
                MediaStore.Images.Media.DATE_ADDED + " ASC")) {
            int total = c == null ? 0 : c.getCount();
            while (c != null && c.moveToNext()) {
                scanned++;
                lastAdded = Math.max(lastAdded, c.getLong(2));
                if (scanned % 50 == 0) {
                    JSObject p = new JSObject();
                    p.put("done", scanned);
                    p.put("total", total);
                    notifyListeners("progress", p);
                }
                Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, c.getLong(0));
                // Without setRequireOriginal Android hands back a copy with the GPS tags removed.
                if (Build.VERSION.SDK_INT >= 29) uri = MediaStore.setRequireOriginal(uri);
                try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    if (in == null) continue;
                    ExifInterface exif = new ExifInterface(in);
                    float[] latLong = new float[2];
                    if (!exif.getLatLong(latLong) || (latLong[0] == 0 && latLong[1] == 0)) continue;
                    // The camera's local date where the photo was taken; DATE_TAKEN is only a fallback (it's UTC-based).
                    String original = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
                    String day = original != null && original.length() >= 10 && original.charAt(4) == ':'
                        ? original.substring(0, 10).replace(':', '-')
                        : c.getLong(1) > 0 ? DAY.format(new Date(c.getLong(1))) : null;
                    if (day == null) continue;
                    JSObject pt = new JSObject();
                    pt.put("lat", latLong[0]);
                    pt.put("lon", latLong[1]);
                    pt.put("day", day);
                    points.put(pt);
                } catch (Exception ignored) {
                    // Unreadable photo: skipped.
                }
            }
        } catch (SecurityException e) {
            call.reject("No permission to read photos: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("points", points);
        result.put("lastAdded", lastAdded);
        result.put("scanned", scanned);
        call.resolve(result);
    }

    private static final SimpleDateFormat DAY = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
}
