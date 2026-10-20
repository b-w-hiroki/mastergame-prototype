# Image2 Asset Plan

MasterGame の UI から「AI で作った感」を減らすための画像差し替え計画です。まずはモックアップの情報設計を崩さず、画像だけを自然な質感へ置き換えます。

## Direction

- 実写寄り、ただしゲームアプリらしい少し整ったライティングにする
- 過度なネオン、紫グラデーション、抽象的な光の玉を避ける
- 文字入り画像は作らず、テキストはアプリ側で載せる
- 角丸カードに収まる横長画像を基本にする
- UI アイコンは絵文字っぽさを避け、シンプルな単色または小さな物撮り風に寄せる

## First Batch

| Priority | Target | Size | Usage | Prompt Direction |
|---|---:|---|---|---|
| P0 | Home hero banner | 1200x600 | `apps/mobile/app/(tabs)/index.tsx` hero | A natural tabletop scene with a smartphone, game controller, small reward cards, soft daylight, realistic product-photo style, no text |
| P0 | Offer thumbnail | 512x512 | Mission offer cards | Close-up of a mobile game pre-registration card on a phone screen, realistic, clean background, no readable text |
| P1 | News thumbnail | 512x512 | Home news rows | Compact gaming news desk scene, phone and notes, neutral daylight, no text |
| P1 | Points card texture | 1200x600 | Points balance card background | Subtle dark card material with fine grain, premium but restrained, no text, no neon |
| P1 | Exchange item thumbnails | 512x512 | Exchange screen | Realistic digital gift card mockups on neutral background, no brand logos, no text |
| P2 | Empty states | 800x600 | Empty mission/community states | Quiet app illustration with paper cards and phone, hand-drawn but not generic AI, no text |

## File Naming

Generated assets should be stored under:

```text
apps/mobile/assets/generated/
```

Suggested names:

- `home_hero_weekend_boost.png`
- `thumb_offer_preregister.png`
- `thumb_news_digest.png`
- `texture_points_card.png`
- `thumb_exchange_game_code.png`
- `empty_missions.png`

## App Wiring Notes

- Current mobile screens show demo data when Supabase auth/config is not available.
- Image slots currently render through `VisualSlot`, a neutral in-app stand-in used until generated assets are available.
- Canonical asset keys and filenames are listed in `apps/mobile/src/lib/generatedAssets.ts`.
- Replace placeholders with `Image` components after the files above are generated.
- Keep demo data useful enough for screenshots; real Supabase data should override it whenever the user is signed in.

## Acceptance Checklist

- No visible malformed hands, fake letters, broken UI text, or unreadable brand-like marks
- Subject is immediately recognizable at mobile card size
- Image works under a dark-to-transparent overlay when used as a banner
- Color palette stays close to the current app: off-white, charcoal, muted indigo, restrained gold
- Does not look like generic fantasy game key art unless the screen explicitly needs it
