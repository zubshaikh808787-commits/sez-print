package com.luckprinter.demo;

import androidx.annotation.StringRes;

import com.luckjingle.printersdk.R;

public enum MenuTypeEnum {
    SCAN(R.string.demo_menu_scan, "reScan"),
    DISCONNECT(R.string.action_disconnect, "disconnect"),
    PRINT(R.string.demo_menu_print, "print"),
    PRINT_LABEL(R.string.demo_menu_print_label, "printLabel"),
    PRINT_CIRCLE_LABEL(R.string.demo_menu_print_circle_label, "printCircleLabel"),
    PRINT_BLACK_LABEL(R.string.demo_menu_print_black_label, "printBlackLabel"),
    PRINT_TATTOO(R.string.demo_menu_print_tattoo, "printTattoo"),
    PRINT_SHEET_LABEL(R.string.demo_menu_print_sheet_label, "printSheetLabel"),
    PRINT_A4_FOLDER(R.string.demo_menu_print_a4_folder, "printA4Folder"),
    PRINTER_MODEL_LUCK(R.string.demo_menu_model, "printerModelLuck"),
    PRINTER_BOOT_LUCK(R.string.demo_menu_boot, "getBoot"),
    PRINTER_SN_LUCK(R.string.demo_menu_sn, "printerSNLuck"),
    GET_ALL_INFO(R.string.demo_menu_all_info, "getAllInfo"),
    PRINTER_VERSION_LUCK(R.string.demo_menu_firmware, "printerVersionLuck"),
    GET_SHUT_TIME(R.string.demo_menu_shut_time_get, "getShutTime"),
    PRINTER_STATUS_LUCK(R.string.demo_menu_status, "printerStatusLuck"),
    PRINTER_BATTERY_LLUCK(R.string.demo_menu_battery, "printerBatteryLuck"),
    GET_DENSITY(R.string.demo_menu_density_get, "getDensity"),
    SET_DENSITY(R.string.demo_menu_density_set, "setDensity"),
    GET_SPEED(R.string.demo_menu_speed_get, "getSpeed"),
    SET_SPEED(R.string.demo_menu_speed_set, "setSpeed"),
    SET_SHUTTIME_LUCK(R.string.demo_menu_shut_time_set, "setShutTimeLuck"),
    SET_RECOVERY_LUCK(R.string.demo_menu_recovery, "setRecoveryLuck"),
    GO_PAPER(R.string.demo_menu_go_paper, "goPaper"),
    REVERSE_GO_PAPER(R.string.demo_menu_reverse_go_paper, "reverseGoPaper"),
    PACK_ERROR_LOG(R.string.demo_menu_pack_error_log, "packErrorLog"),
    PRINTER_SETTING_LUCK(R.string.demo_menu_printer_setting, "printerSettingLuck"),
    ;

    @StringRes
    private final int labelResId;
    private final String type;

    MenuTypeEnum(@StringRes int labelResId, String type) {
        this.labelResId = labelResId;
        this.type = type;
    }

    @StringRes
    public int getLabelResId() {
        return labelResId;
    }

    public String getType() {
        return type;
    }

    public static MenuTypeEnum getByType(String type) {
        for (MenuTypeEnum item : values()) {
            if (item.getType().equals(type)) {
                return item;
            }
        }
        return null;
    }
}
