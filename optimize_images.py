"""Create delivery images without modifying originals.

Run manually with Python and Pillow >= 12 (AVIF/WebP support):
    python scripts/optimize_images.py
No image processing or Python is needed for Vercel deployment.
"""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import json

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'assets' / 'images'
PHOTOS = {
    'portrait': ('1.jpg', (320, 480, 768, 1080, 1600)),
    'clinical-work': ('Фото 2.jpg', (320, 480, 768, 1080, 1600, 1920)),
    'scanner-setup': ('Фото 3.JPG', (320, 480, 768, 1080, 1600, 1920)),
    'echocardiography': ('Фото 4.JPG', (320, 480, 768, 1080, 1600, 1920)),
    'electrocardiography': ('Фото 5.JPG', (320, 480, 768, 1080, 1600, 1920)),
}


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def normalized_image(path):
    with Image.open(path) as source:
        # Apply EXIF rotation before stripping metadata. Avoid double rotation in browsers.
        image = ImageOps.exif_transpose(source)
        profile = source.info.get('icc_profile')
        if profile:
            image = ImageCms.profileToProfile(
                image,
                ImageCms.ImageCmsProfile(BytesIO(profile)),
                ImageCms.createProfile('sRGB'),
                outputMode='RGB',
            )
        else:
            image = image.convert('RGB')
        image.info.clear()  # Do not ship GPS, camera metadata, or embedded thumbnails.
        return image


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {'formats': {'avif_quality': 67, 'webp_quality': 89, 'jpeg_quality': 90}, 'images': {}}
    original_hashes = {}

    for name, (filename, widths) in PHOTOS.items():
        source = ROOT / filename
        original_hashes[filename] = digest(source)
        image = normalized_image(source)
        record = {
            'source': filename,
            'original_bytes': source.stat().st_size,
            'original_sha256': original_hashes[filename],
            'oriented_size': list(image.size),
            'variants': [],
        }
        for width in widths:
            height = round(image.height * width / image.width)
            resized = image.resize((width, height), Image.Resampling.LANCZOS)
            for extension, options in (
                ('avif', {'quality': 67, 'speed': 6, 'subsampling': '4:4:4'}),
                ('webp', {'quality': 89, 'method': 6}),
            ):
                target = OUTPUT / f'{name}-{width}.{extension}'
                resized.save(target, **options)
                record['variants'].append({'file': target.relative_to(ROOT).as_posix(), 'width': width, 'height': height, 'bytes': target.stat().st_size})
            # One modest JPEG fallback per photo; modern browsers choose picture sources.
            if width == 1080:
                target = OUTPUT / f'{name}-1080.jpg'
                resized.save(target, quality=90, optimize=True, progressive=True)
                record['fallback'] = {'file': target.relative_to(ROOT).as_posix(), 'bytes': target.stat().st_size}
        manifest['images'][name] = record
        print(f'{name}: {source.stat().st_size:,} original bytes; delivery images created', flush=True)

    # Keep the exact full-logo framing used by the existing header CSS.
    logo_path = ROOT / 'Логотип.png'
    original_hashes[logo_path.name] = digest(logo_path)
    logo = normalized_image(logo_path)
    resized_logo = logo.resize((768, round(logo.height * 768 / logo.width)), Image.Resampling.LANCZOS)
    logo_target = OUTPUT / 'brand-768.webp'
    resized_logo.save(logo_target, quality=95, method=6)
    # Reuse the supplied emblem, removing only its empty outer margins for the tab icon.
    favicon = logo.crop((560, 190, 1112, 742)).resize((64, 64), Image.Resampling.LANCZOS)
    favicon_target = OUTPUT / 'favicon.webp'
    favicon.save(favicon_target, lossless=True, method=6)
    manifest['logo'] = {
        'source': logo_path.name,
        'original_bytes': logo_path.stat().st_size,
        'original_sha256': original_hashes[logo_path.name],
        'file': logo_target.relative_to(ROOT).as_posix(),
        'bytes': logo_target.stat().st_size,
        'favicon': favicon_target.relative_to(ROOT).as_posix(),
        'favicon_bytes': favicon_target.stat().st_size,
    }
    for filename, original_hash in original_hashes.items():
        if digest(ROOT / filename) != original_hash:
            raise RuntimeError(f'Original was unexpectedly modified: {filename}')

    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Original SHA-256 hashes unchanged. Manifest saved.', flush=True)
    print(f'Logo: {manifest["logo"]["original_bytes"]:,} -> {manifest["logo"]["bytes"]:,} bytes; favicon: {manifest["logo"]["favicon_bytes"]:,} bytes', flush=True)


if __name__ == '__main__':
    main()
