package com.luckprinter.demo;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.luckjingle.printersdk.R;
import com.luckprinter.sdk_new.device.BaseDevice;
import com.luckprinter.sdk_new.device.PrinterHelper;

import java.util.List;

public class Ai50DeviceAdapter extends RecyclerView.Adapter<Ai50DeviceAdapter.Holder> {

    public interface ItemClickListener {
        void onItemClick(DeviceItem device);
    }

    private final List<DeviceItem> deviceList;
    private ItemClickListener itemClickListener;

    public Ai50DeviceAdapter(List<DeviceItem> deviceList) {
        this.deviceList = deviceList;
    }

    public void setItemClickListener(ItemClickListener itemClickListener) {
        this.itemClickListener = itemClickListener;
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_ai50_device, parent, false);
        return new Holder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        DeviceItem item = deviceList.get(position);
        holder.bind(item);
        holder.itemView.setOnClickListener(v -> {
            if (itemClickListener != null) {
                itemClickListener.onItemClick(item);
            }
        });
    }

    @Override
    public int getItemCount() {
        return deviceList.size();
    }

    static class Holder extends RecyclerView.ViewHolder {
        private final TextView tvName;
        private final TextView tvMac;
        private final View connectedDot;

        Holder(@NonNull View itemView) {
            super(itemView);
            tvName = itemView.findViewById(R.id.tv_name);
            tvMac = itemView.findViewById(R.id.tv_mac);
            connectedDot = itemView.findViewById(R.id.view_connected_dot);
        }

        void bind(DeviceItem item) {
            tvName.setText(item.getName());
            tvMac.setText(item.getMac());

            BaseDevice device = PrinterHelper.getInstance().getPrinterDevice();
            String connectedMac = device != null ? device.getDeviceMac() : null;
            boolean isConnected = PrinterHelper.getInstance().isConnectedLuck()
                    && item.getMac() != null
                    && item.getMac().equals(connectedMac);

            connectedDot.setVisibility(isConnected ? View.VISIBLE : View.INVISIBLE);

            itemView.setBackgroundResource(isConnected
                    ? R.drawable.bg_ai50_device_item_selected
                    : R.drawable.bg_ai50_device_item);
        }
    }
}
