//
//  LuckConfig.h
//  LuckPrinterSDK
//
//  Created by apple on 2025/2/11.
//

#import <Foundation/Foundation.h>
#import <LuckBleSDK/LuckConfigModel.h>
NS_ASSUME_NONNULL_BEGIN

//@class LuckConfigModel;
@interface LuckConfig : NSObject

+ (instancetype)sharedInstance;
// 列表所有设备配置列表
@property (nonatomic, copy) NSArray <LuckConfigModel *>* configs;
// 当前设备配置信息
@property (nonatomic, strong) LuckConfigModel * configData;


// 设置配置信息列表 从外部设置配置（APP）并缓存
- (BOOL)setDeviceConfigList:(NSArray<LuckConfigModel *> * _Nonnull)list;
// 设置设备配置详情 从外部设置配置（APP）并缓存
- (BOOL)setDeviceConfigData:(LuckConfigModel * _Nonnull)configData;

// 蓝牙设备名称是否在配置中
+ (NSDictionary *)isContainDevice:(NSString *)name;

+ (NSString *)replacePlaceholdersInString:(NSString *)string
                               withValues:(NSArray<NSString *> *)values;

// 校验数据 校验打印机返回的数据
+ (BOOL)checkCallBackData:(NSArray *)datas checkData:(NSData *)cData;

// 将字符表示的16进制数据转为 data
+ (NSData *)dataFromHexString:(NSString *)hexString;

// 将data 转为16进制的字符表示的
+ (NSString *)hexadecimalString:(NSData *)data;

// 获取一段字符串表示的16进制数据 中的倒数17位到倒数第二位 位md5值
+ (NSString *)getVerifyMD5:(NSString *)dataStr;
// 解析data中的md5值
+ (NSString *)parseMD5Data:(NSData *)data xorByte:(uint8_t *)calculatedXOR;

/// 获取指令
/// - Parameters:
///   - bt: 功能码
///   - sBt: 副功能码
///   - data: 参数数据
+ (NSData *)getCmd:(Byte)bt sCmd:(Byte)sBt data:(NSData *)data;

@end


#pragma mark -- LuckConfigModel json解析类
@interface LuckJsonParse : NSObject

+ (NSArray<LuckConfigModel*> *)LuckModelArrayWithJson:(id)json;

+ (LuckConfigModel *)LuckModelWithDictionary:(NSDictionary *)dictionary;

@end

NS_ASSUME_NONNULL_END
