//
//  LJError.h
//  LuckBleSDK
//
//  Created by apple on 2026/1/3.
//

#import <Foundation/Foundation.h>

#pragma mark - OTA
typedef NS_ENUM(NSInteger, LJOTASate) {
    LJOTASate_Prepare,
    LJOTASate_Updating,
    LJOTASate_Failure,
    LJOTASate_Success
};

typedef NS_ENUM(NSInteger, LJOTAError) {
    // 大小错误
    LJOTA_SIZE_ERROR             = 90001,
    // MD5错误
    LJOTA_FILE_MD5_ERROR         = 90002,
    // 相同的MD5，升级文件相同
    LJOTA_SAME_MD5_ERROR         = 90003,
    // 协议解析错误
    LJOTA_PROTOCOL_PARSE_ERROR   = 90004,
    // 升级失败
    LJOTA_FAIL_ERROR             = 90005,
    // OTA超时
    LJOTA_TIMEOUT_ERROR          = 90006,
    // 文件签名不正确
    LJOTA_SIGNATURE_ERROR        = 90007,
    // 不支持安全更新
    LJOTA_NONSUPPORT_SAFEUPDATE_ERROR = 90008,
    // 未知
    LJOTA_UNKNOWN                = 90000
};


#pragma mark - Error
typedef NS_ENUM(NSInteger, LJErrorType) {
    // 任务执行中
    LJError_Task_Doing    =   70000,
    // 请求超时
    LJError_Task_Timeout  =   70001,
    // 打印机未连接
    LJError_Printer_Noconnected  =  70002,
    // WIFi打印机配网失败
    LJError_WifiConfigFail       =  70003,
    // 未知
    LJError_Unknown       =   -1
};


#pragma mark - cmdType
typedef NS_ENUM(NSInteger, LJTaskType) {
    // 获取状态
    LJTask_State           =    1001,
    // 获取型号
    LJTask_getModel        =    1002,
    // 获去SN地址
    LJTask_getSN           =    1003,
    // 获取浓度
    LJTask_getDensity      =    1004,
    // 获取版本
    LJTask_getVersion      =    1005,
    // 获取电量
    LJTask_getBattery      =    1006,
    // 获取Mac
    LJTask_getMac          =    1007,
    // 获取关机时间
    LJTask_getCloseTime    =    1008,
    // 获取关机时间
    LJTask_getSpeed        =    1009,
    // 获取所有信息
    LJTask_getInfo         =    1010,
    
    /// 设置
    // 使能
    LJTask_setEnable           =  2000,
    // 失能
    LJTask_setDisable          =  2001,
    // 唤起
    LJTask_setWeak             =  2002,
    // 设置浓度
    LJTask_setDensity          =  2003,
    // 设置纸张类型
    LJTask_setPaperType        =  2004,
    // 设置速度
    LJTask_setSpeed            =  2005,
    // 进纸
    LJTask_setEnterPaper       =  2006,
    // 退纸
    LJTask_setOutPaper         =  2007,
    // 走纸
    LJTask_setWalkPaper        =  2008,
    // 定位
    LJTask_setLocation         =  2009,
    // 1bbbb
    LJTask_setBBBB             =  2010,
    // 设置关机时间
    LJTask_setCloseTime        =  2011,
    // 设置打印数量
    LJTask_setPageNum          =  2099,
    
    // 发送音量
    LJTask_getWifiVolume           =  2012,
    LJTask_setWifiVolume           =  2013,
    
    // 发送模式
    LJTask_getWifiModel           =  2014,
    LJTask_setWifiModel           =  2015,
    LJTask_setWifiCopies          =  2016,
    
    // 发送图片数据
    LJTask_sendImage           =  2222,
    
    // 未知
    LJTask_unknown             = -1
};


NS_ASSUME_NONNULL_BEGIN

@interface LJError : NSObject

@end

NS_ASSUME_NONNULL_END
