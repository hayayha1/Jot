from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
output = root / 'assets'
output.mkdir(exist_ok=True)
scale = 4
image = Image.new('RGBA', (256 * scale, 256 * scale))
draw = ImageDraw.Draw(image)
def box(coords): return tuple(round(x * scale) for x in coords)
draw.rounded_rectangle(box((4, 4, 252, 252)), radius=55*scale, fill='#7d8e6c')
draw.rounded_rectangle(box((64, 53, 193, 207)), radius=12*scale, fill='#f8faef')
draw.rectangle(box((79, 58, 85, 199)), fill='#dce5cf')
draw.rounded_rectangle(box((99, 85, 166, 92)), radius=3*scale, fill='#93a780')
draw.rounded_rectangle(box((99, 111, 155, 118)), radius=3*scale, fill='#b5c5a3')
draw.rounded_rectangle(box((99, 137, 162, 144)), radius=3*scale, fill='#b5c5a3')
draw.line(box((65, 181, 192, 181)), fill='#dce5cf', width=5*scale)
image.resize((256, 256), Image.Resampling.LANCZOS).save(output / 'icon.png')
image.save(output / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('Created application icons')
