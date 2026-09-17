package com.luckprinter.demo.bean;

/**
 * @author huangxiaohui
 * @date 2023/4/12
 */
public class ButtonItem {
    private String name;
    private String tag;

    public ButtonItem(String tag, String name) {
        this.tag = tag;
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getTag() {
        return tag;
    }

    public void setTag(String tag) {
        this.tag = tag;
    }
}
