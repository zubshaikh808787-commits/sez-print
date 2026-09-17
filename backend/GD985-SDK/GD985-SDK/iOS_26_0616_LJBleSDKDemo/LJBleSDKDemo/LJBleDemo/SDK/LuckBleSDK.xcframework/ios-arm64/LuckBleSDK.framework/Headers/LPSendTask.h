//
//  LPSendTask.h
//  LuckBleSDK
//
//  Created by junky on 2023/11/1.
//

#import <UIKit/UIKit.h>
#import <LuckBleSDK/LuckPrinterInfo.h>
#import <LuckBleSDK/LJError.h>

NS_ASSUME_NONNULL_BEGIN

typedef void(^TaskCompelete)(NSObject * _Nullable obj);
typedef NSObject * _Nullable(^TaskParse)(NSData *data);

// OTA进度回调
typedef void (^OTAProcessBlcok)(CGFloat progress);

@interface LPSendTask : NSObject

//@property (nonatomic , readonly) NSString *uuid;
//@property (nonatomic , readonly) NSData *data;
//@property (nullable , nonatomic , readonly) TaskCompelete compelete;
//@property (nonatomic , readonly) TaskParse parse;
//@property (nonatomic , readonly) NSUInteger timeout;

@property (nonatomic , copy) NSString *uuid;
@property (nonatomic , strong) NSData *data;
@property(nullable , nonatomic , copy) TaskCompelete compelete;
@property (nullable , nonatomic , copy) TaskParse parse;
@property (nonatomic , assign) NSUInteger timeout;
@property (nonatomic, assign) LJTaskType cmdType;


+ (instancetype)getStateTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)getInfoTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)getThickTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)d12GetThickTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)getSnTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)getVersionTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)getTimeTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)getModelTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)getMacTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)getBatteryTaskCompelete:(TaskCompelete)compelete;

// 设置打印数量
+ (instancetype)setPrintPageCountTask:(NSInteger)count compelete:(TaskCompelete)compelete;

+ (instancetype)setThickTask:(NSUInteger)thick compelete:(TaskCompelete)compelete;
// 加热补偿系数（浓度补偿）
+ (instancetype)setHeatFactorTask:(Byte)factor compelete:(TaskCompelete)compelete;
+ (instancetype)l2SetThickTask:(NSUInteger)thick compelete:(TaskCompelete)compelete;
+ (instancetype)setTimeTask:(NSUInteger)time compelete:(TaskCompelete)compelete;
+ (instancetype)setPaperTask:(LPPaperType)type compelete:(TaskCompelete)compelete;
+ (instancetype)l2SetPaperTask:(LPPaperType)type compelete:(TaskCompelete)compelete;

+ (instancetype)MT80PrinterStopTaskCompelete:(TaskCompelete)compelete;

+ (instancetype)d2SetPaperWidthTask:(NSUInteger)type compelete:(TaskCompelete)compelete;
+ (instancetype)a40aSetPaperTask:(LPPaperType)type compelete:(TaskCompelete)compelete;
+ (instancetype)aySetPaperTask:(LPPaperType)type compelete:(TaskCompelete)compelete;

+ (instancetype)printerEnableTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)ayPrinterEnableTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)a40aPrinterStopTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)p15PrinterEnableTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)printerWakeTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)printerStopTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)ayPrinterStopTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)d1PrinterStopTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)hll1printerStopTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)y50PprinterStopTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)printerEnterPaperTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)printerOutPaperTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)printerLocationTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)l2PrinterLocationTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)printerWalkTask:(NSUInteger)walk compelete:(TaskCompelete)compelete;
+ (instancetype)printerSendImageTask:(UIImage *)image compelete:(TaskCompelete)compelete;
+ (instancetype)a4PrinterSendImageTask:(UIImage *)image compelete:(TaskCompelete)compelete;
+ (instancetype)grayPrinterSendImageTask:(UIImage *)image level:(NSInteger)level compelete:(TaskCompelete)compelete;
+ (instancetype)a46PrintrtGetSpeedTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)a46PrinterSetSpeedTask:(NSUInteger)speed compelete:(TaskCompelete)compelete;
+ (instancetype)printerlastLabelWalkTaskCompelete:(TaskCompelete)compelete;

#pragma mark - 面单
+ (instancetype)mdGetStateTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)mdGetSnTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)mdGetVersionTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)mdGetModelTaskCompelete:(TaskCompelete)compelete;

+ (instancetype)mdCreatePageTask:(NSUInteger)width height:(NSUInteger)height compelete:(TaskCompelete)compelete;
+ (instancetype)mdGapTask:(NSUInteger)m n:(NSUInteger)n compelete:(TaskCompelete)compelete;
+ (instancetype)mdClearTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)mdSetSpeedTask:(NSUInteger)speed compelete:(TaskCompelete)compelete;
+ (instancetype)mdSetThickTask:(NSUInteger)thick compelete:(TaskCompelete)compelete;
+ (instancetype)mdSetCopiesTask:(NSUInteger)copies compelete:(TaskCompelete)compelete;
+ (instancetype)mdPrintImageTask:(UIImage *)image compelete:(TaskCompelete)compelete;
+ (instancetype)mdPrintImage2Task:(UIImage *)image compelete:(TaskCompelete)compelete;
// D400 图片需要做特殊处理
+ (instancetype)mdD400GetStateTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)mdD400GetSnTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)mdD400GetVersionTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)mdD400GetModelTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)mdD400PrintImageTask:(UIImage *)image compelete:(TaskCompelete)compelete;

+ (instancetype)l3hAfterEndTaskCompelete:(TaskCompelete)compelete;

+ (instancetype)grayPrinterSendDataTask:(NSData *)data level:(NSInteger)level compelete:(nonnull TaskCompelete)compelete;

#pragma mark - parse

+ (NSUInteger)otaCreditWithData:(NSData *)data;
+ (instancetype)v2otaCleanTask:(NSData *)data compelete:(TaskCompelete)compelete;
+ (NSUInteger)mtuWithData:(NSData *)data;
+ (NSUInteger)creditWithData:(NSData *)data;
+ (NSUInteger)otaCleanWithData:(NSData *)data;

#pragma mark - OTA

+ (instancetype)otaStartTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)otaSearchTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)otaCleanTask:(NSData *)data compelete:(TaskCompelete)compelete;
+ (instancetype)otaResetTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)otaSendTask:(NSData *)data loc:(NSUInteger)loc compelete:(TaskCompelete)compelete;



#pragma mark - Mini Label

+ (instancetype)miniLabelGetTimeFormatCompelete:(TaskCompelete)compelete;

+ (instancetype)miniLabelSetTimeFormat:(UInt8)format date:(NSDate *)date Compelete:(TaskCompelete)compelete;

#pragma mark - test

+ (instancetype)timeoutTask;

- (instancetype)initWith:(NSData *)data timeout:(NSUInteger)timeout parse:(TaskParse)parse compelete:(TaskCompelete)compelete;


#pragma mark - D80
+ (instancetype)setHeatLevelTask:(NSUInteger)level compelete:(TaskCompelete)compelete;


#pragma mark - AL200

+ (instancetype)al200GetBatteryTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)al200GetSNTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)al200GetModelTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)al200GetMacTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)al200GetVersionTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)al200GetDensityTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)al200GetTimeTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)al200GetStateTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)al200SetDensityTask:(NSUInteger)density compelete:(TaskCompelete)compelete;
+ (instancetype)al200SetTimeTask:(NSUInteger)time compelete:(TaskCompelete)compelete;
+ (instancetype)al200SetPaperTask:(LPPaperType)paper compelete:(TaskCompelete)compelete;
+ (instancetype)al200GetOtaSizeCompelete:(TaskCompelete)compelete;
+ (instancetype)al200OtaSendPiceTask:(NSData *)data loc:(NSUInteger)loc mtu:(NSUInteger)mtu compelete:(TaskCompelete)compelete;



#pragma mark - 15P3pro

+ (instancetype)p3proPreFirstLabelTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)p3proSubfixNoLastLabelTaskCompelete:(TaskCompelete)compelete;
+ (instancetype)p3proSubfixLastLabelTaskCompelete:(TaskCompelete)compelete;

+ (NSData *)printImageCmd:(UIImage *)image;
@end











NS_ASSUME_NONNULL_END
