# Lady Fashion — Internal Order Dashboard

Full Next.js 16 + Supabase dashboard for Lady Fashion clothing brand. Employees add orders from Instagram DMs; admins accept, set delivery dates, ship, and export Excel files.

## Stack

- Next.js 16.2.6
- Supabase (Postgres + Auth)
- Tailwind CSS
- React Hook Form + Zod
- SheetJS (xlsx 0.18.5)

## Roles

- `employee` — adds orders, views own orders only
- `admin` — views all orders, accepts, ships, exports Excel

## Order Status Flow

`new` (جديد) → `preparing` (جاري التجهيز) → `shipped` (مشحون) → `delivered` (تم التسليم) / `cancelled` (ملغي)

- `new`: employee adds order
- `preparing`: admin accepts + sets estimated delivery date
- `shipped`: admin selects shipping company
- `delivered`: admin confirms delivery

## Excel Export Format (RTL)

Matches LadyFashion_Joker.xlsx — 14 columns right-to-left:

حالة الاوردرات | طريقة الدفع | ملاحظات | عدد القطع | الباقي | المبلغ المدفوع | اجمالي | شحن | اجمالي المنتجات | المنتجات | العنوان | رقم موبايل | الاسم | رقم الاوردر

## UI Design System

- **Font:** Cairo (Google Fonts, imported in layout.tsx `<head>`)
- **Background:** `#f5f4f2` (warm off-white)
- **Sidebar:** dark `#111111` background, `#1e1e1e` borders, `bg-pink-700` active links
- **Primary buttons:** `bg-pink-700 hover:bg-pink-800 rounded-lg`
- **Cards:** `bg-white rounded-xl` + `border: 1px solid rgba(0,0,0,0.08)` + `boxShadow: 0 1px 4px rgba(0,0,0,0.04)`
- **Inputs:** `.input-field` class, `border: 1px solid rgba(0,0,0,0.12)`, focus `border-color: #be185d`
- Tailwind config has `brand` color palette extending `pink`

## Setup

1. Create Supabase project → copy URL + anon key to `.env.local`
2. Run `supabase/schema.sql` in Supabase SQL Editor
3. Create user accounts via Supabase Auth dashboard (set `role` in `raw_user_meta_data`)
4. `npm run dev` to start
