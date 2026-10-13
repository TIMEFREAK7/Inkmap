package com.timefreak7.inkmap;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

// A backup folder the person picks with the system folder picker. Unlike files the app creates in Documents,
// a picked folder stays fully readable and writable after a reinstall once it is picked again.
@CapacitorPlugin(name = "BackupFolder")
public class BackupFolderPlugin extends Plugin {
    private static final String PREFS = "inkmap", KEY = "backupFolder";

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        if (Build.VERSION.SDK_INT >= 26) {
            // Open at Documents; the person can go anywhere from there.
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:Documents"));
        }
        startActivityForResult(call, intent, "afterPick");
    }

    @ActivityCallback
    private void afterPick(PluginCall call, ActivityResult result) {
        Uri tree = result.getData() == null ? null : result.getData().getData();
        if (tree == null) {
            call.reject("No folder chosen");
            return;
        }
        getContext().getContentResolver().takePersistableUriPermission(tree,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        prefs().edit().putString(KEY, tree.toString()).apply();
        call.resolve(describe(tree));
    }

    // The chosen folder, if the app still holds permission for it (a reinstall loses it).
    @PluginMethod
    public void current(PluginCall call) {
        Uri tree = folder();
        call.resolve(tree == null ? new JSObject() : describe(tree));
    }

    @PluginMethod
    public void write(PluginCall call) {
        try {
            Uri dir = requireFolder();
            String name = call.getString("name");
            Uri doc = child(dir, name);
            if (doc == null) {
                doc = DocumentsContract.createDocument(resolver(), docUri(dir), "application/octet-stream", name);
            }
            try (OutputStream out = resolver().openOutputStream(doc, "wt")) {
                out.write(call.getString("data", "").getBytes(StandardCharsets.UTF_8));
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void read(PluginCall call) {
        try {
            Uri doc = child(requireFolder(), call.getString("name"));
            if (doc == null) throw new IllegalStateException("Not found: " + call.getString("name"));
            try (InputStream in = resolver().openInputStream(doc)) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                for (int n; (n = in.read(buf)) > 0; ) bytes.write(buf, 0, n);
                JSObject r = new JSObject();
                r.put("data", bytes.toString("UTF-8"));
                call.resolve(r);
            }
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void exists(PluginCall call) {
        try {
            JSObject r = new JSObject();
            r.put("exists", child(requireFolder(), call.getString("name")) != null);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        try {
            Uri doc = child(requireFolder(), call.getString("name"));
            if (doc != null) DocumentsContract.deleteDocument(resolver(), doc);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void rename(PluginCall call) {
        try {
            Uri doc = child(requireFolder(), call.getString("from"));
            if (doc == null) throw new IllegalStateException("Not found: " + call.getString("from"));
            DocumentsContract.renameDocument(resolver(), doc, call.getString("to"));
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    private Uri folder() {
        String saved = prefs().getString(KEY, null);
        if (saved == null) return null;
        Uri tree = Uri.parse(saved);
        for (UriPermission p : resolver().getPersistedUriPermissions()) {
            if (p.getUri().equals(tree) && p.isWritePermission()) return tree;
        }
        return null;
    }

    private Uri requireFolder() {
        Uri tree = folder();
        if (tree == null) throw new IllegalStateException("No backup folder chosen");
        return tree;
    }

    private Uri docUri(Uri tree) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    private Uri child(Uri tree, String name) {
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
        String[] cols = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
        try (Cursor c = resolver().query(children, cols, null, null, null)) {
            while (c != null && c.moveToNext()) {
                if (name.equals(c.getString(1))) return DocumentsContract.buildDocumentUriUsingTree(tree, c.getString(0));
            }
        }
        return null;
    }

    private JSObject describe(Uri tree) {
        JSObject r = new JSObject();
        r.put("uri", tree.toString());
        // "primary:Documents/Inkmap" -> "Documents/Inkmap", readable enough for Settings.
        String id = DocumentsContract.getTreeDocumentId(tree);
        r.put("name", id.substring(id.indexOf(':') + 1));
        return r;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private android.content.ContentResolver resolver() {
        return getContext().getContentResolver();
    }
}
