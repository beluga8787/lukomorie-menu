import os
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PHOTOS_DIR = os.path.join(BASE_DIR, 'photos')

samples = {
    'meat': [
        ('Стейк_Рибай_на_углях.jpg', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=800&q=80'),
        ('Шашлык_из_баранины.jpg', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80'),
        ('Томленые_ребрышки_барбекю.jpg', 'https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=800&q=80')
    ],
    'fish': [
        ('Семга_на_гриле_с_лимоном.jpg', 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=800&q=80'),
        ('Запеченная_форель_с_травами.jpg', 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=800&q=80'),
        ('Дорадо_с_розмарином.jpg', 'https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=800&q=80')
    ],
    'other': [
        ('Овощи_гриль_с_бальзамиком.jpg', 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80'),
        ('Хачапури_по_аджарски.jpg', 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?w=800&q=80'),
        ('Картофель_по_деревенски.jpg', 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=80')
    ]
}

def setup():
    for cat, items in samples.items():
        cat_dir = os.path.join(PHOTOS_DIR, cat)
        os.makedirs(cat_dir, exist_ok=True)
        for filename, url in items:
            target = os.path.join(cat_dir, filename)
            if not os.path.exists(target):
                try:
                    print(f"Downloading {cat}/{filename}...")
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=12) as response, open(target, 'wb') as out_f:
                        out_f.write(response.read())
                    print(f"OK: {filename}")
                except Exception as e:
                    print(f"Failed {filename}: {e}")

if __name__ == '__main__':
    setup()
    print("Setup completed successfully!")
