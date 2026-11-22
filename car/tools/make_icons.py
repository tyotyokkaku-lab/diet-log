"""car/icon-1024.png から 180 / 192 / 512 のアイコンを作る。

使い方(リポジトリの一番上のフォルダで): python car/tools/make_icons.py
※ GitHub に icon-1024.png をアップロードすれば、自動処理(GitHub Actions)が
  これを実行してくれるので、普段は自分で実行する必要はありません。
"""
from pathlib import Path
from PIL import Image

CAR = Path(__file__).resolve().parent.parent
SRC = CAR / "icon-1024.png"

img = Image.open(SRC)
# 透明な部分があると iPhone では黒くなるので、白い背景に重ねる
if img.mode in ("RGBA", "LA", "P"):
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    img = Image.alpha_composite(bg, img)
img = img.convert("RGB")
# 正方形でなければ中央を切り抜く
w, h = img.size
s = min(w, h)
img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))

for size in (180, 192, 512):
    out = CAR / f"icon-{size}.png"
    img.resize((size, size), Image.LANCZOS).save(out, optimize=True)
    print("作成:", out.relative_to(CAR.parent))
