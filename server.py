import os
import sys
import urllib.parse
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional

# Safe console output for Windows cp1251/866
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from config import load_config, save_config
from bot_service import send_telegram_order, format_dish_name

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PHOTOS_DIR = os.path.join(BASE_DIR, 'photos')
STATIC_DIR = os.path.join(BASE_DIR, 'static')

app = FastAPI(title="Лукоморье - Меню ресторана")

VALID_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.svg'}

class OrderItem(BaseModel):
    id: Optional[str] = None
    filename: str
    dish_name: Optional[str] = None
    category: str
    count: int = 1
    image_url: Optional[str] = None

class OrderRequest(BaseModel):
    table: str
    items: List[OrderItem]

@app.get("/api/config")
def get_public_config():
    cfg = load_config()
    return {
        "wifi_names": cfg.get("wifi_names", ["Лукоморие", "Лукоморие_5G"]),
        "enforce_wifi_modal": cfg.get("enforce_wifi_modal", True),
        "is_bot_configured": bool(
            cfg.get("telegram_bot_token") and "YOUR_TELEGRAM" not in cfg.get("telegram_bot_token")
        )
    }

@app.get("/api/menu")
def get_menu():
    """Scans photos/meat, photos/fish, photos/other and builds menu items."""
    categories = [
        {"key": "all", "title": "Все блюда", "icon": "🍽️"},
        {"key": "fish", "title": "Рыбное", "icon": "🐟"},
        {"key": "meat", "title": "Мясное", "icon": "🥩"},
        {"key": "other", "title": "Прочее", "icon": "🥗"}
    ]

    items = []
    
    subfolders = ["meat", "fish", "other"]
    for cat in subfolders:
        cat_path = os.path.join(PHOTOS_DIR, cat)
        if not os.path.isdir(cat_path):
            os.makedirs(cat_path, exist_ok=True)
            continue

        for fname in os.listdir(cat_path):
            ext = os.path.splitext(fname)[1].lower()
            if ext in VALID_EXTENSIONS:
                item_id = f"{cat}_{fname}"
                clean_name = format_dish_name(fname)
                # URL encode filename for safe web loading
                encoded_fname = urllib.parse.quote(fname)
                img_url = f"/photos/{cat}/{encoded_fname}"
                items.append({
                    "id": item_id,
                    "category": cat,
                    "filename": fname,
                    "dish_name": clean_name,
                    "image_url": img_url
                })

    return {
        "categories": categories,
        "items": items
    }

@app.post("/api/order")
def make_order(order: OrderRequest):
    table = str(order.table).strip()
    if not table:
        raise HTTPException(status_code=400, detail="Номер стола не указан! Заказ не может быть оформлен.")
    
    if not order.items:
        raise HTTPException(status_code=400, detail="Корзина пуста. Добавьте блюда для заказа.")

    cfg = load_config()
    items_dicts = []
    for it in order.items:
        items_dicts.append({
            "id": it.id,
            "filename": it.filename,
            "dish_name": it.dish_name or format_dish_name(it.filename),
            "category": it.category,
            "count": max(1, it.count),
            "image_url": it.image_url
        })

    result = send_telegram_order(cfg, table, items_dicts)
    return result

@app.post("/api/test-telegram")
def test_telegram():
    cfg = load_config()
    test_items = [
        {"dish_name": "Тестовое блюдо (Стейк Рибай)", "category": "meat", "count": 1, "filename": "test.jpg"}
    ]
    res = send_telegram_order(cfg, "ТЕСТ", test_items)
    return res

# Static files
app.mount("/photos", StaticFiles(directory=PHOTOS_DIR), name="photos")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

# Support /1, /2, /3 etc. direct routes
@app.get("/{table_id:int}")
def serve_table(table_id: int):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    cfg = load_config()
    port = int(os.environ.get("PORT", cfg.get("port", 8000)))
    host = cfg.get("host", "0.0.0.0")
    print(f"🌲 Ресторан Лукоморье запущен на http://localhost:{port}")
    uvicorn.run("server:app", host=host, port=port, reload=True)
