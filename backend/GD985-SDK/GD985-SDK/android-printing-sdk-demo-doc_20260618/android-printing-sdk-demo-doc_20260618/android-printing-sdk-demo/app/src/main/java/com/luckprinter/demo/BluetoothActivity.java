package com.luckprinter.demo;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.luckjingle.printersdk.R;

import java.lang.reflect.Method;
import java.util.Set;

public class BluetoothActivity extends AppCompatActivity {

    private BluetoothAdapter bluetoothAdapter;
    private TextView tvToast;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.layout_unpair);
        // 获取BluetoothAdapter
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
        tvToast = (TextView) findViewById(R.id.tv_toast);

        // 注销所有已配对设备
        unpairAllDevices();

        // 如果需要，你还可以在这里注册广播接收器监听设备的配对状态变化
        // registerReceiver(bluetoothReceiver, new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED));
    }

    private void unpairAllDevices() {
        Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
        if (pairedDevices.size() > 0) {
            for (BluetoothDevice device : pairedDevices) {
                unpairDevice(device);
            }
        }
    }

    private void unpairDevice(BluetoothDevice device) {
        try {
            // 使用反射获取BluetoothDevice的removeBond方法
            Method method = BluetoothDevice.class.getMethod("removeBond", (Class[]) null);
            method.invoke(device, (Object[]) null);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // 如果需要，可以注册广播接收器监听设备的配对状态变化
    private final BroadcastReceiver bluetoothReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();

            if (BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(action)) {
                BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                String name = device.getName();
                int bondState = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1);

                // 处理配对状态变化事件
                switch (bondState) {
                    case BluetoothDevice.BOND_BONDING:
                        // 正在配对
                        break;
                    case BluetoothDevice.BOND_BONDED:
                        // 配对成功
                        break;
                    case BluetoothDevice.BOND_NONE:
                        // 配对解除
//                        Toast.makeText(getApplicationContext(), "解除配对", Toast.LENGTH_SHORT).show();
                        if(tvToast != null){
                            String st = tvToast.getText().toString();
                            tvToast.setText(st + "\n" + name + "  解除配对");
                        }else{
                            Toast.makeText(getApplicationContext(), "解除配对", Toast.LENGTH_SHORT).show();
                        }
                        break;
                }
            }
        }
    };

    @Override
    protected void onResume() {
        super.onResume();
        // 注册广播接收器
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(
                    bluetoothReceiver,
                    new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED),
                    RECEIVER_EXPORTED
            );
        } else {
            registerReceiver(
                    bluetoothReceiver,
                    new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            );
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 取消注册广播接收器
        unregisterReceiver(bluetoothReceiver);
    }
}

