package com.luckprinter.demo;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.luckjingle.printersdk.R;

public class PrinterHomeActivity extends AppCompatActivity {

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupEdgeToEdge();
        setContentView(R.layout.activity_printer_home);
        applySystemBarInsets();

        findViewById(R.id.card_bluetooth).setOnClickListener(v ->
                startActivity(new Intent(this, LuckPrinterSdkDemoActivity.class)));
        findViewById(R.id.card_wifi).setOnClickListener(v ->
                startActivity(new Intent(this, Ai50PrinterActivity.class)));
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
        final int paddingLeft = content.getPaddingLeft();
        final int paddingTop = content.getPaddingTop();
        final int paddingRight = content.getPaddingRight();
        final int paddingBottom = content.getPaddingBottom();

        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            Insets navBars = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
            Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            int left = Math.max(Math.max(statusBars.left, navBars.left), cutout.left);
            int top = Math.max(statusBars.top, cutout.top);
            int right = Math.max(Math.max(statusBars.right, navBars.right), cutout.right);
            int bottom = Math.max(navBars.bottom, cutout.bottom);
            v.setPadding(
                    paddingLeft + left,
                    paddingTop + top,
                    paddingRight + right,
                    paddingBottom + bottom
            );
            return insets;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
