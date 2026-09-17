//
//  LuckPrintConfig.h
//  LuckBleSDK
//
//  Created by apple on 2026/4/28.
//

#import <Foundation/Foundation.h>

typedef NS_ENUM(NSUInteger, LJPrintType) {
    // 默认（如卷纸）
    LJPrintTypeNormal     = 0,
    // 标签
    LJPrintTypeLabel      = 1,
    // 纹身
    LJPrintTypeTattoo     = 2,
    // 折叠
    LJPrintTypeFold       = 3,
    // 面单
    LJPrintTypeSheetLabel = 4
};

typedef NS_ENUM(NSUInteger, PrintPauseStatus) {
    // 无（即可以正常打印）
    PrintPauseStatusNone,
    // 等待当前打印机结束
    PrintPauseStatusWaitPause,
    // 打印暂停
    PrintPauseStatusPause
};

NS_ASSUME_NONNULL_BEGIN

//打印配置信息
@interface LuckPrintConfig : NSObject
/// 浓度 0 使用默认
@property (nonatomic, assign) NSInteger density;
/// 打印分数
@property (nonatomic, assign) NSInteger copies;
/// 打印类型
@property (nonatomic, assign) LJPrintType printType;
/// 是否灰度打印
@property (nonatomic, assign) BOOL isGrayPrint;

@end

NS_ASSUME_NONNULL_END
