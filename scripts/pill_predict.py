#!/usr/bin/env python3
import json
import math
import os
import sys
import unicodedata
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps
from skimage.feature import local_binary_pattern

IMG_SIZE = 224
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
OCR_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz가나다라마바사아자차카타파하-_/."
CHAR_TO_IDX = {char: index for index, char in enumerate(OCR_CHARS)}

DISPLAY_NAME_MAP = {
    "아세트아미노펜": "타이레놀정500",
    "레비에필정100": "레비에필정1000",
}



def main():
    if len(sys.argv) < 2:
        raise RuntimeError("이미지 경로가 필요합니다.")

    image_path = Path(sys.argv[1])
    app_root = Path(__file__).resolve().parents[1]
    model_path = resolve_model_path(app_root)
    cache_dir = Path(os.getenv("PILL_CACHE_DIR", app_root / "pill_cache"))
    device = os.getenv("PILL_DEVICE", "cpu")

    import torch

    checkpoint = torch.load(model_path, map_location=device, weights_only=False)
    classes = [norm_text(label) for label in labels_from_checkpoint(checkpoint, cache_dir)]
    feature_mean = np.load(cache_dir / "feature_mean.npy").astype(np.float32)
    feature_scale = np.load(cache_dir / "feature_scale.npy").astype(np.float32)
    feature_scale = np.where(feature_scale == 0, 1.0, feature_scale)
    class_profile_map = load_class_profile_map(cache_dir)

    model = build_model(
        num_classes=len(classes),
        feature_dim=int(checkpoint.get("feature_dim", len(feature_mean))),
        device=device,
    )
    model.load_state_dict(checkpoint["model"])
    model.eval().to(device)

    image_tensor, feat_tensor, cutout, alpha = preprocess_one_image(
        image_path=image_path,
        feature_mean=feature_mean,
        feature_scale=feature_scale,
    )
    detected_form, _ = infer_form_from_alpha(alpha)
    test_lab = get_image_mean_lab(cutout, alpha)

    with torch.inference_mode():
        logits = model(
            torch.from_numpy(image_tensor).unsqueeze(0).to(device),
            torch.from_numpy(feat_tensor).unsqueeze(0).to(device),
        )[0]
        raw_probs = torch.softmax(logits, dim=0).detach().cpu().numpy()

    rows = []
    for index, name in enumerate(classes):
        info = class_profile_map.get(name)
        if info is None:
            continue

        if detected_form != "unknown" and info["form"] != detected_form:
            continue

        color_score = color_similarity_score(test_lab, info["mean_lab"])
        model_score = float(raw_probs[index])
        final_score = 0.20 * model_score + 0.80 * color_score
        rows.append({"index": index, "label": name, "score": final_score})

    if not rows:
        rows = [
            {"index": int(index), "label": classes[int(index)], "score": float(raw_probs[int(index)])}
            for index in np.argsort(raw_probs)[::-1][:3]
        ]

    rows = sorted(rows, key=lambda row: row["score"], reverse=True)[:3]
    score_sum = sum(row["score"] for row in rows)
    predictions = []
    for rank, row in enumerate(rows, start=1):
        confidence = row["score"] / score_sum if score_sum > 0 else 0.0
        predictions.append({
            "rank": rank,
            "label": display_name(row["label"]),
            "rawLabel": row["label"],
            "confidence": float(confidence),
        })

    print(json.dumps({"predictions": predictions}, ensure_ascii=False))


def resolve_model_path(app_root):
    model_path = Path(os.getenv("PILL_MODEL_PATH", app_root / "best_pill_model.pt"))
    if model_path.exists():
        return model_path

    model_url = os.getenv("PILL_MODEL_URL", "").strip()
    if not model_url:
        raise FileNotFoundError(
            f"모델 파일을 찾지 못했습니다: {model_path}. "
            "Render에서는 PILL_MODEL_URL 또는 Render에서 접근 가능한 PILL_MODEL_PATH를 설정하세요."
        )

    download_dir = Path(os.getenv("PILL_MODEL_DOWNLOAD_DIR", "/tmp/pill-models"))
    download_dir.mkdir(parents=True, exist_ok=True)
    target = download_dir / "best_pill_model.pt"
    if not target.exists() or target.stat().st_size == 0:
        urllib.request.urlretrieve(model_url, target)
    return target


def build_model(num_classes, feature_dim, device):
    import torch
    import torch.nn as nn
    import timm

    class PillMultiFeatureModel(nn.Module):
        def __init__(self):
            super().__init__()
            self.backbone = timm.create_model("convnext_tiny", pretrained=False, num_classes=0)
            image_dim = self.backbone.num_features
            self.feature_mlp = nn.Sequential(
                nn.Linear(feature_dim, 128),
                nn.BatchNorm1d(128),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(128, 64),
                nn.ReLU(),
            )
            self.classifier = nn.Sequential(
                nn.Linear(image_dim + 64, 256),
                nn.ReLU(),
                nn.Dropout(0.15),
                nn.Linear(256, num_classes),
            )

        def forward(self, image, feat):
            image_feat = self.backbone(image)
            extra_feat = self.feature_mlp(feat)
            return self.classifier(torch.cat([image_feat, extra_feat * 4.0], dim=1))

    return PillMultiFeatureModel().to(device)


def preprocess_one_image(image_path, feature_mean, feature_scale):
    from rembg import new_session, remove

    img = Image.open(image_path)
    img = ImageOps.exif_transpose(img).convert("RGBA")
    model_name = os.getenv("REMBG_MODEL", "isnet-general-use")
    cutout = remove(img, session=new_session(model_name)).convert("RGBA")

    if cutout.size != img.size:
        cutout = cutout.resize(img.size, Image.Resampling.LANCZOS)

    alpha = cutout.getchannel("A")
    rgb_for_features = pil_to_rgb_np(cutout)
    mask = np.array(alpha)
    pattern_feat = imprint_pattern_features(cutout, alpha)
    base_feat = extract_all_features(
        rgb_for_features,
        mask,
        reader=None,
        expected_base_dim=len(feature_mean) - len(pattern_feat),
    )
    feat = np.concatenate([base_feat, pattern_feat]).astype(np.float32)
    feat = ((feat - feature_mean) / feature_scale).astype(np.float32)

    bg = Image.new("RGBA", cutout.size, (0, 0, 0, 255))
    bg.alpha_composite(cutout)
    rgb = np.array(bg.convert("RGB"))
    image_tensor = prepare_image_tensor(rgb)

    return image_tensor, feat, cutout, alpha


def prepare_image_tensor(rgb):
    resized = cv2.resize(rgb, (IMG_SIZE, IMG_SIZE), interpolation=cv2.INTER_LINEAR)
    arr = resized.astype(np.float32) / 255.0
    arr = (arr - IMAGENET_MEAN) / IMAGENET_STD
    return np.transpose(arr, (2, 0, 1)).astype(np.float32)


def pil_to_rgb_np(img):
    return np.array(img.convert("RGB"))


def enhance_for_imprint(rgb):
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blur = cv2.GaussianBlur(enhanced, (0, 0), 3)
    return cv2.addWeighted(enhanced, 1.8, blur, -0.8, 0)


def lab_hist_features(rgb, mask, bins=16):
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    valid = mask > 10
    feats = []
    for channel in range(3):
        values = lab[:, :, channel][valid]
        if len(values) == 0:
            hist = np.zeros(bins, dtype=np.float32)
        else:
            hist, _ = np.histogram(values, bins=bins, range=(0, 256), density=True)
            hist = hist.astype(np.float32)
        feats.append(hist)
    return np.concatenate(feats)


def shape_features(mask):
    binary = (mask > 20).astype(np.uint8) * 255
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return np.zeros(10, dtype=np.float32)

    cnt = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(cnt))
    perimeter = float(cv2.arcLength(cnt, True)) + 1e-6
    _, _, width, height = cv2.boundingRect(cnt)
    rect_area = float(width * height) + 1e-6
    hull = cv2.convexHull(cnt)
    hull_area = float(cv2.contourArea(hull)) + 1e-6
    image_area = float(mask.shape[0] * mask.shape[1]) + 1e-6
    circularity = 4.0 * math.pi * area / (perimeter * perimeter)
    aspect_ratio = width / (height + 1e-6)
    extent = area / rect_area
    solidity = area / hull_area

    if len(cnt) >= 5:
        (_, _), (major, minor), angle = cv2.fitEllipse(cnt)
        ellipse_ratio = min(major, minor) / (max(major, minor) + 1e-6)
        angle = angle / 180.0
    else:
        ellipse_ratio = 0.0
        angle = 0.0

    return np.array([
        area / image_area,
        perimeter / math.sqrt(image_area),
        aspect_ratio,
        circularity,
        extent,
        solidity,
        ellipse_ratio,
        angle,
        width / mask.shape[1],
        height / mask.shape[0],
    ], dtype=np.float32)


def lbp_features(rgb, mask, bins=16):
    gray = enhance_for_imprint(rgb)
    lbp = local_binary_pattern(gray, P=8, R=1, method="uniform")
    values = lbp[mask > 10]
    if len(values) == 0:
        return np.zeros(bins, dtype=np.float32)
    hist, _ = np.histogram(values, bins=bins, range=(0, bins), density=True)
    return hist.astype(np.float32)


def ocr_vector(_enhanced_gray, reader=None, length=None):
    vec = np.zeros(length or (len(OCR_CHARS) + 2), dtype=np.float32)
    if reader is None:
        return vec
    try:
        results = reader.readtext(_enhanced_gray, detail=1, paragraph=False)
    except Exception:
        return vec

    total_conf = 0.0
    for _, text, conf in results:
        total_conf += float(conf)
        for char in text:
            if char in CHAR_TO_IDX and CHAR_TO_IDX[char] < len(vec) - 2:
                vec[CHAR_TO_IDX[char]] += 1.0
    if vec[:-2].sum() > 0:
        vec[:-2] /= vec[:-2].sum()
    vec[-2] = len(results)
    vec[-1] = total_conf / max(len(results), 1)
    return vec


def extract_all_features(rgb, mask, reader=None, expected_base_dim=None):
    enhanced = enhance_for_imprint(rgb)
    lab = lab_hist_features(rgb, mask)
    shape = shape_features(mask)
    lbp = lbp_features(rgb, mask)
    ocr_len = len(OCR_CHARS) + 2
    if expected_base_dim is not None:
        ocr_len = max(int(expected_base_dim) - len(lab) - len(shape) - len(lbp), 0)
    return np.concatenate([
        lab,
        shape,
        lbp,
        ocr_vector(enhanced, reader, length=ocr_len),
    ]).astype(np.float32)


def imprint_pattern_features(cutout, alpha):
    gray = np.array(cutout.convert("L"))
    mask = np.array(alpha) > 20
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return np.zeros(8, dtype=np.float32)

    crop = gray[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    crop_mask = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    blur = cv2.GaussianBlur(crop, (0, 0), 9)
    detail = cv2.absdiff(crop, blur)
    detail[~crop_mask] = 0
    _, th = cv2.threshold(detail, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    th = cv2.morphologyEx(th, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    height, width = th.shape

    vertical_bins = [
        th[:, :width // 3].mean(),
        th[:, width // 3:2 * width // 3].mean(),
        th[:, 2 * width // 3:].mean(),
    ]
    horizontal_bins = [
        th[:height // 3, :].mean(),
        th[height // 3:2 * height // 3, :].mean(),
        th[2 * height // 3:, :].mean(),
    ]
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(5, width // 4), 2))
    long_h = cv2.morphologyEx(th, cv2.MORPH_OPEN, horizontal_kernel).mean()

    num_labels, _, stats, _ = cv2.connectedComponentsWithStats(th.astype(np.uint8))
    comps = sum(1 for i in range(1, num_labels) if stats[i, cv2.CC_STAT_AREA] > 10)

    return np.array([*vertical_bins, *horizontal_bins, long_h, comps], dtype=np.float32)


def get_image_mean_lab(cutout, alpha):
    rgb = np.array(cutout.convert("RGB"))
    mask = np.array(alpha)
    valid = mask > 20
    if valid.sum() == 0:
        return np.array([0, 0, 0], dtype=np.float32)
    return rgb_to_lab_mean(rgb[valid]).astype(np.float32)


def load_class_profile_map(cache_dir):
    profiles_path = cache_dir / "class_profiles.json"
    if profiles_path.exists():
        data = json.loads(profiles_path.read_text(encoding="utf-8"))
        return {
            norm_text(label): {
                "form": value["form"],
                "mean_ellipse_ratio": float(value["mean_ellipse_ratio"]),
                "mean_lab": np.array(value["mean_lab"], dtype=np.float32),
            }
            for label, value in data.items()
        }
    return build_class_profile_map(cache_dir / "features.jsonl")


def build_class_profile_map(features_path):
    profile = {}
    groups = {}
    with open(features_path, encoding="utf-8") as file:
        for line in file:
            row = json.loads(line)
            groups.setdefault(norm_text(row["label"]), []).append(row)

    for label, rows in groups.items():
        ellipse_vals = []
        lab_vals = []
        for row in rows:
            feat = np.array(row["feature"], dtype=np.float32)
            ellipse_vals.append(float(feat[48 + 6]))
            img = Image.open(row["cutout_path"]).convert("RGBA")
            mask = np.array(Image.open(row["mask_path"]).convert("L"))
            rgb = np.array(img.convert("RGB"))
            valid = mask > 20
            if valid.sum() == 0:
                continue
            lab_vals.append(rgb_to_lab_mean(rgb[valid]))

        if not lab_vals:
            continue
        mean_ellipse = float(np.mean(ellipse_vals))
        profile[label] = {
            "form": "tablet" if mean_ellipse >= 0.85 else "softgel",
            "mean_ellipse_ratio": mean_ellipse,
            "mean_lab": np.mean(lab_vals, axis=0).astype(np.float32),
        }
    return profile


def rgb_to_lab_mean(rgb_values):
    rgb = rgb_values.astype(np.float32) / 255.0
    linear_mask = rgb > 0.04045
    rgb = np.where(linear_mask, ((rgb + 0.055) / 1.055) ** 2.4, rgb / 12.92)
    xyz = rgb @ np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ], dtype=np.float32).T
    xyz = xyz / np.array([0.95047, 1.0, 1.08883], dtype=np.float32)
    eps = 216 / 24389
    kappa = 24389 / 27
    f = np.where(xyz > eps, np.cbrt(xyz), (kappa * xyz + 16) / 116)
    lab = np.empty_like(f)
    lab[:, 0] = 116 * f[:, 1] - 16
    lab[:, 1] = 500 * (f[:, 0] - f[:, 1])
    lab[:, 2] = 200 * (f[:, 1] - f[:, 2])
    return lab.mean(axis=0)


def infer_form_from_alpha(alpha):
    shape = shape_features(np.array(alpha))
    ellipse_ratio = float(shape[6])
    if ellipse_ratio >= 0.85:
        return "tablet", ellipse_ratio
    if ellipse_ratio <= 0.80:
        return "softgel", ellipse_ratio
    return "unknown", ellipse_ratio


def color_similarity_score(test_lab, class_lab):
    dist = np.linalg.norm(test_lab.astype(np.float32) - class_lab.astype(np.float32))
    return float(np.exp(-dist / 35.0))


def labels_from_checkpoint(checkpoint, cache_dir):
    labels = checkpoint.get("classes")
    if isinstance(labels, (list, tuple)):
        return [norm_text(label) for label in labels]

    classes_path = cache_dir / "classes.json"
    if classes_path.exists():
        data = json.loads(classes_path.read_text(encoding="utf-8"))
        idx_to_class = data.get("idx_to_class", {})
        return [norm_text(idx_to_class[str(index)]) for index in range(len(idx_to_class))]

    return []


def display_name(value):
    normalized = norm_text(value)
    return DISPLAY_NAME_MAP.get(normalized, normalized)


def norm_text(value):
    return unicodedata.normalize("NFC", str(value))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
