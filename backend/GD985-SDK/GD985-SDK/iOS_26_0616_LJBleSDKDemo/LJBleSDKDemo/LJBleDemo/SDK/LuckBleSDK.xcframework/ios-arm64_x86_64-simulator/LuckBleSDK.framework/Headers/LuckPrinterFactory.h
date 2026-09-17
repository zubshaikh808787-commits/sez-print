//
//  LuckPrinterFactory.h
//  LuckBleSDK
//
//  Created by junky on 2024/12/26.
//

#import <Foundation/Foundation.h>
#import <LuckBleSDK/LuckPrinter.h>
//#import <LuckBleSDK/LuckConfig.h>
//#import <LuckBleSDK/LuckConfigModel.h>

NS_ASSUME_NONNULL_BEGIN

@class LuckConfig;
@class LuckConfigModel;

@interface LuckPrinterFactory : NSObject
+ (LuckPrinter *)printerWith:(CBPeripheral *)peripheral;

+ (void)getPrinterConfigInfoWith:(LuckPrinter *)printer deviceType:(NSString *)type complete:(void(^)(LuckConfigModel *model))complete;

// 获取设备model 和 sn
+ (void)getPrinterInfoWith:(LuckPrinter *)printer deviceType:(NSString *)type complete:(void(^)(NSString *modl, NSString *sn))complete;

@end

NS_ASSUME_NONNULL_END
