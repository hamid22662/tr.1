# ساخت APK مستقل و امضاشده در GitHub Actions

Workflow پروژه با نام **Validate and build TradeLog Android release** یک APK نسخه Release می‌سازد که JavaScript را داخل برنامه دارد و بدون Metro یا Expo Go اجرا می‌شود.

## Secretهای لازم

در مسیر **Settings → Secrets and variables → Actions** این چهار Secret را بسازید:

- `ANDROID_KEYSTORE_BASE64`: محتوای Base64 فایل Upload Keystore
- `ANDROID_STORE_PASSWORD`: رمز Keystore
- `ANDROID_KEY_ALIAS`: Alias کلید
- `ANDROID_KEY_PASSWORD`: رمز کلید

هیچ فایل `.jks`، `.keystore`، `.env` یا `credentials.json` را داخل repository قرار ندهید.

## اجرا

1. فایل‌ها را در ریشهٔ repository قرار دهید.
2. وارد تب **Actions** شوید.
3. Workflow با نام **Validate and build TradeLog Android release** را باز کنید.
4. **Run workflow** را اجرا کنید.
5. پس از موفقیت، از بخش **Artifacts** فایل `TradeLog-installable-APK-*` را دانلود کنید.

خروجی فعلی فقط برای معماری `arm64-v8a` ساخته می‌شود تا مصرف دیسک CI پایین بماند. این معماری روی اغلب گوشی‌های اندرویدی مدرن قابل نصب است. برای پشتیبانی از گوشی‌های ۳۲بیتی قدیمی، مقدار build را به `arm64-v8a,armeabi-v7a` تغییر دهید.

## نکات فنی

- نصب وابستگی‌ها با `npm ci` و lockfile عمومی و ثابت انجام می‌شود.
- build از `assembleRelease` استفاده می‌کند؛ `assembleDebug` برای اجرای JavaScript به Metro نیاز دارد.
- Keystore فقط در پوشهٔ موقت runner ساخته و در پایان، حتی هنگام خطا، حذف می‌شود.
- برای انتشار در Google Play باید یک Workflow جداگانه برای `bundleRelease` و خروجی AAB اضافه شود.
