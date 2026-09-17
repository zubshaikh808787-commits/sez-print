//
//  ConfigCommand.h
//  LuckBleSDK
//
//  Created by junky on 2025/1/14.
//

#import <Foundation/Foundation.h>
#import <LuckBleSDK/LPSendTask.h>

NS_ASSUME_NONNULL_BEGIN

@interface ConfigCommand : NSObject


@property (nonatomic , copy) NSString *type;
@property (nonatomic , copy) NSString *data;
@property (nonatomic , assign) BOOL callback;
@property (nonatomic , assign) NSInteger callbackTime;
@property (nonatomic , copy) NSArray<NSString *> *callbackData;
@property (nonatomic , copy) NSString *position;    // first, last, nil

@property (nonatomic , copy) NSArray<NSString *> *values;

@property (nonatomic , readonly) LPSendTask *task;

@property (nonatomic , readonly) BOOL isPrefix;
@property (nonatomic , readonly) BOOL isSuffix;
@property (nonatomic , readonly) BOOL isAlaway;
@property (nonatomic , readonly) BOOL isImage;

@property (nonatomic , strong) UIImage *image;

@property (nonatomic , copy) NSString *compressWay;

@end

NS_ASSUME_NONNULL_END
