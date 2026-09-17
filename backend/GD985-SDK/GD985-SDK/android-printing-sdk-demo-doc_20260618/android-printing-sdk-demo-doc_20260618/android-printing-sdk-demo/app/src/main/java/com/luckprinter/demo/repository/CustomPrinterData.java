package com.luckprinter.demo.repository;

import com.luckjingle.printersdk.BuildConfig;
import com.luckprinter.sdk_new.PrinterUtil;
import com.luckprinter.sdk_new.device.CompressWayEnum;
import com.luckprinter.sdk_new.device.custom.CmdType;
import com.luckprinter.sdk_new.device.custom.Command;
import com.luckprinter.sdk_new.device.custom.PrinterCommand;
import com.luckprinter.sdk_new.device.custom.PrinterProperty;

import java.util.HashMap;
import java.util.List;

/**
 * @author HuangXiaohui
 * @date 2025-01-18 13:50
 */
public class CustomPrinterData {

    private HashMap<String, PrinterCommand> customCommandMap = new HashMap<>();
    private HashMap<String, PrinterProperty> customPropertyMap = new HashMap<>();
    private static volatile CustomPrinterData instance;

    private CustomPrinterData() {
        init();
    }

    public static CustomPrinterData getInstance() {
        if(instance == null) {
            synchronized(CustomPrinterData.class) {
                if(instance == null) {
                    instance = new CustomPrinterData();
                }
            }
        }
        return instance;
    }

    private void init() {
        if (BuildConfig.DEBUG) {
//            addY50P();
//            addP1();
//            addC50();
//            addBTW();
//            addU8();
//            addPPS1();
//            addSeznikMinix();
//            addPPS1H();
//            addMPL11();
//            addC2();
//            addA2LH();
        }
    }

    private void addY50P() {
//        PrinterProperty property =
//                new PrinterProperty.Builder()
//                        .speedList(List.of())
//                        .densityList(List.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16))
//                        .printerDpi(203)
//                        .printerMaxWidth(48)
//                        .printerType("normal")
//                        .supportSetSpeed(false)
//                        .build();
//
//        PrinterCommand command = new PrinterCommand();
//        command.setCompressWay(CompressWayEnum.ANGYIN.getKey());
//        command.setPrint(
//                List.of(
//                        new Command.Builder()
//                                .type(CmdType.ENABLE.getValue())
//                                .data("10fff103")
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.WAKE_UP.getValue())
//                                .data("000000000000000000000000")
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.PRINT_BITMAP.getValue())
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.FEED_PAPER.getValue())
//                                .data("1b4a8c")
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.DISABLE.getValue())
//                                .data("10fff145")
//                                .callback(true)
//                                .callbackData(List.of("4f4b", "aa"))
//                                .callbackTime(60 * 1000)
//                                .build()
//                )
//        );
//
//        command.setPrintTag(
//                List.of(
//                        new Command.Builder()
//                                .type(CmdType.ENABLE.getValue())
//                                .data("10fff103")
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.WAKE_UP.getValue())
//                                .data("000000000000000000000000")
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.NO_SET.getValue())
//                                .callback(false)
//                                .data("1f1151")
//                                .position("first")
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.PRINT_BITMAP.getValue())
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.POSITION.getValue())
//                                .data("1d0c")
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.NO_SET.getValue())
//                                .callback(false)
//                                .data("1f1150")
//                                .position("last")
//                                .build(),
//                        new Command.Builder()
//                                .type(CmdType.DISABLE.getValue())
//                                .data("10fff145")
//                                .callback(false)
//                                .callbackData(List.of())
//                                .build()
//                )
//        );
//        customPropertyMap.put("DP_Y50P_", property);
//        customCommandMap.put("DP_Y50P_", command);
    }

    private void addP1() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(203)
                        .printerMaxWidth(48)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a50")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));



        command.setPrintBlackTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("PPP1_", property);
        customCommandMap.put("PPP1_", command);
    }

    private void addC50() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(203)
                        .printerMaxWidth(48)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a60")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));



        command.setPrintBlackTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("LPC50_", property);
        customCommandMap.put("LPC50_", command);
    }

    private void addBTW() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(203)
                        .printerMaxWidth(12)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a10")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("BTW Identi-Express_", property);
        customCommandMap.put("BTW Identi-Express_", command);
    }

    private void addU8() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(203)
                        .printerMaxWidth(206)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("a4")
                        .supportSetSpeed(false)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.ANGYIN_FAST.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800110")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a90")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("first")
                                .data("1f1151")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1f1150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        command.setPrintBlackTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("first")
                                .data("1f1151")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1f1150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        command.setPrintFold(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800130")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .data("1f1151")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .data("1f1150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(90 * 1000)
                                .build()

                ));

        customPropertyMap.put("U8_", property);
        customCommandMap.put("U8_", command);
    }

    private void addPPS1H() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(300)
                        .printerMaxWidth(48)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a90")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800110")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));



        command.setPrintBlackTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("PPS1H_", property);
        customCommandMap.put("PPS1H_", command);
    }

    private void addPPS1() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(203)
                        .printerMaxWidth(48)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .supportPrintGray(true)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a50")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800110")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));



        command.setPrintBlackTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("PPS1_", property);
        customCommandMap.put("PPS1_", command);
    }

    private void addSeznikMinix() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(203)
                        .printerMaxWidth(48)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .supportPrintGray(true)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a38")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800110")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));



        command.setPrintBlackTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("Seznik MiniX_", property);
        customCommandMap.put("Seznik MiniX_", command);
    }

    private void addMPL11() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(203)
                        .printerMaxWidth(12)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a10")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("MPL11_", property);
        customCommandMap.put("MPL11_", command);
    }

    private void addC2() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(203)
                        .printerMaxWidth(48)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a60")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));



        command.setPrintBlackTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("PPC2_", property);
        customCommandMap.put("PPC2_", command);
    }

    private void addA2LH() {
        PrinterProperty property =
                new PrinterProperty.Builder()
                        .speedList(List.of())
                        .densityList(List.of(0, 1, 2))
                        .printerDpi(300)
                        .printerMaxWidth(48)
                        .btType("classic_ble")
                        .bleEnable(false)
                        .printerType("normal")
                        .supportSetSpeed(false)
                        .build();

        PrinterCommand command = new PrinterCommand();
        command.setCompressWay(CompressWayEnum.NORMAL.getKey());
        command.setPrint(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.FEED_PAPER.getValue())
                                .data("1b4a60")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()
                )
        );

        command.setPrintTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800120")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));



        command.setPrintBlackTag(
                List.of(
                        new Command.Builder()
                                .type(CmdType.ENABLE.getValue())
                                .data("10fff103")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.WAKE_UP.getValue())
                                .data("000000000000000000000000")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.SET_PAPER_TYPE.getValue())
                                .callback(true)
                                .callbackData(List.of("4f4b"))
                                .data("1f800150")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.PRINT_BITMAP.getValue())
                                .build(),
                        new Command.Builder()
                                .type(CmdType.POSITION.getValue())
                                .data("1d0c")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.NO_SET.getValue())
                                .position("last")
                                .data("1bbbbb")
                                .build(),
                        new Command.Builder()
                                .type(CmdType.DISABLE.getValue())
                                .data("10fff145")
                                .callback(true)
                                .callbackData(List.of("4f4b", "aa"))
                                .callbackTime(60 * 1000)
                                .build()

                ));

        customPropertyMap.put("PPA2LH_", property);
        customCommandMap.put("PPA2LH_", command);
    }

    public HashMap<String, PrinterCommand> getCustomCommandMap() {
        return customCommandMap;
    }

    public HashMap<String, PrinterProperty> getCustomPropertyMap() {
        return customPropertyMap;
    }
}
