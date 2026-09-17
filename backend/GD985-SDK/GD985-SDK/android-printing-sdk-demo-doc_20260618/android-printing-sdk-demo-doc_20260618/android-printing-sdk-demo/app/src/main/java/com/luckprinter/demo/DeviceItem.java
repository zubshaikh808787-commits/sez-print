package com.luckprinter.demo;

import java.util.Objects;

public class DeviceItem {
    private int type;
    private String name;
    private String mac;

    public DeviceItem() {
    }

    public DeviceItem(int type, String name, String mac) {
        this.type = type;
        this.name = name;
        this.mac = mac;
    }

    public int getType() {
        return type;
    }

    public void setType(int type) {
        this.type = type;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getMac() {
        return mac;
    }

    public void setMac(String mac) {
        this.mac = mac;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof DeviceItem)) return false;
        DeviceItem that = (DeviceItem) o;
        return Objects.equals(getName(), that.getName()) && Objects.equals(getMac(), that.getMac());
    }

    @Override
    public int hashCode() {
        return Objects.hash(getName(), getMac());
    }
}
