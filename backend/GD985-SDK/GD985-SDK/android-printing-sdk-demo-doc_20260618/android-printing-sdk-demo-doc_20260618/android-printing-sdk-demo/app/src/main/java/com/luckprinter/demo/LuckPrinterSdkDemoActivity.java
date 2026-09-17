package com.luckprinter.demo;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothDevice;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.PaintFlagsDrawFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.InputFilter;
import android.text.TextUtils;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContract;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.serializer.SerializerFeature;
import com.luckjingle.printersdk.BuildConfig;
import com.luckjingle.printersdk.R;
import com.luckprinter.demo.bean.ButtonItem;
import com.luckprinter.demo.dialog.Ai50DialogHelper;
import com.luckprinter.demo.dialog.ISelectImage;
import com.luckprinter.demo.dialog.ImageSelectHost;
import com.luckprinter.demo.dialog.PrintContinuousDialog;
import com.luckprinter.demo.repository.CustomPrinterData;
import com.luckprinter.sdk_new.BtReceiver;
import com.luckprinter.sdk_new.PrinterStatus;
import com.luckprinter.sdk_new.PrinterUtil;
import com.luckprinter.sdk_new.bean.PrinterStatusData;
import com.luckprinter.sdk_new.callback.OnClientConnectionListener;
import com.luckprinter.sdk_new.callback.OnEventListener;
import com.luckprinter.sdk_new.callback.OnPrintCallback;
import com.luckprinter.sdk_new.callback.OnPrinterInfoCallback;
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener;
import com.luckprinter.sdk_new.callback.ResultCallback;
import com.luckprinter.sdk_new.callback.UpdateListener;
import com.luckprinter.sdk_new.client.FileEventRecorder;
import com.luckprinter.sdk_new.device.BaseDevice;
import com.luckprinter.sdk_new.device.PrinterEnum;
import com.luckprinter.sdk_new.device.PrinterHelper;
import com.luckprinter.sdk_new.device.custom.ICustomPrinter;
import com.luckprinter.sdk_new.device.custom.PrinterCommand;
import com.luckprinter.sdk_new.device.custom.PrinterProperty;
import com.luckprinter.sdk_new.scan.ClassicScanDeviceHelper;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * @author huangxiaohui
 * @date 2023/4/11
 */
public class LuckPrinterSdkDemoActivity extends AppCompatActivity
        implements View.OnClickListener, OnClientConnectionListener, OnReceiveDeviceStatusListener,
        OnEventListener, ImageSelectHost {
    public static final String TAG = "LuckPrinterSdkDemo";
    private static final String AI50_WIFI_PREFIX = "AI50_";
    public static final int REQCODE_PERMISSION = 10001;
    public static final int SELECT_UPDATE_FILE = 10003;
    private ClassicScanDeviceHelper scanDeviceHelper;
    private List<DeviceItem> deviceList = new ArrayList<>();
    private RecyclerView rv_list, rv_buttons;
    private ProgressBar pb_discovery;
    private Button btn_update;
    private Button btn_unpair;
    private TextView tv_message, tv_no_device;
    private PrinterDeviceAdapter deviceAdapter;

    private String[] needPermissons = null;
    private ActivityResultLauncher<Intent> selectImageLauncher;
    private ISelectImage selectImageCallback;

    private HashMap<String, String> testFirmwareConfig = new HashMap<>();

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupEdgeToEdge();
        setContentView(R.layout.activity_luck_printer_sdk_demo);
        applySystemBarInsets();

        rv_list = findViewById(R.id.rv_list);
        rv_buttons = findViewById(R.id.rv_buttons);
        btn_update = findViewById(R.id.btn_update);
        btn_unpair = findViewById(R.id.btn_unpair);
        tv_message = findViewById(R.id.tv_message);
        tv_no_device = findViewById(R.id.tv_no_device);
        pb_discovery = findViewById(R.id.pb_discovery);

        btn_unpair.setOnClickListener(this);
        btn_update.setOnClickListener(this);
        initButtons();
        scanDeviceHelper = new ClassicScanDeviceHelper(this);
        scanDeviceHelper.setScanDeviceListener(new BtReceiver.Listener() {
            @Override
            public void foundDev(int type, String name, String mac) {
                if (!isBluetoothPrinterName(name)) {
                    return;
                }
                DeviceItem item = new DeviceItem(type, name, mac);
                if (!deviceList.contains(item)) {
                    deviceList.add(item);
                    deviceAdapter.notifyDataSetChanged();
                    refreshEmptyDeviceView();
                }
            }

            @Override
            public void startDiscovery() {
                pb_discovery.setVisibility(View.VISIBLE);
            }

            @Override
            public void finishDiscovery() {
                pb_discovery.setVisibility(View.GONE);
            }


        });
        scanDeviceHelper.init();
        initCustomPrinterInfo();

        ArrayList<String> permissons = new ArrayList<String>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissons.add(Manifest.permission.BLUETOOTH_CONNECT);
            permissons.add(Manifest.permission.BLUETOOTH_SCAN);
        } else {
            permissons.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            permissons.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        needPermissons = new String[permissons.size()];
        for (int i = 0; i < permissons.size(); i++) {
            needPermissons[i] = permissons.get(i);
        }

        if (!isBluePermissionGranted()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                requestPermissions(needPermissons, REQCODE_PERMISSION);
            }
        } else {
            initPrinterList();
            startScan();
        }

        PrinterHelper.getInstance().addConnectListener(this);
        PrinterHelper.getInstance().addDeviceStatusListener(this);
        PrinterHelper.getInstance().addEventListener(this);
        PrinterHelper.getInstance().addDeviceForbiddenListener(() -> {
            PrinterUtil.showToast(getString(R.string.device_forbidden));
        });

        selectImageLauncher = registerForActivityResult(getSelectImageContract(), result -> {
            if (result.getResultCode() == Activity.RESULT_OK) {
                try {
                    Uri imageUri = result.getData().getData();
                    if (selectImageCallback != null) {
                        selectImageCallback.onSelectImage(imageUri);
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        });

        initTestFirmware();
        test();
    }

    private void initTestFirmware() {
        String btwMpl12 = "L12_BTW_V1.8.24.bin";
        testFirmwareConfig = new HashMap<>();
        testFirmwareConfig.put("BTW Identi-Express_", btwMpl12);
        testFirmwareConfig.put("MPL12_", btwMpl12);
    }

    private void test() {
//        new Thread() {
//            @Override
//            public void run() {
//                super.run();
//                String sn = "1111225566";
//                String version = "V1.1.0";
//                String model = "KT123";
//                String name = "CRAFTS&CO|4777";
//                String mac = "11:22:33:44:55";
//                String url = "http://192.168.31.80:8080/api/sdk/check2";
//
//                Map<String, Object> param = new HashMap<>();
//                param.put("asKey", Constants.asKey);
//                param.put("sn", sn);
//                param.put("softwareVersion", version);
//                param.put("mac", mac);
//                param.put("model", model);
//                param.put("bluetoothname", name);
//                String jsonText = OkHttpUtil.postMap(url, param);
//                Log.d(TAG, "response : \n" + jsonText);
//            }
//        }.start();
    }

    private void getPrinterNameList() {
        List<String> list = new ArrayList<>();
        for (PrinterEnum value : PrinterEnum.values()) {
            list.add(value.getName());
        }
        Log.d(TAG, JSON.toJSONString(list,  SerializerFeature.PrettyFormat));
    }

    @Override
    public void toSelectImage(ISelectImage callback) {
        this.selectImageCallback = callback;
        boolean isKitKatO = Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT;
        Intent getAlbum;
        if (isKitKatO) {
            getAlbum = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        } else {
            getAlbum = new Intent(Intent.ACTION_GET_CONTENT);
        }
        getAlbum.setType("image/*");
        selectImageLauncher.launch(getAlbum);
    }

    private void startScan() {
        if (!checkLocationEnable()) {
            showToast(getString(R.string.location_off));
            return;
        }
        if (scanDeviceHelper != null) {
            scanDeviceHelper.startScanDevice();
        }
    }

    private boolean checkLocationEnable() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return true;
        } else {
            int locationMode = 0;
            try {
                locationMode = Settings.Secure.getInt(getContentResolver(),
                        Settings.Secure.LOCATION_MODE);
            } catch (Settings.SettingNotFoundException e) {
                e.printStackTrace();
                return false;
            }
            return locationMode != Settings.Secure.LOCATION_MODE_OFF;
        }
    }

    private void initCustomPrinterInfo() {
        HashMap<String, PrinterProperty> customPropertyMap = CustomPrinterData.getInstance().getCustomPropertyMap();
        PrinterHelper.getInstance().setCustomPropertyMap(customPropertyMap);
    }

    private void setCustomPrinterProperty() {
        BaseDevice device = PrinterHelper.getInstance().getPrinterDevice();
        if (device instanceof ICustomPrinter) {
            HashMap<String, PrinterProperty> customPropertyMap = CustomPrinterData.getInstance().getCustomPropertyMap();
            HashMap<String, PrinterCommand> customCommandMap = CustomPrinterData.getInstance().getCustomCommandMap();

            String namePrefix = PrinterHelper.getInstance().getNamePrefix();
            PrinterProperty property = customPropertyMap.get(namePrefix);
            PrinterCommand command = customCommandMap.get(namePrefix);
            ((ICustomPrinter) device).setProperty(property);
            ((ICustomPrinter) device).setCommand(command);
        }
    }

    private void refreshEmptyDeviceView() {
        if (deviceList.size() > 0) {
            tv_no_device.setVisibility(View.GONE);
        } else {
            tv_no_device.setVisibility(View.VISIBLE);
        }
    }

    private void initButtons() {
        GridLayoutManager manager = new GridLayoutManager(this, 2);
        rv_buttons.setLayoutManager(manager);

        List<ButtonItem> buttons = new ArrayList<>();
        MenuTypeEnum[] list = MenuTypeEnum.values();
        for (MenuTypeEnum item : list) {
            buttons.add(new ButtonItem(item.getType(), getString(item.getLabelResId())));
        }

        ButtonAdapter adapter = new ButtonAdapter(buttons);
        rv_buttons.setAdapter(adapter);

        adapter.setItemClickListener(new ButtonAdapter.ItemClickListener() {
            @Override
            public void onItemClick(ButtonItem btn) {
                String tag = btn.getTag();
                setMessageContent("");
                if (tag != null) {
                    MenuTypeEnum type = MenuTypeEnum.getByType(tag);
                    if (type != MenuTypeEnum.SCAN && type != MenuTypeEnum.DISCONNECT) {
                        if (!PrinterHelper.getInstance().isConnectedLuck()) {
                            PrinterUtil.showToast(getString(R.string.status_not_connected));
//                            return;
                        }
                    }

                    switch (type) {
                        //扫描打印机设备
                        case SCAN:
                            reScan();
                            break;
                        case DISCONNECT:
                            disconnectBluetooth();
                            break;
                        //连续纸打印图片
                        case PRINT: {
                            showPrintBitmapDialog();
                            break;
                        }
                        //缝隙纸打印图片
                        case PRINT_LABEL: {
                            showPrintBitmapDialogTag();
                        }
                        break;
                        //圆形缝隙纸打印图片
                        case PRINT_CIRCLE_LABEL: {
                            showPrintBitmapDialogCircleTag();
                        }
                        break;
                        case PRINT_BLACK_LABEL: {
                            showBlackPrintBitmapDialogTag();
                        }
                        break;
                        //缝隙纸打印图片
                        case PRINT_SHEET_LABEL: {
                            showPrintBitmapDialogSheetLabel();
                        }
                        break;
                        //a4折叠纸打印图片
                        case PRINT_A4_FOLDER: {
                            showPrintBitmapDialogFolder();
                        }
                        break;
                        //a4纹身纸
                        case PRINT_TATTOO: {
                            showPrintBitmapDialogTattoo();
                        }
                        break;
                        //设备型号
                        case PRINTER_MODEL_LUCK:
                            PrinterHelper.getInstance().printerModelLuck(new ResultCallback<String>() {

                                @Override
                                public void onSuccess(String data) {
                                    setMessageContent(getString(R.string.result_model, data));
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.result_model_fail));
                                }
                            });
                            break;
                        //设备型号
                        case PRINTER_BOOT_LUCK:
                            PrinterHelper.getInstance().printerBootLuck(new ResultCallback<String>() {

                                @Override
                                public void onSuccess(String data) {
                                    setMessageContent(getString(R.string.result_boot, data));
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.result_boot_fail));
                                }
                            });
                            break;
                        //SN号码
                        case PRINTER_SN_LUCK:
                            PrinterHelper.getInstance().printerSNLuck(new ResultCallback<String>() {
                                @Override
                                public void onSuccess(String data) {
                                    setMessageContent(getString(R.string.result_sn, data));
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.result_sn_fail));
                                }
                            });

                            break;
                        //SN号码
                        case GET_ALL_INFO:
                            StringBuilder sb = new StringBuilder();
                            PrinterHelper.getInstance().getAllInfo(new OnPrinterInfoCallback() {
                                @Override
                                public void onStart() {

                                }

                                @Override
                                public void onVersion(String ver) {
                                    sb.append(getString(R.string.demo_info_version, ver)).append(" ");
                                }

                                @Override
                                public void onName(String name) {
                                    sb.append(getString(R.string.demo_info_name, name)).append(" ");
                                }

                                @Override
                                public void onMac(String mac) {
                                    sb.append(getString(R.string.demo_info_mac, mac)).append(" ");
                                }

                                @Override
                                public void onSn(String sn) {
                                    sb.append(getString(R.string.demo_info_sn, sn)).append(" ");
                                }

                                @Override
                                public void onModel(String model) {
                                    sb.append(getString(R.string.demo_info_model, model)).append(" ");
                                }

                                @Override
                                public void onBattery(String battery) {
                                    sb.append(getString(R.string.demo_info_battery, battery)).append(" ");
                                }

                                @Override
                                public void onShutTime(int shutTime) {
                                    sb.append(getString(R.string.demo_info_shut_time, shutTime)).append(" ");
                                }

                                @Override
                                public void onDensity(int density) {
                                    sb.append(getString(R.string.demo_info_density, density)).append(" ");
                                }

                                @Override
                                public void onFinish() {
                                    setMessageContent(sb.toString());
                                }
                            });

                            break;
                        //固件版本
                        case PRINTER_VERSION_LUCK:
                            PrinterHelper.getInstance().printerVersionLuck(new ResultCallback<String>() {
                                @Override
                                public void onSuccess(String data) {
                                    setMessageContent(getString(R.string.result_firmware, data));
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.result_firmware_fail));
                                }
                            });
                            break;
                        //查自动关机时间
                        case GET_SHUT_TIME:
                            PrinterHelper.getInstance().getShutTimeLuck(new ResultCallback<Integer>() {
                                @Override
                                public void onSuccess(Integer data) {
                                    setMessageContent(getString(R.string.result_shut_time, data));
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.result_shut_time_fail));
                                }
                            });
                            break;
                        //状态
                        case PRINTER_STATUS_LUCK:
                            PrinterHelper.getInstance().getPrinterStatus(new ResultCallback<PrinterStatusData>() {
                                @Override
                                public void onSuccess(PrinterStatusData data) {
                                    String result = getString(R.string.result_status,
                                            data.getIsPrinting(), data.getIsOpen(), data.getIsLackPaper(), data.getIsLackElec(), data.getIsOverheat());
                                    setMessageContent(result);
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.result_status_fail));
                                }
                            });
                            break;
                        //电量
                        case PRINTER_BATTERY_LLUCK:
                            PrinterHelper.getInstance().getBatteryLuck(new ResultCallback<Integer>() {
                                @Override
                                public void onSuccess(Integer data) {
                                    String result = getString(R.string.result_battery, data);
                                    setMessageContent(result);
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.result_battery_fail));
                                }
                            });
                            break;
                        //浓度参数
                        case GET_DENSITY:
                            PrinterHelper.getInstance().getDensityLuck(new ResultCallback<Integer>() {
                                @Override
                                public void onSuccess(Integer data) {
                                    String result = getString(R.string.result_density, data);
                                    setMessageContent(result);
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.result_density_fail));
                                }

                            });
                            break;
                        //设置浓度
                        case SET_DENSITY:
                            showNumberInputDialog(R.string.demo_dialog_enter_density,
                                    R.string.demo_dialog_enter_density, 2, value ->
                                    PrinterHelper.getInstance().setDensityLuck(value, new ResultCallback<Integer>() {
                                        @Override
                                        public void onSuccess(Integer data) {
                                            setMessageContent(getString(R.string.result_density_set_ok));
                                        }

                                        @Override
                                        public void onFail() {
                                            setMessageContent(getString(R.string.result_density_set_fail));
                                        }
                                    }));
                            break;
                        //速度参数
                        case GET_SPEED:
                            PrinterHelper.getInstance().getSpeed(new ResultCallback<Integer>() {
                                @Override
                                public void onSuccess(Integer data) {
                                    String result = getString(R.string.demo_result_speed, data);
                                    setMessageContent(result);
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.demo_result_speed_fail));
                                }

                            });
                            break;
                        //设置速度
                        case SET_SPEED:
                            showNumberInputDialog(R.string.demo_dialog_enter_speed,
                                    R.string.demo_dialog_enter_speed, 1, value ->
                                    PrinterHelper.getInstance().setSpeedLuck(value, new ResultCallback<Integer>() {
                                        @Override
                                        public void onSuccess(Integer data) {
                                            setMessageContent(getString(R.string.demo_result_speed_set_ok));
                                        }

                                        @Override
                                        public void onFail() {
                                            setMessageContent(getString(R.string.demo_result_speed_set_fail));
                                        }
                                    }));
                            break;
                        //设置自动关机时间
                        case SET_SHUTTIME_LUCK:
                            showNumberInputDialog(R.string.demo_dialog_enter_shut_time,
                                    R.string.demo_dialog_enter_shut_time, 2, value -> {
                                        if (value < 0) {
                                            value = 0;
                                        }
                                        PrinterHelper.getInstance().setShutTimeLuck(value, new ResultCallback<Integer>() {
                                            @Override
                                            public void onSuccess(Integer data) {
                                                setMessageContent(getString(R.string.result_shut_time_set_ok));
                                            }

                                            @Override
                                            public void onFail() {
                                                setMessageContent(getString(R.string.result_shut_time_set_fail));
                                            }
                                        });
                                    });
                            break;

                        //出厂设置
                        case SET_RECOVERY_LUCK:
                            PrinterHelper.getInstance().setRecoveryLuck(new ResultCallback<Integer>() {
                                @Override
                                public void onSuccess(Integer data) {
                                    setMessageContent(getString(R.string.demo_recovery_ok));
                                }

                                @Override
                                public void onFail() {
                                    setMessageContent(getString(R.string.demo_recovery_fail));
                                }
                            });
                            break;
                        case GO_PAPER:
                            PrinterHelper.getInstance().printLineDotsLuck(144);
                            break;
                        case REVERSE_GO_PAPER:
                            PrinterHelper.getInstance().printReverseLineDotsLuck(144);
                            break;
                        case PACK_ERROR_LOG:
                            String errorZipFile = FileEventRecorder.getInstance().getPrinterErrorZipFile();
                            showToast(getString(errorZipFile != null ? R.string.demo_pack_log_ok : R.string.demo_pack_log_fail));
                            if (errorZipFile != null) {
                                sendErrorLogToEmail(new File(errorZipFile));
                            }
                            break;
                        case PRINTER_SETTING_LUCK:
                            PrinterHelper.getInstance().printerSettingLuck(new ResultCallback<String>() {
                                @Override
                                public void onSuccess(String data) {
                                    setMessageContent(getString(R.string.demo_md5, data));
                                }

                                @Override
                                public void onFail() {

                                }
                            });
                            break;

                    }
                }
            }
        });
    }

    /**
     * 通过邮件发送连接日志
     * @param attachmentFile
     */
    private void sendErrorLogToEmail(File attachmentFile) {
        String email = "mack@luckjingle.com";
        Context context = this;
        String subject = "bugReport";
        String message = "bugReport";

        Intent emailIntent = new Intent(Intent.ACTION_SEND);
        emailIntent.setType("text/plain");
        emailIntent.putExtra(Intent.EXTRA_EMAIL, new String[]{email});
        emailIntent.putExtra(Intent.EXTRA_SUBJECT, subject);
        emailIntent.putExtra(Intent.EXTRA_TEXT, message);

        Uri attachmentUri = FileProvider.getUriForFile(context, getPackageName() + ".fileprovider", attachmentFile);
        emailIntent.putExtra(Intent.EXTRA_STREAM, attachmentUri);
        emailIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.startActivity(Intent.createChooser(emailIntent, "Send email..."));
    }

    /**
     * 打印连续纸图片对话框
     */
    private void showPrintBitmapDialog() {
        PrintContinuousDialog dialog = new PrintContinuousDialog(this);
        dialog.setCallback(new PrintContinuousDialog.Callback() {
            @Override
            public void printImg(Bitmap bitmap, boolean isGray, int grayScale, int count, Integer widthMM) {
                LuckPrinterSdkDemoActivity.this.printImg(bitmap, isGray, grayScale, count, widthMM, false);
            }
        });
        dialog.show();
    }

    /**
     * 打印缝隙纸图片对话框
     */
    private void showPrintBitmapDialogTag() {
        View view = LayoutInflater.from(this).inflate(R.layout.layout_print_bitmap_label, null);
        EditText et = view.findViewById(R.id.et_content);
        EditText etWidth = view.findViewById(R.id.et_width);
        EditText etHeight = view.findViewById(R.id.et_height);

        int tagWidth = SPUtil.getTagWidth();
        int tagHeight = SPUtil.getTagHeight();
        if (tagWidth > 0) {
            etWidth.setText(String.valueOf(tagWidth));
        }
        if (tagHeight > 0) {
            etHeight.setText(String.valueOf(tagHeight));
        }

        final Uri[] imageUri = new Uri[1];
        setupDialogSelectPhoto(view, imageUri);

        showPrintImageDialog(R.string.demo_print_image_title, view, d -> {
            if (imageUri[0] == null) {
                PrinterUtil.showToast(getString(R.string.error_select_image));
                return false;
            }
            int count = parseIntOrDefault(et.getText().toString(), 1);
            if (count < 1) {
                count = 1;
            }
            int width = parseIntOrDefault(etWidth.getText().toString(), 50);
            int height = parseIntOrDefault(etHeight.getText().toString(), 30);

            SPUtil.putTagWidth(width);
            SPUtil.putTagHeight(height);

            try {
                Bitmap bitmap = MediaStore.Images.Media.getBitmap(getContentResolver(), imageUri[0]);
                int printWidth = width * (PrinterHelper.getInstance().is304Dpi() ? 12 : 8);
                int printMaxWidth = PrinterHelper.getInstance().getPrintMaxWidth();
                if (printWidth > printMaxWidth) {
                    printWidth = printMaxWidth;
                }
                int printHeight = (int) (printWidth * ((height * 1.0f) / width));
                printTag(bitmap, printWidth, printHeight, count);
                return true;
            } catch (IOException e) {
                PrinterUtil.showToast(getString(R.string.error_image_load));
                return false;
            }
        });
    }

    /**
     * 打印圆形缝隙纸图片对话框
     */
    private void showPrintBitmapDialogCircleTag() {
        View view = LayoutInflater.from(this).inflate(R.layout.layout_print_bitmap_circle_label, null);
        EditText et = view.findViewById(R.id.et_content);
        EditText etWidth = view.findViewById(R.id.et_width);
        EditText etHeight = view.findViewById(R.id.et_height);

        int tagWidth = SPUtil.getCircleTagWidth();
        int tagHeight = SPUtil.getCircleTagHeight();
        if (tagWidth > 0) {
            etWidth.setText(String.valueOf(tagWidth));
        }
        if (tagHeight > 0) {
            etHeight.setText(String.valueOf(tagHeight));
        }

        final Uri[] imageUri = new Uri[1];
        setupDialogSelectPhoto(view, imageUri);

        showPrintImageDialog(R.string.demo_print_image_title, view, d -> {
            if (imageUri[0] == null) {
                PrinterUtil.showToast(getString(R.string.error_select_image));
                return false;
            }
            int count = parseIntOrDefault(et.getText().toString(), 1);
            if (count < 1) {
                count = 1;
            }
            int width = parseIntOrDefault(etWidth.getText().toString(), 50);
            int height = parseIntOrDefault(etHeight.getText().toString(), 50);

            SPUtil.putCircleTagWidth(width);
            SPUtil.putCircleTagHeight(height);

            try {
                Bitmap bitmap = MediaStore.Images.Media.getBitmap(getContentResolver(), imageUri[0]);
                int printWidth = width * (PrinterHelper.getInstance().is304Dpi() ? 12 : 8);
                int printMaxWidth = PrinterHelper.getInstance().getPrintMaxWidth();
                if (printWidth > printMaxWidth) {
                    printWidth = printMaxWidth;
                }
                int printHeight = (int) (printWidth * ((height * 1.0f) / width));
                printCircleTag(bitmap, printWidth, printHeight, count);
                return true;
            } catch (IOException e) {
                PrinterUtil.showToast(getString(R.string.error_image_load));
                return false;
            }
        });
    }

    private void showBlackPrintBitmapDialogTag() {
        View view = LayoutInflater.from(this).inflate(R.layout.layout_print_bitmap_label, null);
        EditText et = view.findViewById(R.id.et_content);
        EditText etWidth = view.findViewById(R.id.et_width);
        EditText etHeight = view.findViewById(R.id.et_height);

        int tagWidth = SPUtil.getTagBlackWidth();
        int tagHeight = SPUtil.getTagBlackHeight();
        if (tagWidth > 0) {
            etWidth.setText(String.valueOf(tagWidth));
        }
        if (tagHeight > 0) {
            etHeight.setText(String.valueOf(tagHeight));
        }

        final Uri[] imageUri = new Uri[1];
        setupDialogSelectPhoto(view, imageUri);

        showPrintImageDialog(R.string.demo_print_image_title, view, d -> {
            if (imageUri[0] == null) {
                PrinterUtil.showToast(getString(R.string.error_select_image));
                return false;
            }
            int count = parseIntOrDefault(et.getText().toString(), 1);
            if (count < 1) {
                count = 1;
            }
            int width = parseIntOrDefault(etWidth.getText().toString(), 50);
            int height = parseIntOrDefault(etHeight.getText().toString(), 30);

            SPUtil.putTagBlackWidth(width);
            SPUtil.putTagBlackHeight(height);

            try {
                Bitmap bitmap = MediaStore.Images.Media.getBitmap(getContentResolver(), imageUri[0]);
                int printWidth = width * (PrinterHelper.getInstance().is304Dpi() ? 12 : 8);
                int printMaxWidth = PrinterHelper.getInstance().getPrintMaxWidth();
                if (printWidth > printMaxWidth) {
                    printWidth = printMaxWidth;
                }
                int printHeight = (int) (printWidth * ((height * 1.0f) / width));
                printBlackTag(bitmap, printWidth, printHeight, count);
                return true;
            } catch (IOException e) {
                PrinterUtil.showToast(getString(R.string.error_image_load));
                return false;
            }
        });
    }

    private void showPrintBitmapDialogSheetLabel() {
        View view = LayoutInflater.from(this).inflate(R.layout.layout_print_bitmap_sheet_label, null);
        EditText et = view.findViewById(R.id.et_content);
        EditText etWidth = view.findViewById(R.id.et_width);
        EditText etHeight = view.findViewById(R.id.et_height);
        EditText etSpeed = view.findViewById(R.id.et_speed);
        EditText etDensity = view.findViewById(R.id.et_density);

        final Uri[] imageUri = new Uri[1];
        setupDialogSelectPhoto(view, imageUri);

        showPrintImageDialog(R.string.demo_print_image_title, view, d -> {
            if (imageUri[0] == null) {
                PrinterUtil.showToast(getString(R.string.error_select_image));
                return false;
            }
            int count = parseIntOrDefault(et.getText().toString(), 1);
            if (count < 1) {
                count = 1;
            }
            int width = parseIntOrDefault(etWidth.getText().toString(), 76);
            int height = parseIntOrDefault(etHeight.getText().toString(), 130);
            int speed = parseIntOrDefault(etSpeed.getText().toString(), 8);
            int density = parseIntOrDefault(etDensity.getText().toString(), 15);

            try {
                Bitmap bitmap = MediaStore.Images.Media.getBitmap(getContentResolver(), imageUri[0]);
                int printWidth = width * (PrinterHelper.getInstance().is304Dpi() ? 12 : 8) - 1;
                int printHeight = (int) (printWidth * ((height * 1.0f) / width));
                printImgSheetLabel(bitmap, width, height, printWidth, printHeight, speed, density, count);
                return true;
            } catch (IOException e) {
                PrinterUtil.showToast(getString(R.string.error_image_load));
                return false;
            }
        });
    }

    /**
     * 缝隙纸打印
     */
    private void printImgSheetLabel(Bitmap bitmap, int widthMM, int heightMM,
                                    int width, int height, int speed, int density, int count) {
        PrinterHelper.getInstance().getPrinterStatus(new ResultCallback<PrinterStatusData>() {
            @Override
            public void onSuccess(PrinterStatusData data) {
                int errorCode = -1;
                if (data.getIsLackElec() == 1) {
                    errorCode = PrinterStatus.PRINTER_STATUS_LOWVAL;
                }
                if (data.getIsLackPaper() == 1) {
                    errorCode = PrinterStatus.PRINTER_STATUS_OUTPAPER;
                }
                if (data.getIsOpen() == 1) {
                    errorCode = PrinterStatus.PRINTER_STATUS_OPENCOVER;
                }
                if (data.getIsOverheat() == 1) {
                    errorCode = PrinterStatus.PRINTER_STATUS_OVERHEAT;
                }
                if (errorCode >= 0) {
                    showStatusToast(errorCode);
                } else {
                    Bitmap resizeBitmap;
                    resizeBitmap = Bitmap.createScaledBitmap(bitmap, width, height, true);
                    if (bitmap != resizeBitmap) {
                        bitmap.recycle();
                    }
                    resizeBitmap = OpenCVUtils.getInstance().getFlyodBitmapNew(resizeBitmap);
                    PrinterHelper.getInstance().printSheetLabel(widthMM, heightMM, speed,
                            density, resizeBitmap, count);
                }
            }

            @Override
            public void onFail() {

            }
        });
    }

    /**
     * 打印a4折叠纸纸图片对话框
     */
    private void showPrintBitmapDialogFolder() {
        View view = LayoutInflater.from(this).inflate(R.layout.layout_print_bitmap_a4_folder, null);
        EditText et = view.findViewById(R.id.et_content);
        RadioGroup rgA4Size = view.findViewById(R.id.rg_a4_size);

        final Uri[] imageUri = new Uri[1];
        setupDialogSelectPhoto(view, imageUri);

        showPrintImageDialog(R.string.demo_print_image_title, view, d -> {
            if (imageUri[0] == null) {
                PrinterUtil.showToast(getString(R.string.error_select_image));
                return false;
            }
            int count = parseIntOrDefault(et.getText().toString(), 1);
            if (count < 1) {
                count = 1;
            }

            try {
                RadioButton rb = rgA4Size.findViewById(rgA4Size.getCheckedRadioButtonId());
                String a4SizeText = (String) rb.getTag();
                String[] a4Size = a4SizeText.split("x");
                PrinterHelper.getInstance().setA4PaperSize(
                        Integer.parseInt(a4Size[0]),
                        Integer.parseInt(a4Size[1])
                );

                Bitmap bitmap = MediaStore.Images.Media.getBitmap(getContentResolver(), imageUri[0]);
                printImgA4Folder(bitmap, count);
                return true;
            } catch (Exception e) {
                PrinterUtil.showToast(getString(R.string.error_image_load));
                return false;
            }
        });
    }

    /**
     * 打印a4纹身纸图片对话框
     */
    private void showPrintBitmapDialogTattoo() {
        View view = LayoutInflater.from(this).inflate(R.layout.layout_print_bitmap_a4_folder, null);
        EditText et = view.findViewById(R.id.et_content);
        RadioGroup rgA4Size = view.findViewById(R.id.rg_a4_size);

        final Uri[] imageUri = new Uri[1];
        setupDialogSelectPhoto(view, imageUri);

        showPrintImageDialog(R.string.demo_print_image_title, view, d -> {
            if (imageUri[0] == null) {
                PrinterUtil.showToast(getString(R.string.error_select_image));
                return false;
            }
            int count = parseIntOrDefault(et.getText().toString(), 1);
            if (count < 1) {
                count = 1;
            }

            try {
                RadioButton rb = rgA4Size.findViewById(rgA4Size.getCheckedRadioButtonId());
                String a4Size = (String) rb.getTag();
                String[] a4SizeArray = a4Size.split("x");
                int width = Integer.parseInt(a4SizeArray[0]);
                int height = Integer.parseInt(a4SizeArray[1]);
                PrinterHelper.getInstance().setA4PaperSize(width, height);

                Bitmap bitmap = MediaStore.Images.Media.getBitmap(getContentResolver(), imageUri[0]);
                printImgA4Tattoo(bitmap, count);
                return true;
            } catch (Exception e) {
                PrinterUtil.showToast(getString(R.string.error_image_load));
                return false;
            }
        });
    }

    /**
     * 连续纸打印
     *
     * @param bitmap
     * @param count
     * @param widthMM 设置的打印宽度，单位mm
     */
    private void printImg(Bitmap bitmap, boolean useGray, int grayLevel,
                          int count, Integer widthMM, boolean once) {
        Integer requireWidth = null;
        if (widthMM != null) {
            if (widthMM < 10) {
                widthMM = 10;
            }
            requireWidth = (PrinterHelper.getInstance().is304Dpi() ? 12 : 8) * widthMM;
        }

        Bitmap resizeBitmap;
        int printWidth = PrinterHelper.getInstance().getPrintWidth();
        if (requireWidth != null) {
            printWidth = Math.min(printWidth, requireWidth);
        }

        float scale = printWidth * 1.0f / bitmap.getWidth();
        int printHeight = (int) (scale * bitmap.getHeight());

        resizeBitmap = Bitmap.createScaledBitmap(bitmap, printWidth, printHeight, true);
        if (bitmap != resizeBitmap) {
            bitmap.recycle();
        }
        resizeBitmap = OpenCVUtils.getInstance().getFlyodBitmapNew(resizeBitmap);
        OnPrintCallback callback = new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                PrinterUtil.showToast(getString(R.string.print_start));
            }

            @Override
            public void onPrinting(int page, int num) {
                PrinterUtil.showToast(getString(R.string.print_progress, page, num));
            }

            @Override
            public void onPrintIndexStart(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print start ..." + page + "/" + num);
            }

            @Override
            public void onPrintIndexEnd(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print end ..." + page + "/" + num);
            }

            @Override
            public void onPrintSuccess() {
                PrinterUtil.showToast(getString(R.string.print_success));
            }

            @Override
            public void onPrintFail(int status) {
                showStatusToast(status);
            }
        };

        if (once && count == 1) {
            PrinterHelper.getInstance().printOnce(resizeBitmap, useGray, grayLevel, 1, 1, new ResultCallback<Integer>() {
                @Override
                public void onSuccess(Integer data) {
                    PrinterUtil.showToast(getString(R.string.print_success));
                }

                @Override
                public void onFail() {

                }
            });
        } else {
            PrinterHelper.getInstance().print(resizeBitmap, useGray, grayLevel, count, callback);
        }

    }

    /**
     * 连续纸打印
     *
     * @param bitmap
     * @param count
     * @param widthMM 设置的打印宽度，单位mm
     */
    private void printImgGray(Bitmap bitmap, int count, Integer widthMM) {
        Integer requireWidth = null;
        if (widthMM != null) {
            if (widthMM < 10) {
                widthMM = 10;
            }
            requireWidth = (PrinterHelper.getInstance().is304Dpi() ? 12 : 8) * widthMM;
        }

        Bitmap resizeBitmap;
        int printWidth = PrinterHelper.getInstance().getPrintWidth();
        if (requireWidth != null) {
            printWidth = Math.min(printWidth, requireWidth);
        }

        float scale = printWidth * 1.0f / bitmap.getWidth();
        int printHeight = (int) (scale * bitmap.getHeight());

        resizeBitmap = Bitmap.createScaledBitmap(bitmap, printWidth, printHeight, true);
        if (bitmap != resizeBitmap) {
            bitmap.recycle();
        }
        resizeBitmap = OpenCVUtils.getInstance().getFlyodBitmapNew(resizeBitmap);
        OnPrintCallback callback = new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                PrinterUtil.showToast(getString(R.string.print_start));
            }

            @Override
            public void onPrinting(int page, int num) {
                PrinterUtil.showToast(getString(R.string.print_progress, page, num));
            }

            @Override
            public void onPrintIndexStart(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print start ..." + page + "/" + num);
            }

            @Override
            public void onPrintIndexEnd(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print end ..." + page + "/" + num);
            }

            @Override
            public void onPrintSuccess() {
                PrinterUtil.showToast(getString(R.string.print_success));
            }

            @Override
            public void onPrintFail(int status) {
                showStatusToast(status);
            }
        };

        PrinterHelper.getInstance().print(resizeBitmap, count, callback);
    }

    /**
     * 缝隙纸打印
     */
    private void printBlackTag(Bitmap bitmap, int width, int height, int count) {
        Bitmap resizeBitmap;
        resizeBitmap = Bitmap.createScaledBitmap(bitmap, width, height, true);
        if (bitmap != resizeBitmap) {
            bitmap.recycle();
        }
        resizeBitmap = OpenCVUtils.getInstance().getFlyodBitmapNew(resizeBitmap);
        OnPrintCallback callback = new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                PrinterUtil.showToast(getString(R.string.print_start));
            }

            @Override
            public void onPrinting(int page, int num) {
                PrinterUtil.showToast(getString(R.string.print_progress, page, num));
            }

            @Override
            public void onPrintIndexStart(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print start ..." + page + "/" + num);
            }

            @Override
            public void onPrintIndexEnd(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print end ..." + page + "/" + num);
            }

            @Override
            public void onPrintSuccess() {
                PrinterUtil.showToast(getString(R.string.print_success));
            }

            @Override
            public void onPrintFail(int status) {
                showStatusToast(status);
            }
        };

        PrinterHelper.getInstance().printBlackTag(resizeBitmap, count, callback);
    }

    /**
     * 缝隙纸打印
     */
    private void printTag(Bitmap bitmap, int width, int height, int count) {
        Bitmap resizeBitmap;
        resizeBitmap = Bitmap.createScaledBitmap(bitmap, width, height, true);
        if (bitmap != resizeBitmap) {
            bitmap.recycle();
        }
        resizeBitmap = OpenCVUtils.getInstance().getFlyodBitmapNew(resizeBitmap);
        OnPrintCallback callback = new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                PrinterUtil.showToast(getString(R.string.print_start));
            }

            @Override
            public void onPrinting(int page, int num) {
                PrinterUtil.showToast(getString(R.string.print_progress, page, num));
            }

            @Override
            public void onPrintIndexStart(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print start ..." + page + "/" + num);
            }

            @Override
            public void onPrintIndexEnd(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print end ..." + page + "/" + num);
            }

            @Override
            public void onPrintSuccess() {
                PrinterUtil.showToast(getString(R.string.print_success));
            }

            @Override
            public void onPrintFail(int status) {
                showStatusToast(status);
            }
        };

        PrinterHelper.getInstance().printTag(resizeBitmap, count, callback);
    }


    /**
     * 缝隙纸打印
     */
    private void printCircleTag(Bitmap bitmap, int width, int height, int count) {
        Bitmap resizeBitmap;
        resizeBitmap = Bitmap.createScaledBitmap(bitmap, width, height, true);
        if (bitmap != resizeBitmap) {
            bitmap.recycle();
        }
        resizeBitmap = OpenCVUtils.getInstance().getFlyodBitmapNew(resizeBitmap);
        OnPrintCallback callback = new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                PrinterUtil.showToast(getString(R.string.print_start));
            }

            @Override
            public void onPrinting(int page, int num) {
                PrinterUtil.showToast(getString(R.string.print_progress, page, num));
            }

            @Override
            public void onPrintIndexStart(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print start ..." + page + "/" + num);
            }

            @Override
            public void onPrintIndexEnd(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print end ..." + page + "/" + num);
            }

            @Override
            public void onPrintSuccess() {
                PrinterUtil.showToast(getString(R.string.print_success));
            }

            @Override
            public void onPrintFail(int status) {
                showStatusToast(status);
            }
        };

        PrinterHelper.getInstance().printCircleTag(resizeBitmap, count, callback);
    }

    /**
     * a4折叠纸连续纸打印
     */
    private void printImgA4Folder(Bitmap bitmap, int count) {
        Bitmap resizeBitmap;
        if (PrinterHelper.getInstance().isA4Printer()) {
            //A4一页一页打印
            int pageWidth = PrinterHelper.getInstance().getA4PrintWidth();
            int pageHeight = PrinterHelper.getInstance().getA4PrintHeight();
            float scale = Math.min(pageWidth * 1.0f / bitmap.getWidth(), pageHeight * 1.0f / bitmap.getHeight());
            Matrix matrix = new Matrix();
            matrix.postScale(scale, scale);
            matrix.postTranslate((pageWidth - bitmap.getWidth() * scale) / 2, 0);
            resizeBitmap = Bitmap.createBitmap(pageWidth, pageHeight, Bitmap.Config.RGB_565);
            Canvas canvas = new Canvas(resizeBitmap);
            canvas.setDrawFilter(new PaintFlagsDrawFilter(0, Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
            canvas.drawColor(Color.WHITE);
            canvas.drawBitmap(bitmap, matrix, new Paint(Paint.ANTI_ALIAS_FLAG));
            if (resizeBitmap != bitmap) {
                bitmap.recycle();
            }
            resizeBitmap = OpenCVUtils.getInstance().getFlyodBitmapNew(resizeBitmap);
            OnPrintCallback callback = new OnPrintCallback() {
                @Override
                public void onStartPrint() {
                    PrinterUtil.showToast(getString(R.string.print_start));
                }

                @Override
                public void onPrinting(int page, int num) {
                    PrinterUtil.showToast(getString(R.string.print_progress, page, num));
                }

                @Override
                public void onPrintIndexStart(Bitmap bitmap, int page, int num) {
                    Log.d(TAG, "print start ..." + page + "/" + num);
                }

                @Override
                public void onPrintIndexEnd(Bitmap bitmap, int page, int num) {
                    Log.d(TAG, "print end ..." + page + "/" + num);
                }

                @Override
                public void onPrintSuccess() {
                    PrinterUtil.showToast(getString(R.string.print_success));
                }

                @Override
                public void onPrintFail(int status) {
                    showStatusToast(status);
                }
            };
            PrinterHelper.getInstance().printFolder(resizeBitmap, count, callback);
        } else {
            PrinterUtil.showToast(getString(R.string.demo_not_a4_printer));
        }
    }
    /**
     * a4折叠纸连续纸打印
     */
    private void printImgA4Tattoo(Bitmap bitmap, int count) {
        Bitmap resizeBitmap;
        int pageWidth = 0;
        int pageHeight = 0;
        if (PrinterHelper.getInstance().isA4Printer()) {
            //A4一页一页打印
            pageWidth = PrinterHelper.getInstance().getA4PrintWidth();
            pageHeight = PrinterHelper.getInstance().getA4PrintHeight();
        } else {
            pageWidth = PrinterHelper.getInstance().getPrintWidth();
            pageHeight = pageWidth;
        }

        float scale = Math.min(pageWidth * 1.0f / bitmap.getWidth(), pageHeight * 1.0f / bitmap.getHeight());
        Matrix matrix = new Matrix();
        matrix.postScale(scale, scale);
        matrix.postTranslate((pageWidth - bitmap.getWidth() * scale) / 2, 0);
        resizeBitmap = Bitmap.createBitmap(pageWidth, pageHeight, Bitmap.Config.RGB_565);
        Canvas canvas = new Canvas(resizeBitmap);
        canvas.setDrawFilter(new PaintFlagsDrawFilter(0, Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG));
        canvas.drawColor(Color.WHITE);
        canvas.drawBitmap(bitmap, matrix, new Paint(Paint.ANTI_ALIAS_FLAG));
        if (resizeBitmap != bitmap) {
            bitmap.recycle();
        }
        resizeBitmap = OpenCVUtils.getInstance().getFlyodBitmapNew(resizeBitmap);
        OnPrintCallback callback = new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                PrinterUtil.showToast(getString(R.string.print_start));
            }

            @Override
            public void onPrinting(int page, int num) {
                PrinterUtil.showToast(getString(R.string.print_progress, page, num));
            }

            @Override
            public void onPrintIndexStart(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print start ..." + page + "/" + num);
            }

            @Override
            public void onPrintIndexEnd(Bitmap bitmap, int page, int num) {
                Log.d(TAG, "print end ..." + page + "/" + num);
            }

            @Override
            public void onPrintSuccess() {
                PrinterUtil.showToast(getString(R.string.print_success));
            }

            @Override
            public void onPrintFail(int status) {
                showStatusToast(status);
            }
        };
        PrinterHelper.getInstance().printTattoo(resizeBitmap, count, callback);
    }

    private void initPrinterList() {
        rv_list.setLayoutManager(new GridLayoutManager(this, 2));

        deviceAdapter = new PrinterDeviceAdapter(deviceList);
        rv_list.setAdapter(deviceAdapter);
        deviceAdapter.setItemClickListener(device -> {
            PrinterHelper helper = PrinterHelper.getInstance();
            if (helper.isConnectedLuck()) {
                BaseDevice connected = helper.getPrinterDevice();
                if (connected != null
                        && device.getMac() != null
                        && device.getMac().equals(connected.getDeviceMac())) {
                    disconnectBluetooth();
                    return;
                }
            }
            setMessageContent(getString(R.string.status_connecting));
            Executors.newCachedThreadPool().execute(() -> {
                boolean result = helper.connectLuck(device.getName(), device.getMac(), device.getType());
                if (result) {
                    setCustomPrinterProperty();
                }
                BaseDevice printerDevice = helper.getPrinterDevice();
                String deviceClassName = printerDevice != null ? printerDevice.getClass().getSimpleName() : "";
                if (result) {
                    setMessageContent(getString(R.string.status_connected, deviceClassName));
                } else {
                    setMessageContent(getString(R.string.status_connect_fail));
                }
                printTestPage(device);
                runOnUiThread(() -> {
                    if (deviceAdapter != null) {
                        deviceAdapter.notifyDataSetChanged();
                    }
                });
            });
        });
    }

    private void printTestPage(DeviceItem device) {
        if (PrinterHelper.getInstance().isConnectedLuck() && device.getName().equals("MPT-II")) {
            PrinterHelper.getInstance().sendCommand(new byte[]{0x12, 0x54}, new ResultCallback<Integer>() {
                @Override
                public void onSuccess(Integer data) {
                    PrinterUtil.showToast(getString(R.string.demo_test_print_ok, String.valueOf(data)));
                }

                @Override
                public void onFail() {
                    PrinterUtil.showToast(getString(R.string.demo_test_print_fail));

                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        switch (requestCode) {
            case SELECT_UPDATE_FILE: {
                if (resultCode == RESULT_OK) {
                    if (!PrinterHelper.getInstance().isConnectedLuck()) {
                        PrinterUtil.runOnUi(new Runnable() {
                            @Override
                            public void run() {
                                PrinterUtil.showToast(getString(R.string.status_not_connected));
                            }
                        });
                        return;
                    }

                    Uri uri = data.getData();
                    String filePath = FileUriUtils.getFileAbsolutePath(this, uri);
                    if (filePath != null
                            && (filePath.toUpperCase().endsWith(".BIN")
                            || filePath.toUpperCase().endsWith(".PRTU")
                    )) {
                        doUpdate(filePath);
                    } else {
                        PrinterUtil.showToast(getString(R.string.demo_upgrade_file_invalid));
                    }
                }
            }
            break;
            default:
                break;
        }
    }

    private boolean copyAssetToInternalStorage(String assetFileName, String outFile) {
        AssetManager assetManager = getAssets();
        InputStream in = null;
        OutputStream out = null;
        boolean isSuccess = false;
        try {
            in = assetManager.open(assetFileName);
            out = new FileOutputStream(outFile);

            byte[] buffer = new byte[1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            isSuccess = true;
        } catch (IOException e) {
            e.printStackTrace();
        } finally {
            try {
                in.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
            try {
                out.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        if (!isSuccess) {
            if (outFile != null && new File(outFile).exists()) {
                new File(outFile).delete();
            }
            return false;
        } else {
            return true;
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (scanDeviceHelper != null) {
            scanDeviceHelper.unInit();
            scanDeviceHelper = null;
        }

        PrinterHelper.getInstance().removeConnectListener(this);
        PrinterHelper.getInstance().removeDeviceStatusListener(this);
        PrinterHelper.getInstance().removeEventListener(this);
    }

    /**
     * 是否蓝牙权限都已授权
     *
     * @return
     */
    private boolean isBluePermissionGranted() {
        boolean isGranted = true;
        // Android 6.0动态请求权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            for (String str : needPermissons) {
                if (checkSelfPermission(str) != PackageManager.PERMISSION_GRANTED) {
                    isGranted = false;
                    break;
                }
            }
        }
        return isGranted;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQCODE_PERMISSION) {
            if (isBluePermissionGranted()) {
                initPrinterList();
                startScan();
            } else {
                showToast(getString(R.string.bluetooth_permission_denied));
            }
        }
    }

    public void reScan() {
        DeviceItem connectedItem = findConnectedDeviceItem();
        deviceList.clear();
        if (connectedItem != null) {
            deviceList.add(connectedItem);
        }
        if (deviceAdapter != null) {
            deviceAdapter.notifyDataSetChanged();
        }
        refreshEmptyDeviceView();
        startScan();
    }

    private DeviceItem findConnectedDeviceItem() {
        PrinterHelper helper = PrinterHelper.getInstance();
        if (!helper.isConnectedLuck()) {
            return null;
        }
        BaseDevice device = helper.getPrinterDevice();
        if (device == null) {
            return null;
        }
        String mac = device.getDeviceMac();
        if (TextUtils.isEmpty(mac)) {
            return null;
        }
        for (DeviceItem item : deviceList) {
            if (mac.equals(item.getMac()) && isBluetoothPrinterName(item.getName())) {
                return item;
            }
        }
        String name = device.getDeviceName();
        if (!isBluetoothPrinterName(name)) {
            return null;
        }
        return new DeviceItem(BluetoothDevice.DEVICE_TYPE_DUAL, name, mac);
    }

    /** 旧 Demo 仅展示蓝牙打印机，排除 AI50 WiFi 打印机。 */
    private static boolean isBluetoothPrinterName(String name) {
        return name != null && !name.startsWith(AI50_WIFI_PREFIX);
    }

    private void disconnectBluetooth() {
        PrinterHelper helper = PrinterHelper.getInstance();
        if (!helper.isConnectedLuck()) {
            PrinterUtil.showToast(getString(R.string.status_not_connected));
            return;
        }
        Executors.newCachedThreadPool().execute(() -> {
            boolean success = helper.disconnectLuck();
            runOnUiThread(() -> {
                if (success) {
                    setMessageContent(getString(R.string.status_disconnected));
                } else {
                    setMessageContent(getString(R.string.status_disconnect_fail));
                }
                if (deviceAdapter != null) {
                    deviceAdapter.notifyDataSetChanged();
                }
            });
        });
    }

    private void doUpdate(String filePath) {
        File file = new File(filePath);
        PrinterHelper.getInstance().updatePrinterLuck(file, new UpdateListener() {
            @Override
            public void onStart() {
                setMessageContent(getString(R.string.result_upgrade_start));
            }

            @Override
            public void onProgress(int progress) {
                setMessageContent(getString(R.string.result_upgrade_progress, progress));
            }

            @Override
            public void onError() {
                setMessageContent(getString(R.string.result_upgrade_error));
            }

            @Override
            public void onComplete() {
                setMessageContent(getString(R.string.result_upgrade_done));
            }
        });
    }

    @Override
    public void onClick(View v) {
        int vid = v.getId();
        if (vid == R.id.btn_update) {
            if (!PrinterHelper.getInstance().isConnectedLuck()) {
                Toast.makeText(this, R.string.status_not_connected, Toast.LENGTH_SHORT).show();
                return;
            }
            String namePrefix = PrinterHelper.getInstance().getPrinterDevice().getNamePrefix();
            String assetsFileName = testFirmwareConfig.get(namePrefix);
            if (TextUtils.isEmpty(assetsFileName)) {
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("*/*");
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(intent, SELECT_UPDATE_FILE);
            } else {
                String outFile = getFilesDir() + "/" + assetsFileName;
                boolean isSuccess = true;
                if (!new File(outFile).exists()) {
                    isSuccess = copyAssetToInternalStorage(assetsFileName, outFile);
                    if (!isSuccess) {
                        PrinterUtil.showToast(getString(R.string.demo_firmware_gen_fail));
                        return;
                    }
                } else {
                    isSuccess = true;
                }
                if (isSuccess) {
                    doUpdate(outFile);
                }
            }
        }
        if (vid == R.id.btn_unpair) {
            Intent intent = new Intent(this, BluetoothActivity.class);
            startActivity(intent);
        }
    }

    @Override
    public void onDeviceStatus(int status) {
        showStatusToast(status);
    }

    @Override
    public void onLuckConnected(String name, String address) {
        Log.d(TAG, "onConnected: " + address);
        if (deviceAdapter != null) {
            deviceAdapter.notifyDataSetChanged();
        }

        setMessageContent(getString(R.string.demo_bt_connected));
    }

    @Override
    public void onLuckDisConnected() {
        setMessageContent(getString(R.string.status_disconnected));
        if (deviceAdapter != null) {
            deviceAdapter.notifyDataSetChanged();
        }
    }

    private void showStatusToast(int status) {
        switch (status) {
            case PrinterStatus.PRINTER_STATUS_OUTPAPER:
                PrinterUtil.showToast(getString(R.string.print_status_outpaper));
                break;
            case PrinterStatus.PRINTER_STATUS_OPENCOVER:
                PrinterUtil.showToast(getString(R.string.print_status_opencover));
                break;
            case PrinterStatus.PRINTER_STATUS_OVERHEAT:
                PrinterUtil.showToast(getString(R.string.print_status_overheat));
                break;
            case PrinterStatus.PRINTER_STATUS_LOWVAL:
                PrinterUtil.showToast(getString(R.string.demo_status_low_voltage));
                break;
            default:
                PrinterUtil.showToast(getString(R.string.print_fail));
                break;
        }
    }

    private void showToast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }

    private void setMessageContent(String message) {
        tv_message.post(() -> {
            tv_message.setText(message);
        });
    }

    private interface NumberInputCallback {
        void onSubmit(int value);
    }

    private void showNumberInputDialog(int titleRes, int hintRes, int maxLength, NumberInputCallback callback) {
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_ai50_input, null);
        EditText etInput = view.findViewById(R.id.et_input);
        etInput.setHint(hintRes);
        etInput.setInputType(EditorInfo.TYPE_CLASS_NUMBER);
        etInput.setFilters(new InputFilter[]{new InputFilter.LengthFilter(maxLength)});

        new Ai50DialogHelper.Builder(this)
                .setTitle(titleRes)
                .setContentView(view)
                .setOnConfirm(d -> {
                    int value = parseIntOrDefault(etInput.getText().toString().trim(), 0);
                    callback.onSubmit(value);
                    return true;
                })
                .show();
    }

    private void showPrintImageDialog(int titleRes, View view, Ai50DialogHelper.ConfirmListener onConfirm) {
        new Ai50DialogHelper.Builder(this)
                .setTitle(titleRes)
                .setSubtitle(R.string.print_dialog_subtitle)
                .setContentView(view)
                .setOnConfirm(onConfirm)
                .show();
    }

    private void setupDialogSelectPhoto(View view, final Uri[] imageHolder) {
        TextView tvPhotoPath = view.findViewById(R.id.tv_photo_path);
        view.findViewById(R.id.llayout_select_photo).setOnClickListener(v ->
                toSelectImage(uri -> {
                    imageHolder[0] = uri;
                    if (uri != null) {
                        tvPhotoPath.setText(getString(R.string.print_dialog_image_path, uri.getPath()));
                    }
                })
        );
    }

    private static int parseIntOrDefault(String text, int defaultValue) {
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    @Override
    public void onLabelPaperError() {
        showToast(getString(R.string.label_paper_error));
    }
    
    private static @NonNull ActivityResultContract<Intent, ActivityResult> getSelectImageContract() {
        return new ActivityResultContract<Intent, ActivityResult>() {
            @NonNull
            @Override
            public Intent createIntent(@NonNull Context context, Intent input) {
                return input;
            }

            @Override
            public ActivityResult parseResult(int resultCode, @Nullable Intent intent) {
                return new ActivityResult(resultCode, intent);
            }
        };
    }

    private void setupEdgeToEdge() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(ContextCompat.getColor(this, R.color.ai50_background));
        window.setNavigationBarColor(ContextCompat.getColor(this, R.color.white));

        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);
        }
    }

    private void applySystemBarInsets() {
        View content = findViewById(R.id.layout_content);
        View bottomBar = findViewById(R.id.layout_bottom_bar);

        final int contentPaddingLeft = content.getPaddingLeft();
        final int contentPaddingTop = content.getPaddingTop();
        final int contentPaddingRight = content.getPaddingRight();
        final int contentPaddingBottom = content.getPaddingBottom();

        final int bottomPaddingLeft = bottomBar.getPaddingLeft();
        final int bottomPaddingTop = bottomBar.getPaddingTop();
        final int bottomPaddingRight = bottomBar.getPaddingRight();
        final int bottomPaddingBottom = bottomBar.getPaddingBottom();

        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            int left = Math.max(statusBars.left, cutout.left);
            int top = Math.max(statusBars.top, cutout.top);
            int right = Math.max(statusBars.right, cutout.right);
            v.setPadding(
                    contentPaddingLeft + left,
                    contentPaddingTop + top,
                    contentPaddingRight + right,
                    contentPaddingBottom
            );
            return insets;
        });

        ViewCompat.setOnApplyWindowInsetsListener(bottomBar, (v, insets) -> {
            Insets navBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            int left = Math.max(navBars.left, cutout.left);
            int right = Math.max(navBars.right, cutout.right);
            int bottom = Math.max(navBars.bottom, cutout.bottom);
            v.setPadding(
                    bottomPaddingLeft + left,
                    bottomPaddingTop,
                    bottomPaddingRight + right,
                    bottomPaddingBottom + bottom
            );
            return insets;
        });

        ViewCompat.requestApplyInsets(content);
        ViewCompat.requestApplyInsets(bottomBar);
    }
}
