package com.ninestar.ninestarprinterdemo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.ninestar.printer.command.LabelCommand
import java.util.Vector

/**
 * @作者: 三三同学
 * @时间: 2024/9/25
 * @描述:
 */
object PrintContent {

    /**
     * 标签打印测试页
     *
     * @return
     */
    fun getLabel(context: Context, gap: Int): ByteArray {
        val tsc = LabelCommand()
        // 设置标签尺寸宽高，按照实际尺寸设置 单位mm
        tsc.addUserCommand("\r\n")
        tsc.addSize(105, 76)
        //设置间隙高度
        tsc.addGap(gap)
        // 设置打印方向
        tsc.addDirection(LabelCommand.DIRECTION.FORWARD, LabelCommand.MIRROR.NORMAL)
        // 设置原点坐标
        tsc.addReference(0, 0)
        //设置浓度
        tsc.addDensity(LabelCommand.DENSITY.DNESITY15)
        // 撕纸模式开启
        tsc.addQueryPrinterStatus(LabelCommand.RESPONSE_MODE.ON)
        // 清除打印缓冲区
        tsc.addCls()
        val b: Bitmap = BitmapFactory.decodeResource(context.resources, R.mipmap.test)
        tsc.addBitmap(0, 0, LabelCommand.BITMAP_MODE.OVERWRITE, b.getWidth(), b)
        // 打印标签
        tsc.addPrint(1, 1)
        // 发送数据
        return convertVectorByteToBytes(tsc.command)
    }

    private fun convertVectorByteToBytes(data: Vector<Byte>): ByteArray {
        val size = data.size
        val sendData = ByteArray(size)
        if (size > 0) {
            for (i in 0 until size) {
                sendData[i] = data[i] as Byte
            }
        }
        return sendData
    }

}
