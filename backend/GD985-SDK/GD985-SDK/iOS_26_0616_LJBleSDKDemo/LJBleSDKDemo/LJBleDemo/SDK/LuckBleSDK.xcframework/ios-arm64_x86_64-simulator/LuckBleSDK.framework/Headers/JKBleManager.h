//
//  LGBleManager.h
//  LuckBleSDK
//
//  Created by junky on 2023/9/27.
//

#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>
#import <LuckBleSDK/LuckPrinter.h>


#define kBleDidConnectPeripheralNoticeName @"kBleDidConnectPeripheralNoticeName"
#define kBleDidDisconnectPeripheralNoticeName @"kBleDidDisconnectPeripheralNoticeName"
#define kBleDidFailToConnectPeripheralNoticeName @"kBleDidFailToConnectPeripheralNoticeName"
#define kBleDidChangeStateNoticeName @"kBleDidChangeStateNoticeName"
#define kBleDidPeripheralFoundNoticeName @"kBleDidPeripheralFoundNoticeName"



NS_ASSUME_NONNULL_BEGIN

@interface JKBleManager : NSObject


/// 连接的设备
@property (nonatomic , strong, nullable) LuckPrinter *printer;

/// 蓝牙是否可用
@property (nonatomic , readonly) CBManagerState bleState;


// appKey，错误的appkey将被禁止连接设备
@property (nonatomic , copy) NSString *asKey;
// 海外版appkey
@property (nonatomic , copy) NSString *abroadAsKey;

// 是否主动连接上一次的打印机
@property (nonatomic , assign) BOOL isConnectLast;

/// 单例
+ (instancetype)sharedInstance;

- (NSString * __nullable)lastConnectPrinterName;

- (NSDictionary *)getLastConnectPrinterInfo;

- (NSArray <CBPeripheral *>*)getSystemConnectPrinter;


/// 自动连接最后连接的设备（如果有）
- (void)autoConnectToLastPrinterIfHas;

/// 扫描设备
- (void)scanPrinters;

/// 结束扫描
- (void)stopScanPrinters;

/// 按名字连接，扫码连接用
/// - Parameter name: 设备名字
- (void)connectPrinterwhichNameIs:(NSString *)name;

/// 连接设备
/// - Parameter peripheral: 蓝牙外设
- (void)connect:(CBPeripheral *)peripheral timeout:(NSTimeInterval)interval;

/// 断开设备
/// - Parameter peripheral: 蓝牙外设
- (void)disconnect:(CBPeripheral *)peripheral;


/// 取消连接
- (void)cancelConnectFromName;

@end

NS_ASSUME_NONNULL_END
