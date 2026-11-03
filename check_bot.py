import requests
import json
import os
import sys

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')

with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
    cfg = json.load(f)

token = cfg.get("telegram_bot_token")
current_chat_id = cfg.get("telegram_chat_id")

print("=" * 60)
print(f"🤖 Проверка бота Telegram...")
url_me = f"https://api.telegram.org/bot{token}/getMe"
try:
    me_resp = requests.get(url_me, timeout=10).json()
    if me_resp.get("ok"):
        bot_user = me_resp['result']['username']
        print(f"✅ Бот найден: @{bot_user} ({me_resp['result']['first_name']})")
    else:
        print(f"❌ Ошибка токена: {me_resp}")
        sys.exit(1)
except Exception as e:
    print(f"❌ Ошибка соединения: {e}")
    sys.exit(1)

# Проверяем отправку в текущий chat_id
url_send = f"https://api.telegram.org/bot{token}/sendMessage"
test_msg = "🌲 <b>Ресторан «Лукоморье»</b>\nТестовое сообщение: связь с кухней установлена!"

print(f"\n📡 Пробуем отправить сообщение в текущий Chat ID: {current_chat_id} ...")
resp = requests.post(url_send, json={
    "chat_id": current_chat_id,
    "text": test_msg,
    "parse_mode": "HTML"
}, timeout=10).json()

if resp.get("ok"):
    print(f"🎉 УСПЕХ! Сообщение успешно доставлено в группу!")
else:
    err = resp.get("description", "")
    print(f"⚠️ Не удалось доставить: {err}")
    print("\n🔍 Ищем доступные чаты через getUpdates...")
    updates_resp = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=10).json()
    updates = updates_resp.get("result", [])
    
    found_chats = {}
    for u in updates:
        msg = u.get("message") or u.get("my_chat_member", {}).get("chat")
        if isinstance(msg, dict):
            chat = msg.get("chat") or msg
            cid = str(chat.get("id"))
            title = chat.get("title") or chat.get("username") or "Личный чат"
            found_chats[cid] = title

    if found_chats:
        print("💡 Найдены следующие чаты, где есть бот:")
        for cid, title in found_chats.items():
            print(f"  - Chat ID: {cid} ({title})")
        # Берём первый групповой чат
        group_chats = [cid for cid in found_chats if cid.startswith("-")]
        chosen_id = group_chats[0] if group_chats else list(found_chats.keys())[0]
        cfg["telegram_chat_id"] = chosen_id
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=4)
        print(f"\n✅ Автоматически обновили config.json с Chat ID: {chosen_id}")
        # Пробуем отправить снова
        resp_retry = requests.post(url_send, json={
            "chat_id": chosen_id,
            "text": test_msg,
            "parse_mode": "HTML"
        }, timeout=10).json()
        if resp_retry.get("ok"):
            print("🎉 Сообщение успешно отправлено в найденный чат!")
    else:
        print("\n👉 ЧТО СДЕЛАТЬ СЕЙЧАС:")
        print(f"1. Добавьте бота @{bot_user} в вашу группу «заказы»")
        print("2. Сделайте его Администратором группы")
        print("3. Напишите в группу любое сообщение (например: «привет»)")
        print("4. Запустите этот скрипт снова: py check_bot.py")
print("=" * 60)
