//
//  LJWiFiConfig.h
//  LuckBleSDK
//
//  Created by apple on 2026/4/7.
//

#import <Foundation/Foundation.h>
#import <LuckBleSDK/LuckPrinterInfo.h>
/// 设备主动上报的状态
typedef NS_ENUM (NSInteger, LJWiFiStatus) {
    /// 连接中
    LJWiFiStatusConnecting    = 6000,
    /// 连接成功
    LJWiFiStatusSuccess       = 6001,
    /// 密码错误
    LJWiFiStatusPWDError      = 6002,
    /// 断开连接
    LJWiFiStatusDisconnect    = 6003,
    /// 未知
    LJWiFiStatusNone          = 6009,
};

/// APP查询的状态
typedef NS_ENUM (NSInteger, LJWiFiQueryStatus) {
    /// 未连接
    LJWiFiQueryStatusNone          = 0,
    /// 连接中
    LJWiFiQueryStatusConnecting    = 1,
    /// 已连接
    LJWiFiQueryStatusConnected     = 2
};


NS_ASSUME_NONNULL_BEGIN

@interface LJWiFiConfig : NSObject

/// 单例
+ (instancetype)sharedInstance;


// 配网
- (void)wifiConfigSSID:(NSString *)ssid pwd:(NSString *)pwd complete:(void(^)(LJWiFiStatus status, NSError * _Nullable error))callback;

// 重置设备
- (void)wifiResetDevice;

// 查询wifi连接状态
- (void)getWifiConnectStatusComplete:(void(^)(LJWiFiQueryStatus status, NSError * _Nullable error))callback;

// 监听wifi打印机连接状态
- (void)addWifiStatus:(void(^)(LJWiFiStatus status, NSError * _Nullable error))callback;

// 获取周围WiFi
//- (void)getWifiPrinterAroundSignal:(NSInteger)count complete:(void(^)(NSArray <NSString *>*wifiList, NSError * _Nullable error))callback;

// 获取wifi打印机设备信息
- (void)getWifiPrinterDeviceInfoComplete:(void (^)(LuckPrinterInfo *info, NSError * _Nullable))callback;
/// 设置关机时间
- (void)setWifiPrinterCloseTime:(NSInteger)time complete:(void(^)(NSError * _Nullable error))callback;
/// 获取音量
- (void)getWifiPrinterVolumeComplete:(void(^)(NSInteger max, NSInteger current, NSError * _Nullable error))callback;
/// 设置音量
- (void)setWifiPrinterVolume:(NSUInteger)volume Complete:(void(^)(NSError * _Nullable error))callback;
/// 获取模型
- (void)getWifiPrinterModelComplete:(void(^)(NSString *model, NSError * _Nullable error))callback;
/// 设置模型
- (void)setWifiPrinterModel:(NSString *)model Complete:(void(^)(NSError * _Nullable error))callback;
/// 设置打印机语言language
- (void)setWifiPrinterLanguage:(NSString *)language Complete:(void(^)(NSError * _Nullable error))callback;

@end

NS_ASSUME_NONNULL_END
