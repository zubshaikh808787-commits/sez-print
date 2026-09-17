//
//  LJImageTool.h
//  LJBleDemo
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface LJImageTool : NSObject

/// 普通二值化
+ (UIImage *)binaryImage:(UIImage *)image threshold:(uint8_t)threshold;

/// Floyd 抖动二值化
+ (UIImage *)ditherImage:(UIImage *)image;

@end

NS_ASSUME_NONNULL_END
