//
//  LuckPrinter.h
//  LuckBleSDK
//
//  Created by junky on 2023/9/18.
//


#import <UIKit/UIKit.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <LuckBleSDK/LuckPrinterInfo.h>
#import <LuckBleSDK/LPSendTask.h>
#import <LuckBleSDK/ConfigCommand.h>
#import <LuckBleSDK/LJError.h>
#import <LuckBleSDK/LuckPrintConfig.h>
#import <LuckBleSDK/LuckConfig.h>


#define kLuckPrinterDidNotSupportNoticeName @"kLuckPrinterDidNotSupportNoticeName"
#define kLuckPrinterCanSendTaskNoticeName @"kLuckPrinterCanSendTaskNoticeName"

#define kLuckPrinterPaperCantLocationName @"kLuckPrinterPaperCantLocationName"

#define kLuckPrinterGetModelName @"kLuckPrinterGetModelName"


NS_ASSUME_NONNULL_BEGIN
/// isFinish 表示是否结束打印，不会在有继续或暂停
typedef void(^PrintCompelete)(NSError * _Nullable error, BOOL isFinish, NSUInteger printCount, NSUInteger printIndex);
// 打印机基类
@interface LuckPrinter : LuckPrinterInfo <CBPeripheralDelegate>

#pragma mark - 基础功能

@property (nonatomic , strong) dispatch_queue_t queue;
@property (nonatomic , strong, nullable) CBPeripheral *peripheral;
@property (nonatomic , strong) CBCharacteristic *writeCht;
@property (nonatomic , strong) CBCharacteristic *writeWithoutRspCht;

@property (nonatomic , assign) NSUInteger credit;
@property (nonatomic , assign) NSUInteger mtu;
@property (nullable , nonatomic , strong) NSMutableArray *imageList;
@property (nonatomic , assign) NSUInteger index;


@property (nonatomic , assign) BOOL isLabel;
@property (nonatomic , copy, nullable)TaskCompelete errorCompelete;

/// 通用打印回调
@property (nonatomic, copy, nullable) PrintCompelete normalPrintComplete;
/// 打印暂停状态
@property (nonatomic, assign) PrintPauseStatus pauseStatus;

@property (nonatomic , readonly) BOOL needAlign;

// 是否线上配置信息
@property (nonatomic , readonly) BOOL isConfig;
// 是否是打印灰度图
@property (nonatomic, assign) BOOL isPrinrGray;

@property (nonatomic , strong) NSData *otaData;
@property (nonatomic , assign) NSUInteger otaSendLoc;
@property (nonatomic , assign) NSInteger otaMtu;
@property (nonatomic , assign) NSInteger otaVersion;
@property (nonatomic , copy) TaskCompelete otaCompelete;
@property (nonatomic, assign) LJOTASate otaSate;
/// OTA进度回调
@property (nonatomic, copy) OTAProcessBlcok otaProcessBlcok;
/// 任务数组 (新的指令发送都有回复)
//@property (nonatomic, strong) NSMutableArray <LPSendTask *>* taskArray;

/// 发送任务
/// - Parameter task: 根据任务发送
- (void)sendTask:(LPSendTask *)task;
// 获取是否有执行中的任务
- (BOOL)isHaveTask;
// 清除任务
- (void)stopCurrentTask;
// 取消所有打印任务
- (void)clearPrintTask;

#pragma mark - interface


- (void)getState:(void(^)(LPPrinterState))compelete;

/// 同步属性到打印机
- (void)synchronizeToPrinterCompelete:(void(^)(void))compelete;

/// 获取打印机信息
/// - Parameter callback: 回调
- (void)getPrinterInfo:(nullable void(^)(LuckPrinterInfo *info, NSError * _Nullable error))callback;


/// 升级固件， 会先查询状态
/// - Parameters:
///   - versionData: 固件
///   - callback: 回调
- (void)updateVersion:(NSData *)versionData callback:(nullable void(^)(NSError * _Nullable error))callback;


/// 升级固件， 会先查询状态
/// - Parameters:
///   - versionData: 二进制固件进制
///   - process: 升级进度
///   - callback: 升级回调
- (void)updateVersion:(NSData *)versionData onProcess:(OTAProcessBlcok)process callback:(nullable void(^)(NSError * _Nullable error))callback;

/// - LJOTA安全更新
- (void)safeUpdateVersion:(NSData *)versionData callback:(nullable void(^)(NSError *error))callback;


/// 打印标签，会先查询状态
/// - Parameters:
///   - images: 图片列表
///   - copies: 份数
///   - callback: 回调
- (void)printLabelImages:(NSArray <UIImage *>*)images copies:(NSUInteger)copies callback:(nullable void(^)(NSError * _Nullable error))callback;



/// 打印纹身，会先查询状态
/// - Parameters:
///   - images: 图片列表
///   - copies: 份数
///   - callback: 回调
- (void)printTattooImages:(NSArray <UIImage *>*)images copies:(NSUInteger)copies callback:(nullable void(^)(NSError * _Nullable error))callback;


/// 打印非标签， 会先查询状态
/// - Parameters:
///   - images: 图片列表
///   - copies: 份数
///   - callback: 回调
- (void)printImages:(NSArray <UIImage *>*)images copies:(NSUInteger)copies callback:(nullable void(^)( NSError * _Nullable error))callback;

/// 灰度打印非标签， 会先查询状态
/// - Parameters:
///   - images: 图片列表
///   - copies: 份数
///   - callback: 回调
- (void)printGrayImages:(NSArray <UIImage *>*)images copies:(NSUInteger)copies callback:(nullable void(^)( NSError * _Nullable error))callback;

/// 灰度打印标签， 会先查询状态
/// - Parameters:
///   - images: 图片列表
///   - copies: 份数
///   - callback: 回调
- (void)printGrayLabelImages:(NSArray <UIImage *>*)images copies:(NSUInteger)copies callback:(nullable void(^)( NSError * _Nullable error))callback;


/// 缩放到打印机使用的尺寸，前提必选当前有连接设备，注意如果是标签打印，请先设置isLabel为YES
/// - Parameter image: 要缩放的图片
- (UIImage *)normalPreviewImage:(UIImage *)image;

/// 缩放切二值化
/// - Parameter image: 要处理的图片
- (UIImage *)ezPreviewImage:(UIImage *)image;

/// 缩放切抖动
/// - Parameter image: 要处理的图片
- (UIImage *)ddPreviewImage:(UIImage *)image;


- (void)getPowerCompelete:(void(^)(NSUInteger))compelete;

// 以下为内部集成用
- (void)bqSendImageLoopCompelete:(TaskCompelete)compelete;
- (void)jzSendImageLoopCompelete:(TaskCompelete)compelete;
- (void)zdSendImageLoopCompelete:(TaskCompelete)compelete;
- (void)wsSendImageLoopCompelete:(TaskCompelete)compelete;
- (void)mdSendImageLoopCompelete:(void (^)(void))compelete;
// 灰度
- (void)bqGraySendImageLoopCompelete:(TaskCompelete)compelete;
- (void)jzGraySendImageLoopCompelete:(TaskCompelete)compelete;
- (void)zdGraySendImageLoopCompelete:(TaskCompelete)compelete;

- (void)getInfoCompelete:(TaskCompelete)compelete;






- (void)adjustTimeFormat:(UInt8)format date:(NSDate *)date Compelete:(TaskCompelete)compelete;
- (void)getTimeFormatCompelete:(TaskCompelete)compelete;











- (void)printerWakeCompelete:(TaskCompelete)compelete;
- (void)printerEnableCompelete:(TaskCompelete)compelete;
- (void)printerDisableCompelete:(TaskCompelete)compelete;


- (void)sendOtaCleanData:(NSData *)data Compelete:(TaskCompelete)compelete;
- (void)otaLoop;



- (void)printRollImages:(NSArray <UIImage *>*)images copies:(NSUInteger)copies callback:(nullable void(^)( NSError * _Nullable error))callback;

- (void)printFoldImages:(NSArray <UIImage *>*)images copies:(NSUInteger)copies callback:(nullable void(^)( NSError * _Nullable error))callback;

- (void)sendTaskList:(NSArray <LPSendTask *>*)list compelete:(TaskCompelete)compelete;

- (void)sendConfigTaskList:(NSArray <ConfigCommand *>*)list compelete:(TaskCompelete)compelete;


#pragma mark - 机器授权刷SN

/// 对设备进行授权
/// - Parameters:
///   - devList: 授权的设备型号(数组为空默认所有)
///   - compelete: 完成回调
- (void)deviceAuthWithList:(NSArray *)devList Compelete:(void(^)(NSError *error))compelete;
- (void)deviceWriteModel:(NSString *)model;


#pragma mark - 通用打印
/// 通用打印
/// - Parameters:
///   - images: 打印图片数组
///   - config: 打印配置
///   - complete: 打印回调
- (void)normalPrintImages:(NSArray <UIImage *> *)images config:(LuckPrintConfig *)config callback:(PrintCompelete)complete;

- (void)pausePrint;

- (void)resumePrint;

#pragma mark - BootCommand 设置
- (void)verifykDeviceMD5Command:(LuckConfigBootCommandModel *)bootCommand;
- (void)setDeviceSettingCommand:(LuckConfigBootCommandModel *)setCommand;

@end

NS_ASSUME_NONNULL_END
