"""Generate the typographic WhatsApp/Open Graph card (Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent.parent
im=Image.new('RGB',(1200,630),'#f8f8f6');d=ImageDraw.Draw(im)
def font(size,bold=False):
    return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',size)
d.text((60,40),'NEZÁVISLÝ FILMOVÝ SPRIEVODCA',font=font(18),fill='#555555')
d.line((60,90,1140,90),fill='#111111',width=2)
d.text((53,115),'DOKU & FILM',font=font(130,True),fill='#111111')
d.text((58,270),'/ BRATISLAVA',font=font(94,True),fill='#111111')
d.line((60,418,1140,418),fill='#111111',width=2)
d.text((60,448),'19. – 25. október 2026',font=font(42),fill='#111111')
d.text((60,550),'Áčko  /  Jeden svet  /  Deň dokumentárneho filmu',font=font(23),fill='#555555')
im.save(root/'assets/share-2026.jpg',quality=90,optimize=True)
