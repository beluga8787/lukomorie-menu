import os
import json

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')

DEFAULT_CONFIG = {
    "telegram_bot_token": "YOUR_TELEGRAM_BOT_TOKEN_HERE",
    "telegram_chat_id": "YOUR_TELEGRAM_GROUP_CHAT_ID_HERE",
    "timezone_offset_hours": 3,
    "wifi_names": ["Лукоморие", "Лукоморие_5G"],
    "enforce_wifi_modal": False,
    "port": 8000,
    "host": "0.0.0.0"
}

def load_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_CONFIG, f, ensure_ascii=False, indent=4)
        return DEFAULT_CONFIG
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            merged = DEFAULT_CONFIG.copy()
            merged.update(data)
            return merged
    except Exception as e:
        print(f"Error loading config.json: {e}")
        return DEFAULT_CONFIG

def save_config(new_config):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_config, f, ensure_ascii=False, indent=4)
