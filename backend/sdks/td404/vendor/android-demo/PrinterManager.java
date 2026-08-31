package com.ninestar.ninestarprinterdemo;

import android.text.TextUtils;
import android.util.Log;

import com.ninestar.printer.bean.PrinterDevices;
import com.ninestar.printer.interf.PortCallbackListener;
import com.ninestar.printer.io.EthernetPort;
import com.ninestar.printer.io.PortManager;
import com.ninestar.printer.io.SppBluetoothPort;
import com.ninestar.printer.utils.UPThreadPoolManager;

import java.io.IOException;
import java.util.Vector;

/**
 * @作者: 三三同学
 * @时间: 2024/9/18
 * @描述: 打印机管理类 单例
 */
public class PrinterManager {

    public static PrinterManager printer = null;
    public static PortManager portManager = null;

    public PrinterDevices printerDevices = null;
    private PortCallbackListener callbackListener;

    public PrinterManager() {
    }

    /**
     * 单例
     *
     * @return 打印机管理类对象
     */
    public static PrinterManager getInstance() {
        if (printer == null) {
            printer = new PrinterManager();
        }
        return printer;
    }

    /**
     * 连接 打印机
     *
     * @param printerDevices 承载打印机参数对象
     */
    public void connectPrinter(final PrinterDevices printerDevices) {
        UPThreadPoolManager.getInstance().execute(new Runnable() {
            @Override
            public void run() {
                PrinterManager.this.printerDevices = printerDevices;
                //先close上次连接
                if (portManager != null) {
                    portManager.closePort();
                }
                try {
                    Thread.sleep(300L);
                } catch (InterruptedException e) {
                    Log.e("PrinterManager", "run: >>>>>>>>>>>>>>>>>>" +e.getMessage() );
                }
                if (printerDevices != null) {
                    switch (printerDevices.getDeviceType()) {
                        case BLUETOOTH://Spp
                            portManager = new SppBluetoothPort(printerDevices);
                            break;
                        case WIFI://WIFI
                            portManager = new EthernetPort(printerDevices);
                            break;
                        default:
                            break;
                    }
                    if (portManager != null) {
                        if (callbackListener != null) {
                            //设置监听回调
                            portManager.setCallbackListener(callbackListener);
                        }
                        portManager.openPort();
                    }
                }
            }
        });
    }

    /**
     * 设置监听回调
     *
     * @param callbackListener 回调
     */
    public void setCallbackListener(PortCallbackListener callbackListener) {
        this.callbackListener = callbackListener;
        if (portManager != null) {
            portManager.setCallbackListener(callbackListener);
        }
    }

    /**
     * 移除监听回调，防止内存泄漏
     */
    public void removeCallbackListener() {
        this.callbackListener = null;
        if (portManager != null) {
            portManager.setCallbackListener(null);
        }
    }



    /**
     * 发送数据到打印机 字节数据
     *
     * @param data 打印机连接异常或断开发送时会抛异常，可以捕获异常进行处理
     */
    public void sendDataToPrinter(byte[] data, boolean isReadReceive) throws IOException {
        if (portManager != null) {
            portManager.writeDataImmediately(data,isReadReceive);
        }
    }

    /**
     * 发送数据到打印机 指令集合内容
     *
     * @param vector 发送给打印机的数据
     *               打印机连接异常或断开发送时会抛异常，可以捕获异常进行处理
     */
    public void sendDataToPrinter(Vector<Byte> vector, boolean isReadReceive) throws IOException {
        if (portManager != null) {
            portManager.writeDataImmediately(vector,isReadReceive);
        }
    }

    /**
     * 打印机是否连接
     *
     * @return true 代表连接
     */
    public boolean getConnectStatus() {
        if (portManager != null) {
            return portManager.isConnect();
        }
        return false;
    }

    public boolean isConnected(String macAddress) {
        if (portManager != null && portManager.isConnect() && printerDevices != null) {
            return TextUtils.equals(printerDevices.getMacAddress(), macAddress);
        }
        return false;
    }

    /**
     * 获取已连接的蓝牙设备的macAddress
     *
     * @return macAddress
     */
    public String getConnectMacAddress() {
        if (portManager != null && portManager.isConnect() && printerDevices != null) {
            return printerDevices.getMacAddress();
        }
        return "";
    }

    /**
     * 关闭连接
     */
    public void closePort() {
        if (portManager != null) {
            portManager.closePort();
            portManager = null;
            printerDevices = null;
            callbackListener = null;
        }
    }
}
