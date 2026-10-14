package com.timefreak7.inkmap;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

// Hands a text file (the family share file) to Android's share sheet: WhatsApp, email, Drive, Bluetooth...
@CapacitorPlugin(name = "FileShare")
public class FileSharePlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            dir.mkdirs();
            // Only the plain file name: the name ends up in a path.
            File file = new File(dir, new File(call.getString("name", "inkmap.inkshare")).getName());
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/octet-stream"); // a document, so chat apps send it as a file rather than text
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, call.getString("title", "Inkmap"));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, call.getString("title", "Share"));
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }
}
