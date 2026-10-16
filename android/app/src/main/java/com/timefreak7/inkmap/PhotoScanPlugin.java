package com.timefreak7.inkmap;

import android.Manifest;
import android.content.ContentUris;
import android.content.Intent;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
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
        String where = "(" + MediaStore.MediaColumns.DATE_ADDED + " > ? OR " + MediaStore.MediaColumns.DATE_ADDED + " IS NULL)";
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
                    JSObject pt = point(uri, isVideo, c.getLong(1));
                    if (pt == null) continue;
                    located++;
                    points.put(pt);
                }
            } catch (Exception e) { // permission revoked, or a storage volume removed mid-scan: never crash the app
                call.reject("Could not read photos: " + e.getMessage());
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

    // { lat, lon, day } for one photo or video, or null without a location. fallbackMillis: a timestamp for the day.
    private JSObject point(Uri uri, boolean isVideo, long fallbackMillis) {
        ExifInterface exif = isVideo ? null : exif(uri);
        double[] at = isVideo ? videoPoint(uri) : photoPoint(exif);
        if (at == null || (at[0] == 0 && at[1] == 0)) return null;
        String day = isVideo ? null : photoDay(exif);
        if (day == null && fallbackMillis > 0) day = localDay(fallbackMillis);
        if (day == null) return null;
        JSObject pt = new JSObject();
        pt.put("lat", at[0]);
        pt.put("lon", at[1]);
        pt.put("day", day);
        return pt;
    }

    // A folder the person picks (e.g. DCIM/Camera), read file by file through the system folder picker.
    // Some phones leave many camera files out of the media index the library scan uses; this reads them anyway.
    @PluginMethod
    public void scanFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (Build.VERSION.SDK_INT >= 26) {
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:DCIM"));
        }
        startActivityForResult(call, intent, "afterFolder");
    }

    @ActivityCallback
    private void afterFolder(PluginCall call, ActivityResult result) {
        Uri tree = result.getData() == null ? null : result.getData().getData();
        if (tree == null) {
            call.reject("No folder chosen");
            return;
        }
        new Thread(() -> runFolder(call, tree)).start();
    }

    private void runFolder(PluginCall call, Uri tree) {
        List<String[]> files = new ArrayList<>(); // documentId, mime, lastModified
        try {
            list(tree, DocumentsContract.getTreeDocumentId(tree), files, 0);
        } catch (Exception e) {
            call.reject("Could not read that folder: " + e.getMessage());
            return;
        }
        JSArray points = new JSArray();
        int done = 0, photos = 0, vids = 0, located = 0;
        for (String[] f : files) {
            done++;
            boolean isVideo = f[1].startsWith("video/");
            if (isVideo) vids++; else photos++;
            if (done % 50 == 0) {
                JSObject p = new JSObject();
                p.put("done", done);
                p.put("total", files.size());
                notifyListeners("progress", p);
            }
            JSObject pt = point(DocumentsContract.buildDocumentUriUsingTree(tree, f[0]), isVideo, Long.parseLong(f[2]));
            if (pt == null) continue;
            located++;
            points.put(pt);
        }
        JSObject result = new JSObject();
        result.put("points", points);
        result.put("photos", photos);
        result.put("videos", vids);
        result.put("located", located);
        call.resolve(result);
    }

    private void list(Uri tree, String docId, List<String[]> out, int depth) {
        if (depth > 8) return;
        String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_MIME_TYPE,
            DocumentsContract.Document.COLUMN_LAST_MODIFIED, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
        try (Cursor c = getContext().getContentResolver().query(DocumentsContract.buildChildDocumentsUriUsingTree(tree, docId), cols, null, null, null)) {
            while (c != null && c.moveToNext()) {
                String id = c.getString(0), mime = c.getString(1);
                String name = c.getString(3);
                if (name != null && name.startsWith(".")) continue; // .thumbnails, .trash and other hidden folders
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) list(tree, id, out, depth + 1);
                else if (mime != null && (mime.startsWith("image/") || mime.startsWith("video/"))) out.add(new String[] { id, mime, String.valueOf(c.getLong(2)) });
            }
        }
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
