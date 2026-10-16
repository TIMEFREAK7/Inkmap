package com.timefreak7.inkmap;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

// Home-screen widget: continents, countries and cities, as last saved by the app (WidgetPlugin). Tap opens the app.
public class InkmapWidget extends AppWidgetProvider {
    static final String PREFS = "inkmapWidget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, InkmapWidget.class));
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    private static RemoteViews views(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget);
        int colour = p.getInt("colour", 0xFF5EE0C8);
        count(v, R.id.continents, R.id.continents_label, p.getInt("continents", 0), "continent", "continents", colour);
        count(v, R.id.countries, R.id.countries_label, p.getInt("countries", 0), "country", "countries", colour);
        count(v, R.id.cities, R.id.cities_label, p.getInt("cities", 0), "city", "cities", colour);
        v.setTextColor(R.id.widget_title, colour);
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.widget_root,
            PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        return v;
    }

    private static void count(RemoteViews v, int value, int label, int n, String one, String many, int colour) {
        v.setTextViewText(value, String.valueOf(n));
        v.setTextColor(value, colour);
        v.setTextViewText(label, n == 1 ? one : many);
    }
}
