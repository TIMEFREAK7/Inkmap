package com.timefreak7.inkmap;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.InputStream;
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
    @PluginMethod
    public void scanRecent(PluginCall call) {
        String read = Build.VERSION.SDK_INT >= 33 ? "images" : "legacy";
        String[] aliases = Build.VERSION.SDK_INT >= 29 ? new String[] { read, "location" } : new String[] { read };
        requestPermissionForAliases(aliases, call, "afterPermissions");
    }

    @PermissionCallback
    private void afterPermissions(PluginCall call) {
        int limit = call.getInt("limit", 50);
        int scanned = 0, withLocation = 0, withDate = 0;
        String sample = null;
        String[] projection = { MediaStore.Images.Media._ID, MediaStore.Images.Media.DATE_TAKEN };
        try (Cursor c = getContext().getContentResolver().query(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, projection,
                null, null, MediaStore.Images.Media.DATE_TAKEN + " DESC")) {
            while (c != null && c.moveToNext() && scanned < limit) {
                scanned++;
                if (c.getLong(1) > 0) withDate++;
                Uri uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, c.getLong(0));
                // Without setRequireOriginal Android hands back a copy with the GPS tags removed.
                if (Build.VERSION.SDK_INT >= 29) uri = MediaStore.setRequireOriginal(uri);
                try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                    float[] latLong = new float[2];
                    if (in != null && new ExifInterface(in).getLatLong(latLong)) {
                        withLocation++;
                        if (sample == null) sample = String.format(Locale.ROOT, "%.1f, %.1f", latLong[0], latLong[1]);
                    }
                } catch (Exception ignored) {
                    // Unreadable photo: counted as scanned, not as located.
                }
            }
        } catch (SecurityException e) {
            call.reject("No permission to read photos: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("scanned", scanned);
        result.put("withLocation", withLocation);
        result.put("withDate", withDate);
        result.put("sample", sample);
        result.put("locationPermission", Build.VERSION.SDK_INT >= 29 ? getPermissionState("location").toString() : "n/a");
        call.resolve(result);
    }
}
