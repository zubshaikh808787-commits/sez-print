//
//  LuckTool.h
//  LuckBleSDK
//
//  Created by junky on 2023/9/18.
//

#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface LuckTool : NSObject

+ (NSData *)convertImageToBinaryData:(UIImage *)image;

+ (NSData *)blackWhiteProcessing:(UIImage *)bitmap;
+ (Byte)calculateEnc:(Byte *)data length:(NSUInteger)length;
+ (NSData *)dataFromInterger:(NSUInteger)inter length:(NSUInteger)length;

+ (UIImage *)scallImage:(UIImage *)image toWidth:(CGFloat)width;
+ (UIImage *)scallImage:(UIImage *)image toWidth:(CGFloat)width opaque:(BOOL)opaque;
+ (UIImage *)scallImage:(UIImage *)image toHeight:(CGFloat)height;

+ (UIImage *)scallImage:(UIImage *)image maxHeight:(CGFloat)maxH maxWidth:(CGFloat)maxW;

+ (UIImage *)scaleAndFillImage:(UIImage *)image toSize:(CGSize)targetSize;

+ (UIImage *)scaleAndClipWidthImage:(UIImage *)image toSize:(CGSize)targetSize;

+ (UIImage *)scaleAndClipHeightImage:(UIImage *)image toSize:(CGSize)targetSize;

+ (UIImage *)compressImage:(UIImage *)image maxLength:(NSInteger)maxLength;

+ (UIImage *)rotateImage:(UIImage *)image byDegrees:(CGFloat)degrees;

+ (UIImage *)dither:(UIImage *)image;

+ (UIImage *)gray:(UIImage *)image;

+ (UIImage *)erzhi:(UIImage *)image;

+ (UIImage *)adaptiveThresholdingForImage:(UIImage *)inputImage withWindowSize:(int)windowSize;

+ (UIImage *)drawWithWhiteBgImage:(UIImage *)image imgSize:(CGSize)imgSize bgSize:(CGSize)bgSize;


/// 灰度打印图片处理
/// - Parameters:
///   - image: 图片
///   - mode: 模式 现在传阶数 如16 、 8
///   - perByte: 1个字节用多少位去存存点数据  用4位去存
+ (NSData *)getBitmapByteArrayGrayFromImage:(UIImage *)image mode:(NSInteger)mode perByte:(int)perByte;

@end

NS_ASSUME_NONNULL_END
