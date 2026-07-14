# جمع‌بندی بررسی TradeLog

## وضعیت فعلی

- پروژه یک ژورنال آفلاین ترید بر پایه Expo / React Native و SQLite است.
- امکانات اصلی: آنبوردینگ فارسی/انگلیسی، ثبت/ویرایش/بستن معامله، داشبورد، آنالیتیکس، محاسبه حجم، ورود CSV از MT4/MT5/Binance، خروجی CSV/PDF، پشتیبان JSON همراه تصاویر و نوتیفیکیشن محلی.
- ۱۵ تست واحد موجود پاس می‌شوند و TypeScript strict بدون خطا است.

## علت شکست GitHub Actions

Build در مرحله `mergeDebugNativeLibs` با `No space left on device` متوقف شده است. CI چهار ABI را هم‌زمان می‌ساخت و دو NDK جداگانه نصب شد. هشدارهای deprecated علت شکست نیستند.

## اصلاحات این نسخه

- آدرس‌های registry داخلی از `package-lock.json` حذف و با npm عمومی جایگزین شدند.
- `.npmrc` برای registry عمومی و نصب ثابت اضافه شد.
- Workflow از `npm ci` استفاده می‌کند.
- Workflow به‌جای debug، یک Release APK مستقل و امضاشده می‌سازد.
- build در CI فقط `arm64-v8a` است، parallelism محدود شده و فضای runner قبل از build آزاد می‌شود.
- نام secretها و راهنمای GitHub با `android/app/build.gradle` هماهنگ شده‌اند.

## کارهای بعدی

1. Secretهای Keystore را در GitHub اضافه و Workflow را اجرا کنید.
2. APK را روی یک گوشی واقعی نصب و سناریوهای `TESTING_CHECKLIST.md` را انجام دهید.
3. `react-native-svg` را با نسخه پیشنهادی Expo هم‌تراز و lockfile را دوباره تولید کنید.
4. تست migration/restore دیتابیس، import واقعی CSV و تست UI اضافه کنید.
5. برای Google Play یک Workflow جدا برای AAB، versionCode افزایشی و release notes بسازید.
6. درباره رمزگذاری دیتابیس و فایل‌های backup تصمیم محصول بگیرید؛ در وضعیت فعلی backup فایل JSON خوانا است.
