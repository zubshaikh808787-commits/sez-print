//
//  LuckConfigModel.h
//  LuckPrinterSDK
//
//  Created by apple on 2025/2/15.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM (NSUInteger, LuckCommandType) {
    enable,
    wake_up,
    paper_type,
    print_bitmap,
    feed_paper,
    position,
    adjust_paper,
    disable,
    size_tspl,
    gap_tspl,
    speed_tspl,
    density_tspl,
    clear_tspl,
    print_count_tspl,
    no_set,
    unkonwn,
};

@interface LuckCommondModel : NSObject

// type 类型定义
//ENABLE("enable"),//使能
//WAKE_UP("wake_up"),//唤醒
//SET_PAPER_TYPE("set_paper_type"),//设置纸张类型
//PRINT_BITMAP("print_bitmap"),//打印位图
//FEED_PAPER("feed_paper"),//走纸
//POSITION("position"),//定位
//ADJUST_PAPER("adjust_paper"),//退纸/进纸
//DISABLE("disable"),//失能
//SIZE_TSPL("size_tspl"),
//GAP_TSPL("gap_tspl"),
//CLEAR_TSPL("clear_tspl"),
//SET_SPEED_TSPL("set_speed_tspl"),
//SET_DENSITY_TSPL("set_density_tspl"),
//SET_PRINT_COUNT_TSPL("set_print_count_tspl"),
//NO_SET("no_set"),//未知


/// 指令类型
@property (nonatomic, copy) NSString *type;
/// 指令
@property (nonatomic, copy) NSString *data;
/// 是否等待返回数据
@property (nonatomic, assign) BOOL callback;
/// 等待的返回数据
@property (nonatomic, copy) NSArray *callbackData;
/// 等待返回数据的时间，单位ms
@property (nonatomic, assign) NSInteger callbackTime;
/// 指令发送位置：first/last/ always或null都是每条发
@property (nonatomic, copy) NSString *position;


/// 自定义属性 指令类型
@property (nonatomic, assign) LuckCommandType cmdType;
/// 自定义属性 字符串表示的16进制（如：1f800120） 转为指令 data
@property (nonatomic, strong) NSData *commandData;


@end

@interface LuckConfigCommandModel : NSObject

@property (nonatomic, copy) NSString * language;
/// 连续纸打印指令
@property (nonatomic, copy) NSArray <LuckCommondModel *>* print;
/// 折叠纸打印指令
@property (nonatomic, copy) NSArray <LuckCommondModel *>* printFold;
/// 标签纸打印指令
@property (nonatomic, copy) NSArray <LuckCommondModel *>* printTag;
/// 黑标纸打印指令（目前没用，预留）
@property (nonatomic, copy) NSArray <LuckCommondModel *>* printBlackTag;
/// 纹身纸打印指令
@property (nonatomic, copy) NSArray <LuckCommondModel *>* printTattoo;
/// 压缩方式 : normal(无压缩) / angyin / angyin_fast / angyin_tspl / zlib
@property (nonatomic, copy) NSString * compressWay;
/// 用于面单机判断是否支持传递多张打，比如之前GD985 就是一张一张打，不支持传递多张
@property (nonatomic, assign) BOOL supportPrintMulti;

@end

@interface LuckConfigBootCommandModel : NSObject

@property (nonatomic, copy) NSArray <LuckCommondModel *>* commands;

@end


@interface LuckConfigPaperSizeList : NSObject

@property (nonatomic, copy) NSString * mm;
@property (nonatomic, copy) NSString * realMm;

@end


@interface LuckConfigPropertyModel : NSObject

/// 蓝牙类型，android 自用，取值：classic/blue_dual/classic_ble
@property (nonatomic, copy) NSString * btType;
@property (nonatomic, assign) NSInteger version;
/// 是否开启ble，android 自用
@property (nonatomic, assign) BOOL bleEnable;
/// 打印机dpi：203/300
@property (nonatomic, assign) NSInteger printerDpi;
/// 浓度列表
@property (nonatomic, copy) NSArray * densityList;
/// 速度列表
@property (nonatomic, copy) NSArray * speedList;
/// 打印机机型：normal（普通打印机）/sheet_label（面单机）/a4（A4打印机）
@property (nonatomic, copy) NSString * printerType;
/// 连续纸纸张列表
@property (nonatomic, copy) NSArray <LuckConfigPaperSizeList *>* paperSizeList;
/// 最大可打印宽度，单位：mm
@property (nonatomic, assign) NSInteger printerMaxWidth;
/// 是否支持设置速度
@property (nonatomic, assign) BOOL supportSetSpeed;
/// 是否支持打印纹身
@property (nonatomic, assign) BOOL supportPrintTattoo;
/// 是否支持标签打印
@property (nonatomic, assign) BOOL supportPrintLabel;
/** 是否支持获取mac地址指令( ios 用)  */
@property (nonatomic, assign) BOOL supportGetMac;
/// 是否支持灰度打印
@property (nonatomic, assign) BOOL supportPrintGray;
/// lujiang/yinxiang/hanyin/aiyin/ 可根据此区分固件升级逻辑，没传默认用lujiang（鹿匠）的升级协议 空默认鹿匠
@property (nonatomic, copy) NSString *manufacturer;

/// 走纸距离(点数)
@property (nonatomic, assign) NSInteger paperFeedDots;
/// 私有属性
@property (nonatomic, assign) NSInteger lastPaperFeedDots;

/*********** Luis Link 额外打印机属性 begin *************/
 /** 蓝牙名称前缀 */
// var bluetooth_list: List<String>? = null,
 /** 打印机唯一id 取值类型：sn / mac */
// var deviceIdType: String = "sn",
 /** 支持的纸张类型: "roll", "fold", "tattoo", "normal_label", "black_label", "sheet_label", "mini_label" **/
// var supportPaperTypes: List<String> = listOf(),
 /** wifi打印机的密码 */
// var wifi_wpas2: String? = null,
 /** 卷纸纸张大小 */
// var paperWidthSize: List<Int>? = null,
 /** A4纸张大小 */
// var a4PageSize: List<PaperSizeData>? = null,
 /** 纹身纸张大小 */
// var tattooPaperSize: List<PaperSizeData>? = null,
 /** 纹身画布大小 */
// var tattooCanvasSize: List<PaperSizeData>? = null,
 /** 标签纸张大小 */
// var labelPaperSize: List<PaperSizeData>? = null,
 /*********** Luis Link 额外打印机属性 end *************/

@property (nonatomic, copy) NSArray *bluetooth_list;
@property (nonatomic, copy) NSString *wifi_wpas2;
@property (nonatomic, copy) NSString *deviceIdType;
@property (nonatomic, copy) NSArray *supportPaperTypes;
@property (nonatomic, copy) NSArray *paperWidthSize;
@property (nonatomic, copy) NSArray *a4PageSize;
@property (nonatomic, copy) NSArray *tattooPaperSize;
@property (nonatomic, copy) NSArray *tattooCanvasSize;
@property (nonatomic, copy) NSArray *labelPaperSize;

@end


@interface LuckConfigModel : NSObject

@property (nonatomic, copy) NSString * model;
@property (nonatomic, copy) NSArray * bluetoothList;
@property (nonatomic, strong) LuckConfigPropertyModel * property;


// detail 接口加的属性

// 机型所属客户 customer（lujiang/wutong/shiyizhong）
@property (nonatomic, copy) NSString * customer;
// 所属大类printerCategory(1:mini pockdet 2:a4 3:mini label 4:tattoo 5.label 6.面单机（目前还没这个，预留）， 7. 文档纹身机，就是a49 那些)）
@property (nonatomic, assign) NSInteger printerCategory;
// bootCommand 是连接后要发送的指令，bootCommand 这个可以是非自定义设备也可能会有配置。
@property (nonatomic, strong) LuckConfigBootCommandModel * bootCommand;
// command是自定义打印指令
@property (nonatomic, strong) LuckConfigCommandModel * command;

@end


NS_ASSUME_NONNULL_END
