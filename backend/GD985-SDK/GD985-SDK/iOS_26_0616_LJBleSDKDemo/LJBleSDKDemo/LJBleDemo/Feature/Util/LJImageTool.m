//
//  LJImageTool.m
//  LJBleDemo
//

#import "LJImageTool.h"
#import <UIKit/UIKit.h>

@implementation LJImageTool

+ (UIImage *)binaryImage:(UIImage *)image threshold:(uint8_t)threshold {
    CGImageRef cgImage = image.CGImage;
    size_t width = CGImageGetWidth(cgImage);
    size_t height = CGImageGetHeight(cgImage);
    uint8_t *pixels = (uint8_t *)calloc(width * height, sizeof(uint8_t));
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceGray();
    CGContextRef context = CGBitmapContextCreate(pixels, width, height, 8, width, colorSpace, kCGImageAlphaNone);
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), cgImage);

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int index = y * width + x;
            pixels[index] = pixels[index] > threshold ? 255 : 0;
        }
    }

    CGImageRef resultCGImage = CGBitmapContextCreateImage(context);
    UIImage *result = [UIImage imageWithCGImage:resultCGImage];
    CGImageRelease(resultCGImage);
    CGContextRelease(context);
    CGColorSpaceRelease(colorSpace);
    free(pixels);
    return result;
}

+ (UIImage *)ditherImage:(UIImage *)image {
    CGImageRef cgImage = image.CGImage;
    size_t width = CGImageGetWidth(cgImage);
    size_t height = CGImageGetHeight(cgImage);
    uint8_t *pixels = (uint8_t *)calloc(width * height, sizeof(uint8_t));
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceGray();
    CGContextRef context = CGBitmapContextCreate(pixels, width, height, 8, width, colorSpace, kCGImageAlphaNone);
    CGContextDrawImage(context, CGRectMake(0, 0, width, height), cgImage);

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int index = y * width + x;
            uint8_t oldPixel = pixels[index];
            uint8_t newPixel = oldPixel > 127 ? 255 : 0;
            pixels[index] = newPixel;
            int error = oldPixel - newPixel;

            if (x + 1 < width) {
                pixels[index + 1] = MIN(MAX(pixels[index + 1] + error * 7 / 16, 0), 255);
            }
            if (x - 1 >= 0 && y + 1 < height) {
                pixels[index + width - 1] = MIN(MAX(pixels[index + width - 1] + error * 3 / 16, 0), 255);
            }
            if (y + 1 < height) {
                pixels[index + width] = MIN(MAX(pixels[index + width] + error * 5 / 16, 0), 255);
            }
            if (x + 1 < width && y + 1 < height) {
                pixels[index + width + 1] = MIN(MAX(pixels[index + width + 1] + error * 1 / 16, 0), 255);
            }
        }
    }

    CGImageRef resultCGImage = CGBitmapContextCreateImage(context);
    UIImage *result = [UIImage imageWithCGImage:resultCGImage];
    CGImageRelease(resultCGImage);
    CGContextRelease(context);
    CGColorSpaceRelease(colorSpace);
    free(pixels);
    return result;
}

@end
