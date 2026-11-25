from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src" / "i18n" / "nan-TW.ts"
text = p.read_text(encoding="utf-8")
text = text.replace("export const zhTW =", "export const nanTW =", 1)
repls = [
    ("// Every piece of text the app shows in 繁體中文", "// 閩南語（台語漢字口語）介面文字"),
    ('htmlLang: "zh-Hant"', 'htmlLang: "nan-TW"'),
    ('documentTitle: "水啦 SuiLa｜每日喝水提醒"', 'documentTitle: "水啦 SuiLa｜逐工飲水提醒"'),
    ('aria: "水啦 SuiLa 首頁"', 'aria: "水啦 SuiLa 頭頁"'),
    ('water: "喝水"', 'water: "飲水"'),
    ('family: "家人"', 'family: "厝邊家人"'),
    ('save: "儲存"', 'save: "保存"'),
    ('back: "返回"', 'back: "轉去"'),
    ('on: "已開啟"', 'on: "有開"'),
    ('off: "已關閉"', 'off: "關起來"'),
    ('loadFailed: "連線失敗，請再試一次。"', 'loadFailed: "連線失敗，請閣試看覓。"'),
    ('retry: "再試一次"', 'retry: "閣試看覓"'),
    ('actionFailed: "沒有成功，請再試一次"', 'actionFailed: "無成功，請閣試看覓"'),
    ('unsaved: "還沒有儲存，要離開嗎？"', 'unsaved: "猶未保存，欲離開嗎？"'),
    ('stay: "留下"', 'stay: "閣佇這"'),
    ('language: "語言"', 'language: "話語"'),
    ('nightMute: "夜間靜音"', 'nightMute: "暗暝靜音"'),
    ('device: "底座裝置"', 'device: "底座"'),
    ('about: "關於我們"', 'about: "關於阮"'),
    ('proSubtitle: "解鎖習慣分析、連結更多家人"', 'proSubtitle: "開習慣分析、閣加家人"'),
    ('goalLabel: "每日喝水目標"', 'goalLabel: "逐工飲水目標"'),
    ('noTimes: "還沒有提醒時間"', 'noTimes: "猶未設定提醒時間"'),
    ('add: "新增時間"', 'add: "加時間"'),
    ('title: "夜間靜音"', 'title: "暗暝靜音"'),
    ('enable: "夜間靜音"', 'enable: "暗暝靜音"'),
    ('name: "姓名"', 'name: "名"'),
    ('namePlaceholder: "請輸入姓名"', 'namePlaceholder: "請輸入名"'),
    ('height: "身高（公分）"', 'height: "身長（公分）"'),
    ('conditions: "慢性病或健康狀況"', 'conditions: "慢性病抑是健康狀況"'),
    ('choose: "請選擇"', 'choose: "請選"'),
    ('savedToast: "已儲存基本資料"', 'savedToast: "基本資料有保存矣"'),
    ('addMember: "新增家人"', 'addMember: "加人"'),
    ('noMembers: "還沒有家人"', 'noMembers: "猶未有家人"'),
    ('remove: "刪除"', 'remove: "刪掉"'),
    ('memberName: "姓名"', 'memberName: "名"'),
    ('memberNamePlaceholder: "請輸入家人姓名"', 'memberNamePlaceholder: "請輸入家人名"'),
    ('bandNotConnected: "還沒有連結 LINE"', 'bandNotConnected: "猶未連結 LINE"'),
    ('listTitle: "已連結的家人"', 'listTitle: "已經連結的家人"'),
    ('connectedToast: "已連結 LINE"', 'connectedToast: "有連結 LINE 矣"'),
    (
        "連結 LINE 後，家人可以看到你的喝水進度，也可以傳語音留言給你。",
        "連結 LINE 了後，家人會當看你飲水進度，嘛會當傳語音予你。",
    ),
    ('none: "無特殊狀況"', 'none: "無特別狀況"'),
]
for a, b in repls:
    text = text.replace(a, b)
p.write_text(text, encoding="utf-8")
print("ok", "nanTW" in text)
