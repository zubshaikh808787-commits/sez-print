//
//  LuckPrinterInfo.h
//  LuckBleSDK
//
//  Created by junky on 2023/10/31.
//

//#import <LuckBleSDK/LuckBleSDK.h>
#import <Foundation/Foundation.h>
#import <LuckBleSDK/LuckLabelSize.h>


NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSInteger, LPManufacturerType) {
    // 爱印
    LPManufacturerAY,
    // JRP
    LPManufacturerJRP,
    // 印向
    LPManufacturerYX,
    // 汉印
    LPManufacturerHain,
    // D400
    LPManufacturerZJ,
    // lujiang
    LPManufacturerLJ,
    // 未知 默认
    LPManufacturerUnknown = -1
};

/// 纸张类型
typedef NS_ENUM(NSUInteger, LPPaperType) {
    // 卷纸纸
    LPPaperTypeJZ = 0x10,
    // 标签纸
    LPPaperTypeBQ = 0x20,
    // 折叠纸
    LPPaperTypeZD = 0x30,
    // 纹身纸
    LPPaperTypeWS = 0x40,
    // 黑标标签纸
    LPPaperTypeHBBQ = 0x50,
    // 圆形标签
    LPPaperTypeCircleLabel = 0x21,
    // 水转印纸
    LPPaperTypeWZY = 0x60,
};


/// 状态
typedef NS_OPTIONS(NSUInteger, LPPrinterState) {
    // 打印中
    LPPrinterStatePrinting = 1 << 0,
    // 开盖
    LPPrinterStateOpenCover = 1 << 1,
    // 缺纸
    LPPrinterStateOutPaper = 1 << 2,
    // 低电
    LPPrinterStatePower = 1 << 3,
    // 过热
    LPPrinterStateHot = 1 << 4,
    
    LPPrinterStateCharging = 1 << 6,
    
    LPPrinterStateMotorHot = 1 << 7,
    // 繁忙
    LPPrinterStateBusy = 1 << 8,
    
    LPPrinterStateOther = 1 << 9,
    // 没有找到标签纸
    LPPrinterStateNoFoundLabel = 1 << 10,
    // none
    LPPrinterStateNone = 1 << 11
};


typedef NS_ENUM(NSUInteger, LPPrinterDateFormat) {
    LPPrinterDateFormatYMDHms = 0,  // YYYY-MM-DDhh:mm:ss
    LPPrinterDateFormatYMD = 1,     // YYYY-MM-DD
    LPPrinterDateFormatMD = 2,      // MM/DD
    LPPrinterDateFormatYMDHm = 3,   // YYYY/MM/DD/hh/mm
    LPPrinterDateFormatMDHm = 4,    // MM/DD/hh/mm
    LPPrinterDateFormatYMD1 = 5,    // YYYY/MM/DD
    LPPrinterDateFormatDMY = 6,     // DD/MM/YYYY
    LPPrinterDateFormatUnknow = 7,     // DD/MM/YYYY
};

/// 鹿匠打印机类型
typedef NS_OPTIONS(NSInteger, LJPrinterType) {
    // A4机
    LJA4Printer               = 2,
    // 2寸 迷你打印机
    LJMiniPocketPrinter       = 1,
    // 纹身机
    LJTattooPrinter           = 4,
    // 半寸 迷你标签机
    LJMiniLabelPrinter        = 3,
    // 标签机
    LJLabelPrinter            = 5,
    // 文档纹身机
    LJDocumentTattooPrinter   = 7,
    // 面单机
    LJSheetPrinter            = 6,
    // wifi打印机 2寸口袋打印机
    LJWifiPocketPrinter       = 8,
    // 未知
    LJUnknownPrinter          = -1
};


@interface LuckPrinterInfo : NSObject


/// uuid
@property (nonatomic , copy) NSUUID *uuid;

/// 厂家
@property (nonatomic , readonly) LPManufacturerType manufacturer;

/// 型号
@property (nonatomic , copy, nullable) NSString *model;

/// 蓝牙名字
@property (nonatomic , copy, nullable) NSString *name;

/// mac地址
@property (nonatomic , copy, nullable) NSString *mac;

/// sn
@property (nonatomic , copy, nullable) NSString *sn;

/// 固件版本
@property (nonatomic , copy, nullable) NSString *version;

/// 状态
@property (nonatomic , assign) LPPrinterState state;

/// 浓度，设置浓度后，打印前会给设备设置浓度，默认适中 1
@property (nonatomic , assign) NSUInteger thick;

/// 关机时间
@property (nonatomic , assign) NSUInteger closeTime;

/// 电量
@property (nonatomic , assign) NSUInteger power;

/// 打印速度
@property (nonatomic , assign) NSUInteger speed;

/// 点密度
@property (nonatomic , readonly) NSUInteger dpi;

/// 支持的宽度 如：2 in 54mm
@property (nonatomic , readonly) NSArray <NSString *>*supportWidthFormm;

@property (nonatomic , assign) CGFloat supportMaxWidth;

/// 当前纸张类型 A4才支持
@property (nonatomic , assign) LPPaperType paperType;

/// 支持的标签尺寸
@property (nonatomic , readonly) NSArray <LuckLabelSize *>*supportLabelSizes;

/// 当前纸张尺寸
@property (nonatomic , strong, nullable) LuckLabelSize *labelSize;

/// 标签打印的尺寸
@property (nonatomic , strong, nullable) LuckLabelSize *sizeForLabelPrint;


/// 是否是A4
@property (nonatomic , readonly) BOOL isA4Model;

/// 是否是mini
@property (nonatomic , readonly) BOOL isMiniModel;

/// 是否是面单
@property (nonatomic , readonly) BOOL isMDModel;

/// 是否纹身打印机
@property (nonatomic , readonly) BOOL isTattooModel;
// 是否是mini标签机
@property (nonatomic , readonly) BOOL isLabelModel;
// 是否是标签机
@property (nonatomic , readonly) BOOL isMiniLabel;

@property (nonatomic , readonly) BOOL configurable;

// 线上配置信息 打印机类型
//int MINI_POCKET = 1;
//int A4 = 2;
//int MINI_LABEL = 3;
//int TATTOO = 4;
//int LABEL = 5;
//int SHEET_LABEL = 6;
//int A4_TATTOO = 7;
//所属大类printerCategory(1:mini pockdet 2:a4 3:mini label 4:tattoo 5.label 6.面单机（目前还没这个，预留）， 7. 文档纹身机，就是a49 那些)）
// 0就是没有配置信息
@property (nonatomic, readonly) NSInteger printerCategory;

/// 打印机类型
@property (nonatomic, readonly) LJPrinterType printerType;

/// 面单机的属性
@property (nonatomic , assign) int gapM;

/// 面单机的size
@property (nonatomic , assign) CGFloat mdWidth;

/// 面单机的size
@property (nonatomic , assign) CGFloat mdHeight;

/// 面单机的M
@property (nonatomic , assign) NSUInteger mdM;


/// 走纸长度，设备需要走纸时用到
@property (nonatomic , assign) NSUInteger walkLong;

/// 最大支持浓度
@property (nonatomic , readonly) NSUInteger maxDensity;

/// 最大支持的速度
@property (nonatomic , readonly) NSUInteger maxSpeed;

/// 图片是否需要拉伸（图片做抖动或二值之前做处理） 默认1 不需要
@property (nonatomic, readonly) CGFloat imageStretchRatio;

@property (nonatomic , readonly) LPPrinterDateFormat format;

// DPD80 单独需求
@property (nonatomic , assign) NSInteger heatLevel;

// 是否支持灰度打印
@property (nonatomic , readonly) BOOL isSupportGrayPrint;
// 支持灰度打印 阶数
@property (nonatomic , copy) NSString *supportPrintGrayLevels;
// 打印灰度阶数 默认16
@property (nonatomic, assign) NSInteger grayLevel;


// wifi打印机有的属性
@property (nonatomic, copy) NSString *ssid;
@property (nonatomic, assign) NSInteger volume;
@property (nonatomic, assign) NSInteger maxVolume;
@property (nonatomic, assign) NSInteger wifiStatus;


/// 最后连接的设备， 目前没用
+ (LuckPrinterInfo *)lastConnectPrinter;

/// 设置为最后连接的设备， 目前没用
- (void)setToLastConnectPrinter;



@property (class, nonatomic , readonly) NSArray *filterPrefixList;
@property (nonatomic , copy) NSString *prefix;

// 配置信息的速度支持列表
@property (nonatomic, copy, readonly) NSArray *speedList;
// 配置信息的浓度支持列表
@property (nonatomic, copy, readonly) NSArray *densityList;

#pragma mark - Method
// 设置的走纸距离
@property (nonatomic, assign) NSUInteger configWalkLong;
// 设置走纸距离 单位mm毫米
- (void)setPrinterWalkLong:(NSUInteger)walkLong;

@end

NS_ASSUME_NONNULL_END
