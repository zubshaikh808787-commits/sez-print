package com.luckprinter.demo;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Paint;

/**
 * @author HuangXiaohui
 * @date 2024-07-26 15:35
 */
public class SPUtil {
    public static final String FILE_NAME = "app_demo";
    public static class Keys {
        public static final String TAG_WIDTH = "tag_width";
        public static final String TAG_HEIGHT = "tag_height";
        public static final String TAG_CIRCLE_WIDTH = "tag_circle_width";
        public static final String TAG_CIRCLE_HEIGHT = "tag_circle_height";
        public static final String TAG_BLACK_WIDTH = "tag_black_width";
        public static final String TAG_BLACK_HEIGHT = "tag_black_height";
        public static final String TAG_PRINT_FILE_PATH = "tag_file_path";
        public static final String TAG_BLACK_PRINT_FILE_PATH = "tag_black_file_path";
    }

    public static int getTagWidth() {
        return getInt(Keys.TAG_WIDTH, -1);
    }

    public static int getTagHeight() {
        return getInt(Keys.TAG_HEIGHT, -1);
    }

    public static void putTagWidth(int tagWidth) {
        putInt(Keys.TAG_WIDTH, tagWidth);
    }

    public static void putTagHeight(int tagHeight) {
        putInt(Keys.TAG_HEIGHT, tagHeight);
    }

    public static int getCircleTagWidth() {
        return getInt(Keys.TAG_CIRCLE_WIDTH, -1);
    }

    public static int getCircleTagHeight() {
        return getInt(Keys.TAG_CIRCLE_HEIGHT, -1);
    }

    public static void putCircleTagWidth(int tagWidth) {
        putInt(Keys.TAG_CIRCLE_WIDTH, tagWidth);
    }

    public static void putCircleTagHeight(int tagHeight) {
        putInt(Keys.TAG_CIRCLE_HEIGHT, tagHeight);
    }

    public static int getTagBlackWidth() {
        return getInt(Keys.TAG_BLACK_WIDTH, -1);
    }

    public static int getTagBlackHeight() {
        return getInt(Keys.TAG_BLACK_HEIGHT, -1);
    }

    public static void putTagBlackWidth(int tagWidth) {
        putInt(Keys.TAG_BLACK_WIDTH, tagWidth);
    }

    public static void putTagBlackHeight(int tagHeight) {
        putInt(Keys.TAG_BLACK_HEIGHT, tagHeight);
    }

    public static void putTagPrintFilePath(String filePath) {
        putString(Keys.TAG_PRINT_FILE_PATH, filePath);
    }

    public static String getTagPrintFilePath() {
        return getString(Keys.TAG_PRINT_FILE_PATH, null);
    }

    public static void putTagBlackPrintFilePath(String filePath) {
        putString(Keys.TAG_BLACK_PRINT_FILE_PATH, filePath);
    }

    public static String getTagBlackPrintFilePath() {
        return getString(Keys.TAG_BLACK_PRINT_FILE_PATH, null);
    }

    public static void putString(String key, String value) {
        Context context = App.getContext();
        SharedPreferences sp = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor edit = sp.edit();
        edit.putString(key, value);
        edit.commit();
    }

    public static String getString(String key, String defaultValue) {
        Context context = App.getContext();
        SharedPreferences sp = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
        return sp.getString(key, defaultValue);
    }

    public static void putInt(String key, int value) {
        Context context = App.getContext();
        SharedPreferences sp = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor edit = sp.edit();
        edit.putInt(key, value);
        edit.commit();
    }

    public static int getInt(String key, int defaultValue) {
        Context context = App.getContext();
        SharedPreferences sp = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE);
        return sp.getInt(key, defaultValue);
    }
}
