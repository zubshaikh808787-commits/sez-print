package com.luckprinter.demo;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothDevice;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.InputFilter;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.Window;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
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
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.luckjingle.printersdk.R;
import com.luckprinter.demo.dialog.Ai50DialogHelper;
import com.luckprinter.demo.dialog.Ai50PrintContinuousDialog;
import com.luckprinter.demo.dialog.ISelectImage;
import com.luckprinter.demo.repository.CustomPrinterData;
import com.luckprinter.sdk_new.BtReceiver;
import com.luckprinter.sdk_new.PrinterStatus;
import com.luckprinter.sdk_new.PrinterUtil;
import com.luckprinter.sdk_new.bean.PrinterStatusData;
import com.luckprinter.sdk_new.bean.VolumeBean;
import com.luckprinter.sdk_new.callback.OnClientConnectionListener;
import com.luckprinter.sdk_new.callback.OnEventListener;
import com.luckprinter.sdk_new.callback.OnPrintCallback;
import com.luckprinter.sdk_new.callback.OnPrinterInfoCallback;
import com.luckprinter.sdk_new.callback.OnReceiveDeviceStatusListener;
import com.luckprinter.sdk_new.callback.ResultCallback;
import com.luckprinter.sdk_new.callback.UpdateListener;
import com.luckprinter.sdk_new.device.BaseDevice;
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
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.Executors;

public class Ai50PrinterActivity extends AppCompatActivity
        implements OnClientConnectionListener, OnReceiveDeviceStatusListener, OnEventListener,
        com.luckprinter.demo.dialog.ImageSelectHost {

    private static final String AI50_PREFIX = "AI50_";
    private static final int REQCODE_PERMISSION = 20001;

    private ClassicScanDeviceHelper scanDeviceHelper;
    private final List<DeviceItem> deviceList = new ArrayList<>();
    private Ai50DeviceAdapter deviceAdapter;

    private RecyclerView rvDeviceList;
    private RecyclerView rvActions;
    private ProgressBar pbDiscovery;
    private TextView tvMessage;
    private TextView tvNoDevice;

    private String[] needPermissions;
    private final HashMap<String, String> testFirmwareConfig = new HashMap<>();
    private ActivityResultLauncher<Intent> selectImageLauncher;
    private ISelectImage selectImageCallback;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupEdgeToEdge();
        setContentView(R.layout.activity_ai50_printer);
        applySystemBarInsets();

        rvDeviceList = findViewById(R.id.rv_device_list);
        rvActions = findViewById(R.id.rv_actions);
        pbDiscovery = findViewById(R.id.pb_discovery);
        tvMessage = findViewById(R.id.tv_message);
        tvNoDevice = findViewById(R.id.tv_no_device);

        findViewById(R.id.btn_unpair).setOnClickListener(v -> startActivity(new Intent(this, BluetoothActivity.class)));
        findViewById(R.id.btn_upgrade).setOnClickListener(v -> startFirmwareUpdate());

        initActions();
        initScanHelper();
        initCustomPrinterInfo();
        initPermissions();
        registerSdkListeners();

        if (isBluePermissionGranted()) {
            initDeviceList();
            startScan();
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            requestPermissions(needPermissions, REQCODE_PERMISSION);
        }

        selectImageLauncher = registerForActivityResult(getSelectFileContract(), result -> {
            if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                Uri imageUri = result.getData().getData();
                if (selectImageCallback != null && imageUri != null) {
                    selectImageCallback.onSelectImage(imageUri);
                }
            }
        });
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

    @Override
    public void toSelectImage(ISelectImage callback) {
        selectImageCallback = callback;
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        } else {
            intent = new Intent(Intent.ACTION_GET_CONTENT);
        }
        intent.setType("image/*");
        selectImageLauncher.launch(intent);
    }

    private void initActions() {
        List<Ai50MenuTypeEnum> actions = Arrays.asList(Ai50MenuTypeEnum.values());
        rvActions.setLayoutManager(new GridLayoutManager(this, 2));
        Ai50ActionAdapter adapter = new Ai50ActionAdapter(actions);
        adapter.setItemClickListener(this::handleAction);
        rvActions.setAdapter(adapter);
    }

    private void initScanHelper() {
        scanDeviceHelper = new ClassicScanDeviceHelper(this);
        scanDeviceHelper.setScanDeviceListener(new BtReceiver.Listener() {
            @Override
            public void foundDev(int type, String name, String mac) {
                if (name == null || !name.startsWith(AI50_PREFIX)) {
                    return;
                }
                DeviceItem item = new DeviceItem(type, name, mac);
                if (!deviceList.contains(item)) {
                    deviceList.add(item);
                    if (deviceAdapter != null) {
                        deviceAdapter.notifyDataSetChanged();
                    }
                    refreshEmptyDeviceView();
                }
            }

            @Override
            public void startDiscovery() {
                pbDiscovery.setVisibility(View.VISIBLE);
            }

            @Override
            public void finishDiscovery() {
                pbDiscovery.setVisibility(View.GONE);
            }
        });
        scanDeviceHelper.init();
    }

    private void initCustomPrinterInfo() {
        HashMap<String, PrinterProperty> customPropertyMap =
                CustomPrinterData.getInstance().getCustomPropertyMap();
        PrinterHelper.getInstance().setCustomPropertyMap(customPropertyMap);
    }

    private void initPermissions() {
        List<String> permissions = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
            permissions.add(Manifest.permission.BLUETOOTH_SCAN);
        } else {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        needPermissions = permissions.toArray(new String[0]);
    }

    private void registerSdkListeners() {
        PrinterHelper helper = PrinterHelper.getInstance();
        helper.addConnectListener(this);
        helper.addDeviceStatusListener(this);
        helper.addEventListener(this);
        helper.addDeviceForbiddenListener(() -> showToast(R.string.device_forbidden));
    }

    private void initDeviceList() {
        rvDeviceList.setLayoutManager(new GridLayoutManager(this, 2));
        deviceAdapter = new Ai50DeviceAdapter(deviceList);
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
            setMessage(R.string.status_connecting);
            Executors.newCachedThreadPool().execute(() -> {
                boolean result = helper.connectLuck(device.getName(), device.getMac(), device.getType());
                if (result) {
                    applyCustomPrinterProperty();
                }
                BaseDevice printerDevice = helper.getPrinterDevice();
                String className = printerDevice != null ? printerDevice.getClass().getSimpleName() : "";
                if (result) {
                    setMessage(getString(R.string.status_connected, className));
                } else {
                    setMessage(getString(R.string.status_connect_fail));
                }
                runOnUiThread(() -> {
                    if (deviceAdapter != null) {
                        deviceAdapter.notifyDataSetChanged();
                    }
                });
            });
        });
        rvDeviceList.setAdapter(deviceAdapter);
        refreshEmptyDeviceView();
    }

    private void applyCustomPrinterProperty() {
        BaseDevice device = PrinterHelper.getInstance().getPrinterDevice();
        if (device instanceof ICustomPrinter) {
            HashMap<String, PrinterProperty> propertyMap =
                    CustomPrinterData.getInstance().getCustomPropertyMap();
            HashMap<String, PrinterCommand> commandMap =
                    CustomPrinterData.getInstance().getCustomCommandMap();
            String namePrefix = PrinterHelper.getInstance().getNamePrefix();
            ((ICustomPrinter) device).setProperty(propertyMap.get(namePrefix));
            ((ICustomPrinter) device).setCommand(commandMap.get(namePrefix));
        }
    }

    private void handleAction(Ai50MenuTypeEnum action) {
        setMessage("");
        if (action.requiresConnection() && !PrinterHelper.getInstance().isConnectedLuck()) {
            showToast(R.string.status_not_connected);
        }

        switch (action) {
            case SCAN:
                reScan();
                break;
            case DISCONNECT:
                disconnectBluetooth();
                break;
            case PRINT:
                showPrintDialog();
                break;
            case PRINTER_MODEL:
                queryModel();
                break;
            case PRINTER_BOOT:
                queryBoot();
                break;
            case PRINTER_SN:
                querySn();
                break;
            case GET_ALL_INFO:
                queryAllInfo();
                break;
            case PRINTER_VERSION:
                queryFirmware();
                break;
            case GET_SHUT_TIME:
                queryShutTime();
                break;
            case PRINTER_STATUS:
                queryStatus();
                break;
            case PRINTER_BATTERY:
                queryBattery();
                break;
            case GET_DENSITY:
                queryDensity();
                break;
            case SET_DENSITY:
                showSetDensityDialog();
                break;
            case SET_SHUTTIME:
                showSetShutTimeDialog();
                break;
            case SEND_WIFI:
                showWifiSetupDialog();
                break;
            case GET_WIFI_STATE:
                queryWifiState();
                break;
            case GET_VOLUME:
                queryVolume();
                break;
            case SET_VOLUME:
                showSetVolumeDialog();
                break;
            case RESET_DEVICE:
                resetDevice();
                break;
            case SET_LANGUAGE:
                showSetLanguageDialog();
                break;
            default:
                break;
        }
    }

    private void showPrintDialog() {
        if (!ensureConnected()) {
            return;
        }
        Ai50PrintContinuousDialog dialog = new Ai50PrintContinuousDialog(this);
        dialog.setCallback(this::printContinuous);
        dialog.show();
    }

    private void printContinuous(Bitmap bitmap, int count, Integer widthMM) {
        Integer requireWidth = null;
        if (widthMM != null) {
            widthMM = Math.max(widthMM, 10);
            requireWidth = (PrinterHelper.getInstance().is304Dpi() ? 12 : 8) * widthMM;
        }

        int printWidth = PrinterHelper.getInstance().getPrintWidth();
        if (requireWidth != null) {
            printWidth = Math.min(printWidth, requireWidth);
        }

        float scale = printWidth * 1.0f / bitmap.getWidth();
        int printHeight = (int) (scale * bitmap.getHeight());
        Bitmap resized = Bitmap.createScaledBitmap(bitmap, printWidth, printHeight, true);
        if (bitmap != resized) {
            bitmap.recycle();
        }
        Bitmap processed = OpenCVUtils.getInstance().getFlyodBitmapNew(resized);

        OnPrintCallback callback = new OnPrintCallback() {
            @Override
            public void onStartPrint() {
                showToast(R.string.print_start);
            }

            @Override
            public void onPrinting(int page, int num) {
                showToast(getString(R.string.print_progress, page, num));
            }

            @Override
            public void onPrintIndexStart(Bitmap bmp, int page, int num) {
            }

            @Override
            public void onPrintIndexEnd(Bitmap bmp, int page, int num) {
            }

            @Override
            public void onPrintSuccess() {
                showToast(R.string.print_success);
            }

            @Override
            public void onPrintFail(int status) {
                showPrintStatusToast(status);
            }
        };
        PrinterHelper.getInstance().print(processed, count, callback);
    }

    private void queryModel() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().printerModelLuck(new ResultCallback<String>() {
            @Override
            public void onSuccess(String data) {
                setMessage(getString(R.string.result_model, data));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_model_fail));
            }
        });
    }

    private void queryBoot() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().printerBootLuck(new ResultCallback<String>() {
            @Override
            public void onSuccess(String data) {
                setMessage(getString(R.string.result_boot, data));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_boot_fail));
            }
        });
    }

    private void querySn() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().printerSNLuck(new ResultCallback<String>() {
            @Override
            public void onSuccess(String data) {
                setMessage(getString(R.string.result_sn, data));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_sn_fail));
            }
        });
    }

    private void queryFirmware() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().printerVersionLuck(new ResultCallback<String>() {
            @Override
            public void onSuccess(String data) {
                setMessage(getString(R.string.result_firmware, data));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_firmware_fail));
            }
        });
    }

    private void queryShutTime() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().getShutTimeLuck(new ResultCallback<Integer>() {
            @Override
            public void onSuccess(Integer data) {
                setMessage(getString(R.string.result_shut_time, data));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_shut_time_fail));
            }
        });
    }

    private void queryStatus() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().getPrinterStatus(new ResultCallback<PrinterStatusData>() {
            @Override
            public void onSuccess(PrinterStatusData data) {
                setMessage(getString(R.string.result_status,
                        data.getIsPrinting(), data.getIsOpen(), data.getIsLackPaper(),
                        data.getIsLackElec(), data.getIsOverheat()));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_status_fail));
            }
        });
    }

    private void queryBattery() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().getBatteryLuck(new ResultCallback<Integer>() {
            @Override
            public void onSuccess(Integer data) {
                setMessage(getString(R.string.result_battery, data));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_battery_fail));
            }
        });
    }

    private void queryDensity() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().getDensityLuck(new ResultCallback<Integer>() {
            @Override
            public void onSuccess(Integer data) {
                setMessage(getString(R.string.result_density, data));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_density_fail));
            }
        });
    }

    private void queryAllInfo() {
        if (!ensureConnected()) {
            return;
        }
        PrinterHelper.getInstance().getAllInfo(new OnPrinterInfoCallback() {
            private String version;
            private String name;
            private String mac;
            private String sn;
            private String model;
            private String battery;
            private int shutTime;
            private int density;

            @Override
            public void onStart() {
            }

            @Override
            public void onVersion(String ver) {
                version = ver;
            }

            @Override
            public void onName(String value) {
                name = value;
            }

            @Override
            public void onMac(String value) {
                mac = value;
            }

            @Override
            public void onSn(String value) {
                sn = value;
            }

            @Override
            public void onModel(String value) {
                model = value;
            }

            @Override
            public void onBattery(String value) {
                battery = value;
            }

            @Override
            public void onShutTime(int value) {
                shutTime = value;
            }

            @Override
            public void onDensity(int value) {
                density = value;
            }

            @Override
            public void onFinish() {
                setMessage(getString(R.string.result_all_info,
                        safe(version), safe(name), safe(mac), safe(sn),
                        safe(model), safe(battery), shutTime, density));
            }
        });
    }

    private void showSetDensityDialog() {
        if (!ensureConnected()) {
            return;
        }
        List<Integer> densityList = PrinterHelper.getInstance().getDensityList();
        if (densityList == null || densityList.isEmpty()) {
            showToast(R.string.dialog_density_empty);
            return;
        }
        PrinterHelper.getInstance().getDensityLuck(new ResultCallback<Integer>() {
            @Override
            public void onSuccess(Integer currentDensity) {
                showDensitySelectionDialog(densityList, currentDensity);
            }

            @Override
            public void onFail() {
                showDensitySelectionDialog(densityList, null);
            }
        });
    }

    private void showDensitySelectionDialog(List<Integer> densityList, Integer currentDensity) {
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_ai50_density, null);
        TextView tvHint = view.findViewById(R.id.tv_density_hint);
        RadioGroup rgDensity = view.findViewById(R.id.rg_density);
        tvHint.setText(getString(R.string.dialog_density_hint_range, formatDensityRange(densityList)));

        int checkedButtonId = View.NO_ID;
        for (int density : densityList) {
            RadioButton radioButton = new RadioButton(this);
            int buttonId = View.generateViewId();
            radioButton.setId(buttonId);
            radioButton.setText(getString(R.string.dialog_density_option, density));
            radioButton.setTag(density);
            radioButton.setTextColor(getColor(R.color.ai50_text_primary));
            radioButton.setTextSize(15);
            radioButton.setButtonTintList(ColorStateList.valueOf(getColor(R.color.ai50_primary)));
            radioButton.setPadding(0, PrinterUtil.dp2px(8), 0, PrinterUtil.dp2px(8));
            rgDensity.addView(radioButton);
            if (currentDensity != null && currentDensity.equals(density)) {
                checkedButtonId = buttonId;
            }
        }
        if (checkedButtonId != View.NO_ID) {
            rgDensity.check(checkedButtonId);
        } else if (rgDensity.getChildCount() > 0) {
            rgDensity.check(rgDensity.getChildAt(0).getId());
        }

        new Ai50DialogHelper.Builder(this)
                .setTitle(R.string.dialog_density_title)
                .setContentView(view)
                .setOnConfirm(d -> {
                    int selectedId = rgDensity.getCheckedRadioButtonId();
                    if (selectedId == View.NO_ID) {
                        showToast(R.string.dialog_density_empty);
                        return false;
                    }
                    RadioButton selected = rgDensity.findViewById(selectedId);
                    int value = (int) selected.getTag();
                    PrinterHelper.getInstance().setDensityLuck(value, new ResultCallback<Integer>() {
                        @Override
                        public void onSuccess(Integer data) {
                            setMessage(getString(R.string.result_density_set_ok));
                        }

                        @Override
                        public void onFail() {
                            setMessage(getString(R.string.result_density_set_fail));
                        }
                    });
                    return true;
                })
                .show();
    }

    private String formatDensityRange(List<Integer> densityList) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < densityList.size(); i++) {
            if (i > 0) {
                builder.append(" / ");
            }
            builder.append(densityList.get(i));
        }
        return builder.toString();
    }

    private void showSetShutTimeDialog() {
        if (!ensureConnected()) {
            return;
        }
        showNumberInputDialog(R.string.dialog_shut_time_title, R.string.dialog_shut_time_hint, 3,
                value -> {
                    if (value < 0) {
                        value = 0;
                    }
                    int finalValue = value;
                    PrinterHelper.getInstance().setShutTimeLuck(finalValue, new ResultCallback<Integer>() {
                        @Override
                        public void onSuccess(Integer data) {
                            setMessage(getString(R.string.result_shut_time_set_ok));
                        }

                        @Override
                        public void onFail() {
                            setMessage(getString(R.string.result_shut_time_set_fail));
                        }
                    });
                });
    }

    private void showWifiSetupDialog() {
        if (!ensureAi50()) {
            return;
        }
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_ai50_wifi, null);
        EditText etAccount = view.findViewById(R.id.et_account);
        EditText etPassword = view.findViewById(R.id.et_password);

        new Ai50DialogHelper.Builder(this)
                .setTitle(R.string.dialog_wifi_title)
                .setSubtitle(R.string.dialog_wifi_subtitle)
                .setContentView(view)
                .setOnConfirm(d -> {
                    String ssid = etAccount.getText().toString().trim();
                    String pwd = etPassword.getText().toString();
                    if (TextUtils.isEmpty(ssid)) {
                        showToast(R.string.error_wifi_ssid_empty);
                        return false;
                    }
                    if (TextUtils.isEmpty(pwd)) {
                        showToast(R.string.error_wifi_pwd_empty);
                        return false;
                    }
                    PrinterHelper.getInstance().sendWifiAccountPassword(ssid, pwd, new ResultCallback<Integer>() {
                        @Override
                        public void onSuccess(Integer data) {
                            setMessage(getString(R.string.result_wifi_send_ok));
                        }

                        @Override
                        public void onFail() {
                            setMessage(getString(R.string.result_wifi_send_fail));
                        }
                    });
                    return true;
                })
                .show();
    }

    private void queryWifiState() {
        if (!ensureAi50()) {
            return;
        }
        PrinterHelper.getInstance().getWifiState(new ResultCallback<Integer>() {
            @Override
            public void onSuccess(Integer data) {
                setMessage(formatWifiState(data));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.wifi_state_query_fail));
            }
        });
    }

    private void queryVolume() {
        if (!ensureAi50()) {
            return;
        }
        PrinterHelper.getInstance().getDeviceVolume(new ResultCallback<VolumeBean>() {
            @Override
            public void onSuccess(VolumeBean data) {
                setMessage(getString(R.string.result_volume, data.getVolume(), data.getMaxVolume()));
            }

            @Override
            public void onFail() {
                setMessage(getString(R.string.result_volume_fail));
            }
        });
    }

    private void showSetVolumeDialog() {
        if (!ensureAi50()) {
            return;
        }
        showNumberInputDialog(R.string.dialog_volume_title, R.string.dialog_volume_hint, 3,
                value -> PrinterHelper.getInstance().setDeviceVolume(value, new ResultCallback<Integer>() {
                    @Override
                    public void onSuccess(Integer data) {
                        setMessage(getString(R.string.result_volume_set_ok));
                    }

                    @Override
                    public void onFail() {
                        setMessage(getString(R.string.result_volume_set_fail));
                    }
                }));
    }

    private void showSetLanguageDialog() {
        if (!ensureAi50()) {
            return;
        }
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_ai50_language, null);
        EditText etLanguage = view.findViewById(R.id.et_language);

        new Ai50DialogHelper.Builder(this)
                .setTitle(R.string.dialog_language_title)
                .setSubtitle(R.string.dialog_language_subtitle)
                .setContentView(view)
                .setOnConfirm(d -> {
                    String language = etLanguage.getText().toString().trim();
                    if (TextUtils.isEmpty(language)) {
                        showToast(R.string.error_language_empty);
                        return false;
                    }
                    PrinterHelper.getInstance().setPrinterLanguage(language, new ResultCallback<Integer>() {
                        @Override
                        public void onSuccess(Integer data) {
                            setMessage(getString(R.string.result_language_set_ok));
                        }

                        @Override
                        public void onFail() {
                            setMessage(getString(R.string.result_language_set_fail));
                        }
                    });
                    return true;
                })
                .show();
    }

    private void resetDevice() {
        if (!ensureAi50()) {
            return;
        }
        View view = LayoutInflater.from(this).inflate(R.layout.dialog_ai50_confirm, null);
        TextView tvMessage = view.findViewById(R.id.tv_confirm_message);
        tvMessage.setText(R.string.action_factory_reset_confirm);

        new Ai50DialogHelper.Builder(this)
                .setTitle(R.string.dialog_factory_reset_title)
                .setSubtitle(R.string.dialog_factory_reset_subtitle)
                .setContentView(view)
                .setOnConfirm(d -> {
                    PrinterHelper.getInstance().resetDevice();
                    setMessage(getString(R.string.result_factory_reset_ok));
                    return true;
                })
                .show();
    }

    private void disconnectBluetooth() {
        PrinterHelper helper = PrinterHelper.getInstance();
        if (!helper.isConnectedLuck()) {
            showToast(R.string.status_not_connected);
            return;
        }
        Executors.newCachedThreadPool().execute(() -> {
            boolean success = helper.disconnectLuck();
            runOnUiThread(() -> {
                if (success) {
                    setMessage(getString(R.string.status_disconnected));
                } else {
                    setMessage(getString(R.string.status_disconnect_fail));
                }
                if (deviceAdapter != null) {
                    deviceAdapter.notifyDataSetChanged();
                }
            });
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
                    int value = 0;
                    try {
                        value = Integer.parseInt(etInput.getText().toString().trim());
                    } catch (NumberFormatException ignored) {
                    }
                    callback.onSubmit(value);
                    return true;
                })
                .show();
    }

    private void startFirmwareUpdate() {
        if (!ensureConnected()) {
            showToast(R.string.error_upgrade_not_connected);
            return;
        }
        String namePrefix = PrinterHelper.getInstance().getNamePrefix();
        String assetsFileName = testFirmwareConfig.get(namePrefix);
        if (TextUtils.isEmpty(assetsFileName)) {
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.setType("*/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            updateFileLauncher.launch(intent);
        } else {
            String outFile = getFilesDir() + "/" + assetsFileName;
            if (!new File(outFile).exists() && !copyAssetToInternalStorage(assetsFileName, outFile)) {
                showToast(R.string.error_firmware_copy);
                return;
            }
            doUpdate(outFile);
        }
    }

    private final ActivityResultLauncher<Intent> updateFileLauncher =
            registerForActivityResult(getSelectFileContract(), result -> {
                if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
                    return;
                }
                if (!PrinterHelper.getInstance().isConnectedLuck()) {
                    showToast(R.string.error_upgrade_not_connected);
                    return;
                }
                Uri uri = result.getData().getData();
                String filePath = FileUriUtils.getFileAbsolutePath(this, uri);
                if (filePath != null
                        && (filePath.toUpperCase().endsWith(".BIN")
                        || filePath.toUpperCase().endsWith(".PRTU"))) {
                    doUpdate(filePath);
                } else {
                    showToast(R.string.error_upgrade_file);
                }
            });

    private void doUpdate(String filePath) {
        PrinterHelper.getInstance().updatePrinterLuck(new File(filePath), new UpdateListener() {
            @Override
            public void onStart() {
                setMessage(getString(R.string.result_upgrade_start));
            }

            @Override
            public void onProgress(int progress) {
                setMessage(getString(R.string.result_upgrade_progress, progress));
            }

            @Override
            public void onError() {
                setMessage(getString(R.string.result_upgrade_error));
            }

            @Override
            public void onComplete() {
                setMessage(getString(R.string.result_upgrade_done));
            }
        });
    }

    private boolean copyAssetToInternalStorage(String assetFileName, String outFile) {
        AssetManager assetManager = getAssets();
        try (InputStream in = assetManager.open(assetFileName);
             OutputStream out = new FileOutputStream(outFile)) {
            byte[] buffer = new byte[1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return true;
        } catch (IOException e) {
            File file = new File(outFile);
            if (file.exists()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
            return false;
        }
    }

    private void reScan() {
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
            if (mac.equals(item.getMac())) {
                return item;
            }
        }
        String name = device.getDeviceName();
        if (TextUtils.isEmpty(name)) {
            return null;
        }
        return new DeviceItem(BluetoothDevice.DEVICE_TYPE_DUAL, name, mac);
    }

    private void startScan() {
        if (!checkLocationEnable()) {
            showToast(R.string.location_off);
            return;
        }
        if (scanDeviceHelper != null) {
            scanDeviceHelper.startScanDevice();
        }
    }

    private boolean checkLocationEnable() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return true;
        }
        try {
            int locationMode = Settings.Secure.getInt(
                    getContentResolver(), Settings.Secure.LOCATION_MODE);
            return locationMode != Settings.Secure.LOCATION_MODE_OFF;
        } catch (Settings.SettingNotFoundException e) {
            return false;
        }
    }

    private boolean isBluePermissionGranted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }
        for (String permission : needPermissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private boolean ensureConnected() {
        if (PrinterHelper.getInstance().isConnectedLuck()) {
            return true;
        }
        showToast(R.string.status_not_connected);
        return false;
    }

    private boolean ensureAi50() {
        if (!ensureConnected()) {
            return false;
        }
        if (PrinterHelper.getInstance().isAi50WifiPrinter()) {
            return true;
        }
        showToast(R.string.status_not_ai50);
        return false;
    }

    private String formatWifiState(int status) {
        switch (status) {
            case PrinterStatus.WIFI_PRINTER_STATUS_CONNECTING:
                return getString(R.string.wifi_state_connecting);
            case PrinterStatus.WIFI_PRINTER_STATUS_CONNECTED:
                return getString(R.string.wifi_state_connected);
            case PrinterStatus.WIFI_PRINTER_STATUS_PWD_ERROR:
                return getString(R.string.wifi_state_pwd_error);
            case PrinterStatus.WIFI_PRINTER_STATUS_DISCONNECT:
                return getString(R.string.wifi_state_disconnect);
            case PrinterStatus.WIFI_PRINTER_STATUS_NOT_CONNECTED:
                return getString(R.string.wifi_state_not_connected);
            default:
                return getString(R.string.wifi_state_unknown, status);
        }
    }

    private void showPrintStatusToast(int status) {
        switch (status) {
            case PrinterStatus.PRINTER_STATUS_OUTPAPER:
                showToast(R.string.print_status_outpaper);
                break;
            case PrinterStatus.PRINTER_STATUS_OPENCOVER:
                showToast(R.string.print_status_opencover);
                break;
            case PrinterStatus.PRINTER_STATUS_OVERHEAT:
                showToast(R.string.print_status_overheat);
                break;
            case PrinterStatus.PRINTER_STATUS_LOWVAL:
                showToast(R.string.print_status_lowval);
                break;
            default:
                showToast(R.string.print_fail);
                break;
        }
    }

    private void refreshEmptyDeviceView() {
        tvNoDevice.setVisibility(deviceList.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private void setMessage(int resId) {
        setMessage(getString(resId));
    }

    private void setMessage(String message) {
        tvMessage.post(() -> tvMessage.setText(message));
    }

    private void showToast(int resId) {
        Toast.makeText(this, resId, Toast.LENGTH_SHORT).show();
    }

    private void showToast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQCODE_PERMISSION && isBluePermissionGranted()) {
            initDeviceList();
            startScan();
        } else if (requestCode == REQCODE_PERMISSION) {
            showToast(R.string.bluetooth_permission_denied);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (scanDeviceHelper != null) {
            scanDeviceHelper.unInit();
            scanDeviceHelper = null;
        }
        PrinterHelper helper = PrinterHelper.getInstance();
        helper.removeConnectListener(this);
        helper.removeDeviceStatusListener(this);
        helper.removeEventListener(this);
    }

    @Override
    public void onDeviceStatus(int status) {
        if (status >= PrinterStatus.WIFI_PRINTER_STATUS_CONNECTING
                && status <= PrinterStatus.WIFI_PRINTER_STATUS_NOT_CONNECTED) {
            setMessage(formatWifiState(status));
        } else {
            showPrintStatusToast(status);
        }
    }

    @Override
    public void onLuckConnected(String name, String address) {
        setMessage(getString(R.string.status_connected, name));
        ensureConnectedDeviceInList(name, address);
        if (deviceAdapter != null) {
            deviceAdapter.notifyDataSetChanged();
        }
    }

    private void ensureConnectedDeviceInList(String name, String address) {
        if (TextUtils.isEmpty(name) || TextUtils.isEmpty(address) || !name.startsWith(AI50_PREFIX)) {
            return;
        }
        for (DeviceItem item : deviceList) {
            if (address.equals(item.getMac())) {
                return;
            }
        }
        deviceList.add(new DeviceItem(BluetoothDevice.DEVICE_TYPE_DUAL, name, address));
        refreshEmptyDeviceView();
    }

    @Override
    public void onLuckDisConnected() {
        setMessage(getString(R.string.status_disconnected));
        if (deviceAdapter != null) {
            deviceAdapter.notifyDataSetChanged();
        }
    }

    @Override
    public void onLabelPaperError() {
        showToast(R.string.label_paper_error);
    }

    private static @NonNull ActivityResultContract<Intent, ActivityResult> getSelectFileContract() {
        return new ActivityResultContract<Intent, ActivityResult>() {
            @NonNull
            @Override
            public Intent createIntent(@NonNull android.content.Context context, Intent input) {
                return input;
            }

            @Override
            public ActivityResult parseResult(int resultCode, @Nullable Intent intent) {
                return new ActivityResult(resultCode, intent);
            }
        };
    }
}
