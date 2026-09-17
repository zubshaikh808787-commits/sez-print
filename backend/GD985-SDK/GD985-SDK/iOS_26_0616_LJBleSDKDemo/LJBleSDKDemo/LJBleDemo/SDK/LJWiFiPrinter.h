//
//  LJWiFiPrinter.h
//  LuckBleSDK
//
//  Created by apple on 2026/4/7.
//

#import <LuckBleSDK/LuckBleSDK.h>
#import <LuckBleSDK/LJWiFiConfig.h>
/// wifi状态回调
typedef void(^WiFiStatusCallBack)(LJWiFiStatus status);
/// 打印机信息回调
typedef void(^WiFiPrinterDeviceInfoCallBack)(NSObject * _Nonnull info, BOOL isFinish);

NS_ASSUME_NONNULL_BEGIN

@interface LJWiFiPrinter : LuckPrinter
/// 配网回调 （回调不是连接中就置空）
@property (nullable, nonatomic, copy) WiFiStatusCallBack connectStatusCallback;
/// 监听wifi状态回调
@property (nullable, nonatomic, copy) WiFiStatusCallBack statusCallback;
/// 获取设备信息 每一包拼接字典
@property (nonatomic, strong) NSMutableDictionary *packetCache;
/// 获取设备信息回调（因为是一包一包返回的）
@property (nullable, nonatomic, copy) WiFiPrinterDeviceInfoCallBack infoCallback;

// 配网
- (void)wifiConfigSSID:(NSString *)ssid pwd:(NSString *)pwd complete:(void(^)(LJWiFiStatus status, NSError * _Nullable error))callback;

// 重置设备
- (void)wifiResetDevice;

// 查询打印机WIFi连接状态
- (void)getWifiConnectStatusComplete:(void(^)(LJWiFiQueryStatus status, NSError * _Nullable error))callback;

// 监听wifi打印机状态
- (void)addWifiStatus:(void(^)(LJWiFiStatus status))callback;

// 查询打印机周围WiFi信号
- (void)getWifiPrinterAroundSignal:(NSInteger)count complete:(void(^)(NSArray <NSString *>*wifiList, NSError * _Nullable error))callback;

// 获取wifi打印机设备信息
- (void)getWifiPrinterDeviceInfoComplete:(void (^)(LuckPrinterInfo *info, NSError * _Nullable))callback;



/// 获取打印机状态
- (void)getWifiPrinterStatua:(void(^)(LPPrinterState status, NSError * _Nullable error))callback;
/// 获取电量
- (void)getWifiPrinterPower:(void(^)(NSInteger power, NSError * _Nullable error))callback;
/// 获取打印浓度
- (void)getWifiPrinterDensity:(void(^)(NSInteger density, NSError * _Nullable error))callback;
/// 设置打印浓度
- (void)setWifiPrinterDensity:(NSInteger)density complete:(void(^)(NSError * _Nullable error))callback;

/// 获取打印浓度
- (void)getWifiPrinterPaperType:(void(^)(LPPaperType type, NSError * _Nullable error))callback;
/// 设置打印浓度
- (void)setWifiPrinterPaperType:(LPPaperType)type complete:(void(^)(NSError * _Nullable error))callback;

/// 获取关机时间
- (void)getWifiPrinterCloseTime:(void(^)(NSInteger time, NSError * _Nullable error))callback;
/// 设置关机时间
- (void)setWifiPrinterCloseTime:(NSInteger)time complete:(void(^)(NSError * _Nullable error))callback;
/// 获取音量
- (void)getWifiPrinterVolumeComplete:(void(^)(NSInteger max, NSInteger current, NSError * _Nullable error))callback;
/// 设置音量
- (void)setWifiPrinterVolume:(NSUInteger)volume Complete:(void(^)(NSError * _Nullable error))callback;
/// 获取模型
- (void)getWifiPrinterModeComplete:(void(^)(NSInteger model, NSError * _Nullable error))callback;
/// 设置模型
- (void)setWifiPrinterMode:(NSString *)model Complete:(void(^)(NSError * _Nullable error))callback;
/// 获取型号
- (void)getWifiPrinterModelComplete:(void(^)(NSString *model, NSError * _Nullable error))callback;
/// 获取SN
- (void)getWifiPrinterSNComplete:(void(^)(NSString *sn, NSError * _Nullable error))callback;
/// 获取版本
- (void)getWifiPrinterVersionComplete:(void(^)(NSString *version, NSError * _Nullable error))callback;
/// 设置打印机语言language
- (void)setWifiPrinterLanguage:(NSString *)language Complete:(void(^)(NSError * _Nullable error))callback;

#pragma mark - sendImageData
/// 设置打印份数
- (void)setWifiPrinterCopies:(NSInteger)copies complete:(void(^)(NSError * _Nullable error))callback;
- (void)printerSendImage:(UIImage *)image complete:(void(^)(BOOL isSuccsess))callback;
- (void)printerSendGrayImage:(UIImage *)image grayLevel:(NSInteger)level complete:(void(^)(BOOL isSuccsess))callback;

@end

NS_ASSUME_NONNULL_END
