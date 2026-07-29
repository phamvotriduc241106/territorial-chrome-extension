import os
from PIL import Image, ImageDraw

def create_icon(size, filename):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Background rounded rect simulation
    margin = int(size * 0.05)
    rect = [margin, margin, size - margin, size - margin]
    
    # Fill with deep slate blue
    draw.ellipse(rect, fill=(15, 23, 42, 255), outline=(129, 140, 248, 255), width=max(1, int(size * 0.06)))
    
    # Draw sword / crosshair in center
    cx, cy = size // 2, size // 2
    r = int(size * 0.25)
    
    # Inner glowing dot
    draw.ellipse([cx - r//2, cy - r//2, cx + r//2, cy + r//2], fill=(99, 102, 241, 255))
    
    # Crosshair lines
    line_w = max(1, int(size * 0.08))
    draw.line([cx - r*1.3, cy, cx + r*1.3, cy], fill=(168, 85, 247, 255), width=line_w)
    draw.line([cx, cy - r*1.3, cx, cy + r*1.3], fill=(168, 85, 247, 255), width=line_w)
    
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    img.save(filename, 'PNG')
    print(f"Generated icon: {filename}")

create_icon(16, "icons/icon16.png")
create_icon(48, "icons/icon48.png")
create_icon(128, "icons/icon128.png")
