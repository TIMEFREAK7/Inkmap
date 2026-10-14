package com.timefreak7.inkmap;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.media.ExifInterface;
import android.media.MediaMetadataRetriever;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.Locale;

// Reads place and date from photos and videos through MediaStore with ACCESS_MEDIA_LOCATION, because Android's
// photo picker removes location data. Only the numbers leave this class; nothing is copied or kept.
@CapacitorPlugin(
    name = "PhotoScan",
    permissions = {
        @Permission(alias = "images", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "videos", strings = { Manifest.permission.READ_MEDIA_VIDEO }),
        @Permission(alias = "legacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }),
    }
)
public class PhotoScanPlugin extends Plugin {
    // Scans photos and videos added after `after` (MediaStore DATE_ADDED, seconds) on every storage volume and resolves
    // { points: [{ lat, lon, day }], lastAdded, photos, videos, located }. Emits "progress" { done, total } while it runs.
    @PluginMethod
    public void scan(PluginCall call) {
        String[] aliases = Build.VERSION.SDK_INT >= 33 ? new String[] { "images", "videos", "location" }
            : Build.VERSION.SDK_INT >= 29 ? new String[] { "legacy", "location" } : new String[] { "legacy" };
        requestPermissionForAliases(aliases, call, "afterPermissions");
    }

    @PermissionCallback
    private void afterPermissions(PluginCall call) {
        if (getPermissionState(Build.VERSION.SDK_INT >= 33 ? "images" : "legacy") != PermissionState.GRANTED) {
            call.reject("No permission to read photos. Allow access to all photos in Android settings.");
            return;
        }
        // Thousands of photos take minutes: off the main thread, so the app stays usable.
        new Thread(() -> run(call)).start();
    }

    private void run(PluginCall call) {
        long after = call.getLong("after", 0L);
        boolean videos = Build.VERSION.SDK_INT < 33 || getPermissionState("videos") == PermissionState.GRANTED;
        // Every volume (phone storage and any SD card), photos and videos.
        List<Uri> collections = new ArrayList<>();
        Set<String> volumes = Build.VERSION.SDK_INT >= 29 ? MediaStore.getExternalVolumeNames(getContext()) : Collections.singleton("external");
        for (String v : volumes) {
            collections.add(MediaStore.Images.Media.getContentUri(v));
            if (videos) collections.add(MediaStore.Video.Media.getContentUri(v));
        }
        String[] projection = { MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATE_TAKEN, MediaStore.MediaColumns.DATE_ADDED };
        String where = MediaStore.MediaColumns.DATE_ADDED + " > ?";
        String[] args = { String.valueOf(after) };

        int total = 0;
        for (Uri u : collections) {
            try (Cursor c = getContext().getContentResolver().query(u, new String[] { MediaStore.MediaColumns._ID }, where, args, null)) {
                if (c != null) total += c.getCount();
            } catch (Exception ignored) { /* volume went away */ }
        }

        JSArray points = new JSArray();
        long lastAdded = after;
        int done = 0, photos = 0, vids = 0, located = 0;
        for (Uri collection : collections) {
            boolean isVideo = collection.toString().contains("/video/");
            try (Cursor c = getContext().getContentResolver().query(collection, projection, where, args, null)) {
                while (c != null && c.moveToNext()) {
                    done++;
                    if (isVideo) vids++; else photos++;
                    lastAdded = Math.max(lastAdded, c.getLong(2));
                    if (done % 50 == 0) {
                        JSObject p = new JSObject();
                        p.put("done", done);
                        p.put("total", total);
                        notifyListeners("progress", p);
                    }
                    Uri uri = ContentUris.withAppendedId(collection, c.getLong(0));
                    // Without setRequireOriginal Android hands back a copy with the location removed.
                    if (Build.VERSION.SDK_INT >= 29) uri = MediaStore.setRequireOriginal(uri);
                    ExifInterface exif = isVideo ? null : exif(uri);
                    double[] at = isVideo ? videoPoint(uri) : photoPoint(exif);
                    if (at == null || (at[0] == 0 && at[1] == 0)) continue;
                    String day = isVideo ? null : photoDay(exif);
                    if (day == null && c.getLong(1) > 0) day = localDay(c.getLong(1));
                    if (day == null) continue;
                    located++;
                    JSObject pt = new JSObject();
                    pt.put("lat", at[0]);
                    pt.put("lon", at[1]);
                    pt.put("day", day);
                    points.put(pt);
                }
            } catch (SecurityException e) {
                call.reject("No permission to read photos: " + e.getMessage());
                return;
            }
        }
        JSObject result = new JSObject();
        result.put("points", points);
        result.put("lastAdded", lastAdded);
        result.put("photos", photos);
        result.put("videos", vids);
        result.put("located", located);
        call.resolve(result);
    }

    private ExifInterface exif(Uri uri) {
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            return in == null ? null : new ExifInterface(in);
        } catch (Exception e) {
            return null; // unreadable: skipped
        }
    }

    private static double[] photoPoint(ExifInterface e) {
        float[] ll = new float[2];
        return e != null && e.getLatLong(ll) ? new double[] { ll[0], ll[1] } : null;
    }

    // The camera's local date where the photo was taken; DATE_TAKEN is only a fallback (it's UTC-based).
    private static String photoDay(ExifInterface e) {
        String original = e == null ? null : e.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
        return original != null && original.length() >= 10 && original.charAt(4) == ':' ? original.substring(0, 10).replace(':', '-') : null;
    }

    private static final Pattern ISO6709 = Pattern.compile("([+-]\\d+(?:\\.\\d+)?)([+-]\\d+(?:\\.\\d+)?)");

    // Videos store location as ISO 6709 text, e.g. "+48.8584+002.2945/".
    private double[] videoPoint(Uri uri) {
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(getContext(), uri);
            String loc = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_LOCATION);
            Matcher m = loc == null ? null : ISO6709.matcher(loc);
            return m != null && m.find() ? new double[] { Double.parseDouble(m.group(1)), Double.parseDouble(m.group(2)) } : null;
        } catch (Exception e) {
            return null;
        } finally {
            try { r.release(); } catch (Exception ignored) { }
        }
    }

    private static String localDay(long millis) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        f.setTimeZone(TimeZone.getDefault());
        return f.format(new Date(millis));
    }
}
