from PIL import Image, ImageDraw
from pathlib import Path

root = Path(__file__).resolve().parent.parent
build = root / "build"
build.mkdir(exist_ok=True)
resources = root / "resources"
resources.mkdir(exist_ok=True)

scale = 4
size = 1024
canvas = Image.new("RGBA", (size * scale, size * scale), (0, 0, 0, 0))
d = ImageDraw.Draw(canvas)
s = size * scale
margin = int(s * 0.055)
radius = int(s * 0.22)
d.rounded_rectangle((margin, margin, s - margin, s - margin), radius=radius, fill=(63, 107, 82, 255))
d.rounded_rectangle((margin + int(s * 0.012), margin + int(s * 0.012), s - margin - int(s * 0.012), s - margin - int(s * 0.012)), radius=int(radius * 0.95), fill=(72, 118, 91, 255))
# page
left, top, right, bottom = int(s * 0.285), int(s * 0.23), int(s * 0.715), int(s * 0.77)
fold = int(s * 0.12)
d.rounded_rectangle((left, top, right, bottom), radius=int(s * 0.035), fill=(251, 248, 241, 255))
# folded corner overlay in top right
d.polygon([(right - fold, top), (right, top), (right, top + fold)], fill=(201, 220, 205, 255))
d.line([(right - fold, top), (right - fold, top + fold), (right, top + fold)], fill=(63, 107, 82, 80), width=int(s * 0.006))
# text lines
line_color = (63, 107, 82, 230)
for i, width in enumerate([0.28, 0.28, 0.19]):
    y = int(s * (0.47 + i * 0.09))
    d.rounded_rectangle((int(s * 0.36), y, int(s * (0.36 + width)), y + int(s * 0.028)), radius=int(s * 0.014), fill=line_color)
# small accent dot
d.ellipse((int(s * 0.62), int(s * 0.63), int(s * 0.66), int(s * 0.67)), fill=(63, 107, 82, 255))

icon = canvas.resize((size, size), Image.LANCZOS)
icon.save(resources / "icon.png")
icon.save(build / "icon.png")
icon.save(
    build / "icon.ico",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print("icons written")
