import os
import sys
import json
import time
import requests
from datetime import datetime

# Safe console output for Windows cp1251/866
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ORDERS_LOG = os.path.join(BASE_DIR, 'orders.jsonl')

CATEGORY_NAMES = {
    'meat': '🥩 Мясное',
    'fish': '🐟 Рыбное',
    'other': '🥗 Прочее'
}

def format_dish_name(raw_name: str) -> str:
    """Format file stem into clean dish name, e.g. Стейк_Рибай -> Стейк Рибай"""
    name = os.path.splitext(raw_name)[0]
    name = name.replace('_', ' ').replace('-', ' ').strip()
    return name

def log_order_locally(order_data: dict):
    """Save order to disk in case Telegram is unavailable or not yet configured."""
    try:
        with open(ORDERS_LOG, 'a', encoding='utf-8') as f:
            f.write(json.dumps(order_data, ensure_ascii=False) + '\n')
    except Exception as e:
        print(f"Error saving order locally: {e}")

def send_telegram_order(config: dict, table_number: str, items: list) -> dict:
    bot_token = config.get("telegram_bot_token", "").strip()
    chat_id = config.get("telegram_chat_id", "").strip()

    now_str = datetime.now().strftime("%d.%m.%Y в %H:%M:%S")

    order_record = {
        "timestamp": datetime.now().isoformat(),
        "time_formatted": now_str,
        "table": table_number,
        "items": items
    }
    log_order_locally(order_record)

    # Calculate total items
    total_count = sum(item.get("count", 1) for item in items)

    # Format message strictly as requested:
    # стол: (номер) (время)
    # заказ: (заказы)
    time_str = datetime.now().strftime("%H:%M")
    
    dish_list = []
    for it in items:
        name = it.get('dish_name') or format_dish_name(it.get('filename', 'Блюдо'))
        cnt = it.get('count', 1)
        dish_list.append(f"{name} ({cnt} шт.)")

    dishes_text = ", ".join(dish_list)
    message_text = f"стол: {table_number} ({time_str})\nзаказ: {dishes_text}"

    # Check if bot is configured
    if not bot_token or "YOUR_TELEGRAM" in bot_token or not chat_id or "YOUR_TELEGRAM" in chat_id:
        print("\n" + "="*50)
        print("📢 [ТЕСТОВЫЙ РЕЖИМ] Заказ принят и сохранён в orders.jsonl!")
        print(f"Стол: №{table_number}")
        for it in items:
            print(f"- {it.get('dish_name')} x {it.get('count')}")
        print("Для отправки в Telegram укажите telegram_bot_token и telegram_chat_id в config.json")
        print("="*50 + "\n")
        return {
            "success": True,
            "telegram_sent": False,
            "message": "Заказ успешно принят! (Токен Telegram не настроен, заказ сохранён в базе)"
        }

    # Send to Telegram Bot API
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message_text,
        "parse_mode": "HTML"
    }

    try:
        response = requests.post(url, json=payload, timeout=8)
        resp_data = response.json()
        if response.status_code == 200 and resp_data.get("ok"):
            return {
                "success": True,
                "telegram_sent": True,
                "message": "Заказ передан на кухню в группу Telegram!"
            }
        else:
            err_desc = resp_data.get("description", response.text)
            print(f"Telegram API Error: {err_desc}")
            return {
                "success": True,
                "telegram_sent": False,
                "message": f"Заказ принят, но ошибка Telegram: {err_desc}"
            }
    except Exception as e:
        print(f"Connection error to Telegram: {e}")
        return {
            "success": True,
            "telegram_sent": False,
            "message": f"Заказ принят локально (сбой связи с Telegram: {e})"
        }
