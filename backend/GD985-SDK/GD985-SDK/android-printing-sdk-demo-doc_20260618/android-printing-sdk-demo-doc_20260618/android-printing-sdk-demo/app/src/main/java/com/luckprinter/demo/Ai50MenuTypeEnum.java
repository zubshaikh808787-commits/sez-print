package com.luckprinter.demo;

import androidx.annotation.StringRes;

import com.luckjingle.printersdk.R;

public enum Ai50MenuTypeEnum {
    SCAN(R.string.action_scan, "scan", false),
    DISCONNECT(R.string.action_disconnect, "disconnect", false),
    PRINT(R.string.action_print, "print", true),
    PRINTER_MODEL(R.string.action_model, "model", true),
    PRINTER_BOOT(R.string.action_boot, "boot", true),
    PRINTER_SN(R.string.action_sn, "sn", true),
    GET_ALL_INFO(R.string.action_all_info, "allInfo", true),
    PRINTER_VERSION(R.string.action_firmware, "firmware", true),
    GET_SHUT_TIME(R.string.action_shut_time_get, "shutTimeGet", true),
    PRINTER_STATUS(R.string.action_status, "status", true),
    PRINTER_BATTERY(R.string.action_battery, "battery", true),
    GET_DENSITY(R.string.action_density_get, "densityGet", true),
    SET_DENSITY(R.string.action_density_set, "densitySet", true),
    SET_SHUTTIME(R.string.action_shut_time_set, "shutTimeSet", true),
    SEND_WIFI(R.string.action_wifi_send, "wifiSend", true),
    GET_WIFI_STATE(R.string.action_wifi_state, "wifiState", true),
    GET_VOLUME(R.string.action_volume_get, "volumeGet", true),
    SET_VOLUME(R.string.action_volume_set, "volumeSet", true),
    RESET_DEVICE(R.string.action_factory_reset, "reset", true),
    SET_LANGUAGE(R.string.action_language_set, "languageSet", true),
    ;

    @StringRes
    private final int labelResId;
    private final String type;
    private final boolean requiresConnection;

    Ai50MenuTypeEnum(@StringRes int labelResId, String type, boolean requiresConnection) {
        this.labelResId = labelResId;
        this.type = type;
        this.requiresConnection = requiresConnection;
    }

    @StringRes
    public int getLabelResId() {
        return labelResId;
    }

    public String getType() {
        return type;
    }

    public boolean requiresConnection() {
        return requiresConnection;
    }

    public static Ai50MenuTypeEnum getByType(String type) {
        for (Ai50MenuTypeEnum item : values()) {
            if (item.getType().equals(type)) {
                return item;
            }
        }
        return null;
    }
}
